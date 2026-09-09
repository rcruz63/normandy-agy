/**
 * Detención `stopped-after-consumption`: propuesta atómica que conserva un
 * Consumo aleatorio ya efectuado sin aplicar el efecto incompleto
 * (Tarea 8.3, diseño §2 «Motor de reglas puro», Propiedad 5).
 *
 * Contrato del diseño §2: «Cuando un requisito exige conservar un Consumo ya
 * efectuado aunque el resultado no pueda aplicarse (13.7 y 17.6), el resultado
 * es una propuesta atómica `stopped-after-consumption`: solo avanza el Estado
 * aleatorio y añade el consumo/diagnóstico; no revela ni aplica el efecto
 * incompleto». Aplica a resoluciones de Revelado o de tabla de Misión que, tras
 * gastar aleatoriedad que los requisitos obligan a conservar, detectan una
 * carencia (dato pendiente, desempate DP-002, tabla sin cobertura verificada).
 *
 * Este módulo aporta el CONTRATO/HELPER puro que construye esa propuesta a
 * partir de la Instantánea recibida, el Consumo efectuado (una única posición
 * de avance) y un diagnóstico `es-ES`. La propuesta resultante:
 * - avanza el Estado aleatorio EXACTAMENTE una posición (misma `seed` y
 *   `algorithmVersion`; `position` +1);
 * - añade el consumo/diagnóstico al Registro simple (y opcionalmente al
 *   detallado) como entradas nuevas y consecutivas;
 * - NO aplica el efecto incompleto: el resto del Estado de partida queda igual
 *   (mismas fichas, Incógnitas, objetivos, efectos, turno, fase y desenlace);
 *   no hay contenido revelado ni resultado de tabla parcial.
 *
 * Alineación con las Invariantes (Tarea 7.2): {@link validateProposal} ya exige
 * que una propuesta `stopped-after-consumption` avance la posición aleatoria en
 * exactamente +1. Aquí se produce esa propuesta cumpliendo el mismo invariante;
 * no se duplica ni contradice esa comprobación.
 *
 * Frontera de capas y pureza: el dominio NO importa la implementación de
 * `VersionedRandom` (`src/domain/random/**` la provee; llamarla sería un efecto
 * de resolución aleatoria). Este helper modela «avanzar exactamente una vez» de
 * forma ESTRUCTURAL: recibe el Estado aleatorio ya avanzado por quien efectuó
 * el Consumo y verifica que representa un avance de una sola posición. Módulo
 * puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no
 * usa `Math.random` ni `Date`. Todos los tipos son `Readonly`.
 */
import type { SnapshotId } from "../identity/index.js";
import type {
  GameSnapshot,
  RandomState,
  SimpleLogEntry,
  DetailedLogEntry,
} from "./state.js";
import {
  transitionProposal,
  type DomainMessage,
  type TransitionProposal,
} from "./transition.js";

/** Avance de posición aleatoria que efectúa un único Consumo conservado. */
const SINGLE_CONSUMPTION_STEP = 1;

/**
 * Error lanzado cuando los datos de una detención `stopped-after-consumption`
 * violan su contrato atómico (avance distinto de +1, retroceso de secuencia de
 * registro o intento de enlazar una Instantánea que no continúa la recibida).
 */
export class InvalidStoppedConsumptionError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(
      `Detención tras consumo inválida en «${field}»${
        detail ? `: ${detail}` : ""
      }.`,
    );
    this.name = "InvalidStoppedConsumptionError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

/**
 * Entrada del helper {@link buildStoppedAfterConsumption}.
 *
 * - `received`: Instantánea sobre la que se decidió (última confirmada).
 * - `consumedRandomState`: Estado aleatorio TRAS efectuar el único Consumo que
 *   los requisitos obligan a conservar; debe avanzar `received.randomState` en
 *   exactamente una posición.
 * - `nextSnapshotId`: identificador de la Instantánea resultante (distinto del
 *   de la recibida).
 * - `diagnostic`: causa `es-ES` (`messageKey`) de la carencia detectada; se
 *   registra como consumo/diagnóstico sin revelar contenido.
 * - `detailedDiagnostic`: entrada opcional para el Registro detallado.
 * - `confirmedAt`: marca temporal aportada por la capa de aplicación (el
 *   dominio no lee el reloj).
 */
