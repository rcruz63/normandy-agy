/**
 * Coordinador de Tiradas de dados de la capa de aplicación (Tarea 20.1,
 * diseño §3, requisito 41).
 *
 * El `DiceRollCoordinator` es la SEGUNDA fase del contrato de Tirada en dos
 * fases. El Motor puro (`RulesEngine.decide`) declara una {@link DiceRollRequest}
 * (`awaiting-roll`) sin consumir aleatoriedad; la Interfaz recoge la elección
 * del Jugador ({@link DiceRollInput}) y el Coordinador:
 *
 * 1. **Automático** (diseño §3.2, req. 41.8): reserva UNA vez el siguiente paso
 *    programático mediante el puerto {@link VersionedRandom}, adopta sus caras
 *    como `effectiveFaces`, conserva el siguiente `RandomState` y confirma el
 *    Consumo con `source="automatic"` y esas mismas caras en `rawResult`.
 * 2. **Manual** (diseño §3.3-3.4, req. 41.9-41.14): valida que existan
 *    exactamente `count` caras, en orden, cada una entera en `1..sides`. Si la
 *    entrada es inválida devuelve `invalid-roll-input` SIN invocar `next` ni
 *    tocar el Estado aleatorio (req. 41.10). Con entrada válida reserva EL MISMO
 *    paso que Automático (misma posición, mismo siguiente Estado, mismo
 *    identificador de Consumo; req. 41.11, 41.12), descarta las caras
 *    programáticas y construye `effectiveFaces` con las caras físicas
 *    ordenadas; el Consumo conserva `source="manual"` y esas caras físicas en
 *    `rawResult` (req. 41.13, 41.14).
 * 3. **Interpretación** (diseño §3.5, req. 41.23, 41.24): entrega la
 *    {@link DiceRollResolution} al Motor mediante `RulesEngine.resumeRoll`, que
 *    verifica identidad/Partida/Instantánea/contexto y uso único, interpreta las
 *    caras efectivas mediante las reglas canónicas y produce la
 *    {@link TransitionDecision} confirmable. El Coordinador no calcula tablas,
 *    umbrales ni efectos.
 *
 * TODAS las Tiradas actuales y futuras con `RandomDomain.kind === "dice"`
 * (activación/órdenes, combate, Revelado, Minas, Artillería) se canalizan por
 * este único contrato; ni la Interfaz ni los submódulos generan caras ad hoc
 * (req. 41.4, 41.34). La confirmación transaccional del efecto, los registros y
 * el Estado aleatorio reservado la realiza la unidad de trabajo
 * ({@link ../games/game-command-dispatcher.js}) a partir de la decisión
 * `accepted` que devuelve este Coordinador.
 *
 * FRONTERA DE CAPAS Y PUREZA: vive en `application/`. Usa el puerto
 * {@link VersionedRandom} y el Motor puro; NO importa DOM, IndexedDB, red, reloj
 * (`Date`) ni SDK de AWS, y NUNCA usa `Math.random`. Es determinista y no muta
 * sus argumentos: reserva la aleatoriedad a través del puerto inyectado.
 */
import type { GameSnapshot } from "../../domain/engine/state.js";
import type {
  DiceRollInput,
  DiceRollRequest,
  DiceRollRequestId,
  DiceRollResolution,
} from "../../domain/engine/dice-roll.js";
import { resolutionMatchesRequest } from "../../domain/engine/dice-roll.js";
import type {
  RulesCatalogView,
  RulesEngineView,
} from "../../domain/engine/rules-engine.js";
import type {
  DomainMessage,
  TransitionDecision,
} from "../../domain/engine/transition.js";
import type {
  RandomConsumption,
  RandomRequest,
  RandomState,
  VersionedRandomMachine,
} from "../../domain/random/index.js";

/**
 * Diagnóstico estructurado de una entrada manual inválida (`invalid-roll-input`,
 * diseño § tabla de decisiones). Identifica el dado afectado y el rango válido
 * sin resolver la Tirada ni reservar `VersionedRandom.next` (req. 41.10).
 */
export type InvalidRollInput = Readonly<{
  message: DomainMessage;
  /** Índice del dado (posición declarada) cuya cara es inválida, si aplica. */
  dieIndex?: number;
  /** Cota inferior válida de una cara (siempre 1). */
  minFace: number;
  /** Cota superior válida de una cara (`domain.sides`). */
  maxFace: number;
}>;

/**
 * Resultado de {@link DiceRollCoordinator.resolve}.
 *
 * - `resolved`: la reserva se realizó y el Motor aceptó la resolución; incluye
 *   la {@link DiceRollResolution} confirmable y la {@link TransitionDecision}
 *   del Motor (normalmente `accepted`). La unidad de trabajo la confirma.
 * - `invalid-roll-input`: la entrada manual no respeta el dominio declarado; no
 *   se reservó aleatoriedad ni se resolvió la Tirada (queda pendiente para
 *   corregir o cancelar).
 * - `stale-roll-resolution`: la solicitud no corresponde a la Instantánea
 *   recibida o el Motor rechazó la resolución por identidad/uso; nada cambia.
 */
export type DiceRollCoordinationResult =
  | Readonly<{
      kind: "resolved";
      resolution: DiceRollResolution;
      decision: TransitionDecision;
    }>
  | Readonly<{ kind: "invalid-roll-input"; diagnostic: InvalidRollInput }>
  | Readonly<{ kind: "stale-roll-resolution"; message: DomainMessage }>;

/**
 * Resultado de {@link DiceRollCoordinator.cancel}. Cancelar una Tirada pendiente
 * descarta solo estado efímero: no crea propuesta, Consumo ni registro y no
 * cambia el Estado de partida ni la posición de secuencia aleatoria (req. 41.21).
 */
export type DiceRollCancellation = Readonly<{
  kind: "cancelled";
  requestId: DiceRollRequestId;
}>;

/** Dependencias inyectadas del Coordinador de Tiradas. */
export type DiceRollCoordinatorDeps = Readonly<{
  engine: RulesEngineView;
  catalog: RulesCatalogView;
  random: VersionedRandomMachine;
}>;

/** Clave `es-ES` de una entrada manual con cantidad de caras incorrecta. */
const MANUAL_COUNT_MESSAGE_KEY = "tiradas.manual.cantidadIncorrecta";
/** Clave `es-ES` de una cara manual fuera del rango `1..sides`. */
const MANUAL_FACE_RANGE_MESSAGE_KEY = "tiradas.manual.caraFueraDeRango";
/** Clave `es-ES` de una resolución obsoleta o cruzada (`stale-roll-resolution`). */
const STALE_RESOLUTION_MESSAGE_KEY = "tiradas.resolucion.obsoleta";

/**
 * Coordinador de Tiradas de dados. Reserva la aleatoriedad a través del puerto
 * inyectado y delega la interpretación en el Motor puro.
 */
export class DiceRollCoordinator {
  private readonly engine: RulesEngineView;
  private readonly catalog: RulesCatalogView;
  private readonly random: VersionedRandomMachine;

  public constructor(deps: DiceRollCoordinatorDeps) {
    this.engine = deps.engine;
    this.catalog = deps.catalog;
    this.random = deps.random;
  }