export type StoppedAfterConsumptionInput = Readonly<{
  received: GameSnapshot;
  consumedRandomState: RandomState;
  nextSnapshotId: SnapshotId;
  diagnostic: DomainMessage;
  detailedDiagnostic?: DomainMessage;
  confirmedAt: string;
}>;

/** ¿`consumed` avanza `before` en exactamente una posición, sin más cambios? */
function isSingleConsumptionAdvance(
  before: RandomState,
  consumed: RandomState,
): boolean {
  if (before.seed !== consumed.seed) {
    return false;
  }
  if (before.algorithmVersion !== consumed.algorithmVersion) {
    return false;
  }
  return consumed.position === before.position + SINGLE_CONSUMPTION_STEP;
}

/**
 * Verifica el avance del Consumo conservado. Falla rápido (requisito de errores
 * no silenciados) si la posición no avanza EXACTAMENTE una vez o si la Semilla
 * o la Versión de algoritmo cambian.
 */
function assertSingleConsumption(
  before: RandomState,
  consumed: RandomState,
): void {
  if (isSingleConsumptionAdvance(before, consumed)) {
    return;
  }
  throw new InvalidStoppedConsumptionError(
    "consumedRandomState.position",
    consumed.position,
    `debe avanzar exactamente ${SINGLE_CONSUMPTION_STEP} posición conservando seed y algorithmVersion`,
  );
}

/** Añade el diagnóstico como nueva entrada consecutiva del Registro simple. */
function appendSimpleDiagnostic(
  entries: readonly SimpleLogEntry[],
  diagnostic: DomainMessage,
): readonly SimpleLogEntry[] {
  const entry: SimpleLogEntry = Object.freeze({
    sequence: entries.length + 1,
    messageKey: diagnostic.messageKey,
  });
  return Object.freeze([...entries, entry]);
}

/** Añade el diagnóstico detallado como nueva entrada consecutiva, si procede. */
function appendDetailedDiagnostic(
  entries: readonly DetailedLogEntry[],
  diagnostic: DomainMessage | undefined,
): readonly DetailedLogEntry[] {
  if (diagnostic === undefined) {
    return entries;
  }
  const entry: DetailedLogEntry = Object.freeze({
    sequence: entries.length + 1,
    messageKey: diagnostic.messageKey,
  });
  return Object.freeze([...entries, entry]);
}

/**
 * Construye la Instantánea resultante de una detención tras consumo.
 *
 * Conserva TODO el Estado de partida recibido (no aplica efecto incompleto):
 * solo cambian el Estado aleatorio (avance de +1) y los registros (consumo y
 * diagnóstico añadidos). El resto de campos de dominio se copian sin alterar.
 */
function buildStoppedSnapshot(
  input: StoppedAfterConsumptionInput,
): GameSnapshot {
  const { received } = input;
  return Object.freeze({
    id: input.nextSnapshotId,
    gameId: received.gameId,
    previousSnapshotId: received.id,
    confirmedAt: input.confirmedAt,
    // Estado de partida INTACTO: sin efecto incompleto aplicado.
    state: received.state,
    randomState: input.consumedRandomState,
    simpleLog: appendSimpleDiagnostic(received.simpleLog, input.diagnostic),
    detailedLog: appendDetailedDiagnostic(
      received.detailedLog,
      input.detailedDiagnostic,
    ),
    integrity: received.integrity,
  });
}

/**
 * Construye una propuesta de transición atómica `stopped-after-consumption`.
 *
 * Efectos exactos (Propiedad 5): avanza el Estado aleatorio EXACTAMENTE una
 * posición, registra el consumo/diagnóstico y NO aplica el efecto incompleto
 * (el resto del Estado de partida queda intacto). La propuesta resultante
 * satisface {@link validateProposal} para el modo `stopped-after-consumption`.
 */
export function buildStoppedAfterConsumption(
  input: StoppedAfterConsumptionInput,
): TransitionProposal {
  assertSingleConsumption(input.received.randomState, input.consumedRandomState);

  const next = buildStoppedSnapshot(input);
  return transitionProposal({
    expectedSnapshotId: input.received.id,
    next,
    mode: "stopped-after-consumption",
  });
}