  /**
   * Resuelve una Tirada pendiente. `currentRandomState` es el Estado aleatorio
   * de la última Instantánea confirmada (`snapshot.randomState`); la reserva se
   * calcula SIEMPRE desde él, de modo que Automático y Manual reservan
   * exactamente el mismo paso (req. 41.11, 41.12).
   *
   * No muta sus argumentos. En Manual con entrada inválida no invoca la fuente
   * aleatoria (req. 41.10).
   */
  public resolve(
    snapshot: GameSnapshot,
    request: DiceRollRequest,
    input: DiceRollInput,
    currentRandomState: RandomState,
  ): DiceRollCoordinationResult {
    // Control optimista: la solicitud debe corresponder a la Instantánea vigente.
    if (snapshot.id !== request.expectedSnapshotId) {
      return staleResolution();
    }

    // Validación Manual ANTES de reservar: una entrada inválida NO invoca la
    // fuente aleatoria ni toca el Estado aleatorio (req. 41.10).
    if (input.source === "manual") {
      const validation = validateManualFaces(request, input.faces);
      if (validation !== undefined) {
        return Object.freeze({
          kind: "invalid-roll-input" as const,
          diagnostic: validation,
        });
      }
    }

    // Reserva ÚNICA del paso programático desde el Estado aleatorio vigente. Es
    // idéntica en Automático y Manual (misma posición, mismo siguiente Estado,
    // mismo identificador de Consumo; req. 41.11, 41.12).
    const step = this.random.next(
      currentRandomState,
      buildRandomRequest(request),
    );
    const nextRandomState: RandomState = step.state;
    const reserved: RandomConsumption = step.consumption;

    // Automático: adopta las caras programáticas reservadas (req. 41.8).
    // Manual: descarta las programáticas y usa las caras físicas (req. 41.14).
    const faces: readonly number[] =
      input.source === "manual" ? [...input.faces] : reserved.rawResult;

    const consumption: RandomConsumption = Object.freeze({
      gameId: reserved.gameId,
      id: reserved.id,
      position: reserved.position,
      context: reserved.context,
      requestedDomain: reserved.requestedDomain,
      rawResult: Object.freeze([...faces]),
      interpretedResult: reserved.interpretedResult,
    });

    const resolution: DiceRollResolution = Object.freeze({
      requestId: request.id,
      gameId: request.gameId,
      expectedSnapshotId: request.expectedSnapshotId,
      context: request.context,
      source: input.source,
      effectiveFaces: Object.freeze([...faces]),
      nextRandomState,
      consumption,
    });

    // Salvaguarda de identidad antes de reanudar el Motor (uso único ligado a
    // solicitud/Partida/Instantánea/contexto; req. 41.23).
    if (!resolutionMatchesRequest(request, resolution)) {
      return staleResolution();
    }

    const decision = this.engine.resumeRoll(
      snapshot,
      request,
      resolution,
      this.catalog,
    );

    // El Motor rechaza una resolución obsoleta, cruzada o reutilizada: se
    // traduce a `stale-roll-resolution` sin cambiar nada (req. 41.23).
    if (decision.kind === "rejected") {
      return staleResolution();
    }

    return Object.freeze({
      kind: "resolved" as const,
      resolution,
      decision,
    });
  }

  /**
   * Cancela una Tirada pendiente sin efectos. No reserva aleatoriedad ni toca el
   * Estado de partida, los registros o la posición de secuencia (req. 41.21).
   */
  public cancel(requestId: DiceRollRequestId): DiceRollCancellation {
    return Object.freeze({ kind: "cancelled" as const, requestId });
  }
}

/** Construye el `stale-roll-resolution` con su mensaje `es-ES`. */
function staleResolution(): DiceRollCoordinationResult {
  return Object.freeze({
    kind: "stale-roll-resolution" as const,
    message: Object.freeze({ messageKey: STALE_RESOLUTION_MESSAGE_KEY }),
  });
}

/**
 * Deriva la petición al puerto {@link VersionedRandom} desde la solicitud de
 * Tirada: misma Partida, mismo contexto y el dominio de dados declarado. No
 * asume una cantidad fija de dos dados (req. 41.33).
 */
function buildRandomRequest(request: DiceRollRequest): RandomRequest {
  return Object.freeze({
    gameId: request.gameId,
    domain: Object.freeze({
      kind: "dice" as const,
      sides: request.domain.sides,
      count: request.domain.count,
    }),
    context: request.context,
  });
}

/**
 * Valida las caras manuales contra el dominio declarado (req. 41.9, 41.33).
 * Devuelve `undefined` si son válidas o un {@link InvalidRollInput} con el dado
 * afectado y el rango válido en caso contrario. No invoca la fuente aleatoria.
 */
function validateManualFaces(
  request: DiceRollRequest,
  faces: readonly number[],
): InvalidRollInput | undefined {
  const { count, sides } = request.domain;
  if (!Array.isArray(faces) || faces.length !== count) {
    return Object.freeze({
      message: Object.freeze({
        messageKey: MANUAL_COUNT_MESSAGE_KEY,
        params: Object.freeze({ expected: count, actual: faces.length }),
      }),
      minFace: 1,
      maxFace: sides,
    });
  }
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index]!;
    if (!Number.isInteger(face) || face < 1 || face > sides) {
      return Object.freeze({
        message: Object.freeze({
          messageKey: MANUAL_FACE_RANGE_MESSAGE_KEY,
          params: Object.freeze({ dieIndex: index, min: 1, max: sides }),
        }),
        dieIndex: index,
        minFace: 1,
        maxFace: sides,
      });
    }
  }
  return undefined;
}
