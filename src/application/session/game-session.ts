/**
 * Cableado final de la sesión de juego (Tarea 27.1, diseño §4 y §8).
 *
 * `GameSession` es el ÚNICO punto de composición que conecta la cadena completa
 * del diseño extremo a extremo:
 *
 *   Interfaz → IntentTranslator (elimina modalidad) → GameCommand
 *            → GameCommandDispatcher (GameUnitOfWork, cola por gameId)
 *            → Motor de reglas (decide) → Invariantes → IndexedDb (commit único)
 *            → proyecciones es-ES (Acciones y registros) de vuelta a la Interfaz
 *
 * y, para las resoluciones con dados, la SEGUNDA fase del contrato de Tirada:
 *
 *   awaiting-roll → DiceRollDialog → DiceRollCoordinator (reserva un paso)
 *                → Motor (resumeRoll) → confirmDecision (mismo commit único)
 *
 * PRINCIPIOS DE FRONTERA VERIFICADOS POR ESTE CABLEADO (requisitos 5.1, 20.1,
 * 24.11, 30.1, 30.3, 30.12, 40.12):
 *
 * - NINGÚN valor lúdico vive en la Interfaz ni en ramas ad hoc. Las Acciones
 *   disponibles, la duración, el desenlace y los registros los produce el Motor
 *   puro y el catálogo; esta sesión solo PROYECTA (traduce `messageKey`/
 *   `labelKey` a `es-ES`) lo que el dominio ya calculó. No hay tablas, umbrales
 *   ni efectos calculados aquí (30.1, 30.3).
 * - La MODALIDAD de entrada nunca llega al Motor: el {@link IntentTranslator}
 *   elimina `source` antes de construir el `GameCommand`, de modo que la misma
 *   acción por tacto o ratón produce el mismo comando y el mismo resultado
 *   (24.11).
 * - El contenido NO PUBLICABLE permanece BLOQUEADO extremo a extremo: el
 *   selector solo ofrece Misiones `published` del {@link PublicationReport}
 *   (Publication Gate, Tarea 2.3); una Misión no publicable nunca se ofrece ni
 *   puede crearse desde esta sesión (30.12, 40.12).
 * - El Bloqueo local media la VISIBILIDAD del contenido: mientras está `locked`
 *   (o `uninitialized`), la sesión no revela Partidas ni el selector jugable
 *   (26.11); solo tras verificar se opera con normalidad.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Compone puertos y adaptadores del
 * dominio, la aplicación y la interfaz; no interpreta reglas ni accede
 * directamente a IndexedDB/DOM/red. El reloj y los generadores de identificador
 * se inyectan (sin `Date` ni `Math.random`).
 */
import type { GameId, MissionId } from "../../domain/identity/index.js";
import { randomAlgorithmVersion } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { RandomState } from "../../domain/random/index.js";
import type {
  DiceRollInput,
  DiceRollRequest,
} from "../../domain/engine/dice-roll.js";
import type {
  ActionDescriptor,
  RulesCatalogView,
  RulesEngineView,
} from "../../domain/engine/rules-engine.js";
import type { DomainMessage } from "../../domain/engine/transition.js";
import type { CommandOutcome } from "../../domain/ports/index.js";
import {
  attemptUnlock,
  evaluateStartupLock,
  projectLockView,
  type LocalLockStatus,
  type LocalLockView,
  type LocalUnlockResult,
  type LocalVerifierMaterial,
  type LocalCredential,
} from "../../domain/access/index.js";
import {
  IntentTranslator,
  type ActionDescriptor as InputActionDescriptor,
  type CommandContext,
} from "../../adapters/browser/inputs/index.js";
import type { InteractionIntent } from "../../adapters/browser/inputs/index.js";
import {
  projectActions,
  projectMissionSelector,
  type ActionOption,
  type MissionSelectorOption,
} from "../../ui/index.js";
import {
  projectDetailedLog,
  projectSimpleLog,
} from "../../domain/logging/index.js";
import type { MissionIdentity } from "../../catalog/FON-ML-2022/missions.js";
import type { GameCommandDispatcher } from "../games/game-command-dispatcher.js";
import type { DiceRollCoordinator } from "../games/dice-roll-coordinator.js";

/**
 * Conjunto de Misiones publicables consumido por la sesión. Es la superficie
 * mínima del {@link PublicationReport}: la sesión no decide qué es publicable,
 * solo respeta el veredicto del Publication Gate (30.12, 40.12).
 */
export type PublishableMissions = Readonly<{
  publishableMissionIds: readonly MissionId[];
}>;

/**
 * Estado de arranque de la sesión respecto del Bloqueo local (26.11): si el
 * dispositivo tiene conexión y el material verificador persistido (o `undefined`
 * si aún no se ha inicializado tras una descarga válida).
 */
export type SessionStartup = Readonly<{
  online: boolean;
  material: LocalVerifierMaterial | undefined;
}>;

/** Dependencias inyectadas del cableado de sesión. */
export type GameSessionDeps = Readonly<{
  /** Unidad de trabajo con cola por gameId (application/games). */
  dispatcher: GameCommandDispatcher;
  /** Coordinador de Tiradas de dados (segunda fase del contrato). */
  diceCoordinator: DiceRollCoordinator;
  /** Motor de reglas puro para enumerar Acciones disponibles. */
  engine: RulesEngineView;
  /** Vista estructural del catálogo compilado que consume el Motor. */
  catalog: RulesCatalogView;
  /** Identidades de las quince Misiones (nombre propio es-ES y metadatos). */
  missions: readonly MissionIdentity[];
  /** Veredicto de publicación del Publication Gate (solo `published` juega). */
  publication: PublishableMissions;
  /** Estado de arranque respecto del Bloqueo local. */
  startup: SessionStartup;
}>;

/**
 * Proyección de una Instantánea confirmada para la Interfaz `es-ES`. Reúne, ya
 * traducidas, las Acciones disponibles (que enumera el Motor) y ambos registros
 * (que proyecta el dominio). No añade ningún valor lúdico: es una vista de datos
 * que el dominio ya produjo (20.1, 30.1, 30.3).
 */
export type SnapshotProjection = Readonly<{
  gameId: GameId;
  snapshotId: GameSnapshot["id"];
  turn: number;
  outcome: GameSnapshot["state"]["outcome"];
  actions: readonly ActionOption[];
  simpleLog: readonly DomainMessage[];
  detailedLog: readonly DomainMessage[];
}>;

/**
 * Resultado de resolver una Tirada pendiente en la sesión.
 *
 * - `committed`/`rejected`/`blocked`/`invalid`/`stale`/`failed`: el desenlace de
 *   confirmar la propuesta interpretada, idéntico al de un comando directo.
 * - `invalid-roll-input`: la entrada Manual no respeta el dominio declarado; no
 *   se reservó aleatoriedad ni se confirmó nada (la Tirada sigue pendiente).
 * - `stale-roll-resolution`: la solicitud no corresponde a la Instantánea o el
 *   Motor rechazó la resolución por identidad/uso; nada cambia.
 */
export type RollResolutionResult =
  | Readonly<{ kind: "outcome"; outcome: CommandOutcome }>
  | Readonly<{ kind: "invalid-roll-input"; message: DomainMessage }>
  | Readonly<{ kind: "stale-roll-resolution"; message: DomainMessage }>;

/**
 * Sesión de juego cableada. Coordina la cadena completa y expone las
 * proyecciones `es-ES` a la Interfaz, respetando las fronteras del diseño.
 */
export class GameSession {
  private readonly dispatcher: GameCommandDispatcher;
  private readonly diceCoordinator: DiceRollCoordinator;
  private readonly engine: RulesEngineView;
  private readonly catalog: RulesCatalogView;
  private readonly missions: readonly MissionIdentity[];
  private readonly publication: PublishableMissions;
  private readonly material: LocalVerifierMaterial | undefined;
  private readonly translator = new IntentTranslator();
  private lockStatus: LocalLockStatus;

  public constructor(deps: GameSessionDeps) {
    this.dispatcher = deps.dispatcher;
    this.diceCoordinator = deps.diceCoordinator;
    this.engine = deps.engine;
    this.catalog = deps.catalog;
    this.missions = deps.missions;
    this.publication = deps.publication;
    this.material = deps.startup.material;
    this.lockStatus = evaluateStartupLock(deps.startup);
  }

  // -------------------------------------------------------------------------
  // Bloqueo local (visibilidad del contenido, 26.11)
  // -------------------------------------------------------------------------

  /** Proyección de visibilidad del Bloqueo local para la Interfaz. */
  public lockView(): LocalLockView {
    return projectLockView(this.lockStatus);
  }

  /**
   * Intenta desbloquear con la credencial. Solo pasa a `unlocked` si el material
   * está inicializado y la verificación es correcta; en caso contrario conserva
   * el estado bloqueado. No conserva la credencial (26.12).
   */
  public unlock(credential: LocalCredential): LocalUnlockResult {
    if (this.material === undefined) {
      return Object.freeze({ status: this.lockStatus, unlocked: false });
    }
    const result = attemptUnlock(this.material, credential);
    this.lockStatus = result.status;
    return result;
  }

  // -------------------------------------------------------------------------
  // Selector de Misiones (solo `published`, 30.12, 40.12)
  // -------------------------------------------------------------------------

  /**
   * Ofrece las Misiones jugables: EXCLUSIVAMENTE las `published` del Publication
   * Gate, cada una con su nombre propio `es-ES`. Mientras el contenido no es
   * visible (Bloqueo local `locked`/`uninitialized`) devuelve una lista vacía:
   * el contenido no publicable ni el bloqueado nunca se ofrecen (26.11, 30.12).
   */
  public availableMissions(): readonly MissionSelectorOption[] {
    if (!this.isContentVisible()) {
      return Object.freeze([]);
    }
    return projectMissionSelector(this.missions, this.publication);
  }

  /**
   * ¿La Misión está publicada Y el contenido es visible? Verificación autoritativa
   * de la frontera de publicación antes de permitir operar sobre una Misión.
   */
  public canPlayMission(missionId: MissionId): boolean {
    if (!this.isContentVisible()) {
      return false;
    }
    return this.publication.publishableMissionIds.some(
      (id) => (id as unknown as string) === (missionId as unknown as string),
    );
  }

  // -------------------------------------------------------------------------
  // Ciclo de un comando (Interfaz → Motor → Invariantes → IndexedDB)
  // -------------------------------------------------------------------------

  /**
   * Traduce una interacción normalizada a un `GameCommand` (eliminando la
   * modalidad, 24.11) y lo ejecuta a través de la unidad de trabajo. Devuelve el
   * desenlace del dominio SIN confirmar comando cuando la traducción no lo
   * produce (selección pendiente, cancelación o inspección): en esos casos el
   * Estado de partida se conserva (24.12).
   *
   * `submitIntent` centraliza el punto por el que la Interfaz emite acciones: no
   * existe ninguna ruta ad hoc que salte el traductor o la unidad de trabajo.
   */
  public async submitIntent(
    intent: InteractionIntent,
    action: InputActionDescriptor,
    context: CommandContext,
  ): Promise<SubmitIntentResult> {
    const translation = this.translator.translate(intent, action, context);
    if (translation.kind !== "command") {
      return Object.freeze({ kind: "no-command", translation });
    }
    const outcome = await this.dispatcher.execute(translation.command);
    return Object.freeze({ kind: "outcome", outcome });
  }

  // -------------------------------------------------------------------------
  // Segunda fase de una Tirada de dados (awaiting-roll → resolución → commit)
  // -------------------------------------------------------------------------

  /**
   * Resuelve una Tirada pendiente declarada por el Motor (`awaiting-roll`). El
   * Coordinador reserva EXACTAMENTE un paso aleatorio y reanuda el Motor; si la
   * resolución es aceptada, esta sesión la confirma por el MISMO commit único que
   * un comando directo (misma cola por gameId, mismas Invariantes).
   *
   * `currentRandomState` es el Estado aleatorio de la última Instantánea
   * confirmada (`snapshot.randomState`): garantiza que Automático y Manual
   * reserven el mismo paso (41.11, 41.12).
   */
  public async resolveRoll(
    snapshot: GameSnapshot,
    request: DiceRollRequest,
    input: DiceRollInput,
  ): Promise<RollResolutionResult> {
    const resolution = this.diceCoordinator.resolve(
      snapshot,
      request,
      input,
      currentRandomState(snapshot),
    );
    if (resolution.kind === "invalid-roll-input") {
      return Object.freeze({
        kind: "invalid-roll-input" as const,
        message: resolution.diagnostic.message,
      });
    }
    if (resolution.kind === "stale-roll-resolution") {
      return Object.freeze({
        kind: "stale-roll-resolution" as const,
        message: resolution.message,
      });
    }
    // `resolved`: el Motor devolvió una decisión. Solo `accepted` se confirma; el
    // Coordinador ya traduce `rejected` a `stale-roll-resolution`.
    if (resolution.decision.kind !== "accepted") {
      return Object.freeze({
        kind: "stale-roll-resolution" as const,
        message: Object.freeze({ messageKey: "tiradas.resolucion.obsoleta" }),
      });
    }
    const outcome = await this.dispatcher.confirmDecision(
      resolution.decision.proposal,
    );
    return Object.freeze({ kind: "outcome" as const, outcome });
  }

  /** Cancela una Tirada pendiente sin efectos (41.21). */
  public cancelRoll(request: DiceRollRequest): void {
    this.diceCoordinator.cancel(request.id);
  }

  // -------------------------------------------------------------------------
  // Proyección de una Instantánea a la Interfaz es-ES (20.1, 30.1, 30.3)
  // -------------------------------------------------------------------------

  /**
   * Proyecta una Instantánea confirmada a la vista `es-ES`: enumera las Acciones
   * disponibles con el Motor y las traduce, y proyecta ambos registros mediante
   * el proyector del dominio. NO calcula ningún valor lúdico: solo traduce lo
   * que el dominio produjo (20.1, 30.1, 30.3).
   */
  public project(snapshot: GameSnapshot): SnapshotProjection {
    const actions: readonly ActionDescriptor[] = this.engine.availableActions(
      snapshot.state,
      this.catalog,
    );
    return Object.freeze({
      gameId: snapshot.gameId,
      snapshotId: snapshot.id,
      turn: snapshot.state.turn,
      outcome: snapshot.state.outcome,
      actions: projectActions(actions),
      simpleLog: projectSimpleLog(snapshot.simpleLog),
      detailedLog: projectDetailedLog(snapshot.detailedLog),
    });
  }

  /**
   * ¿El contenido (Partidas, selector, reglas) es visible en la Interfaz?
   *
   * El Bloqueo local solo OCULTA el contenido mientras está `locked`, esto es,
   * operando sin conexión con material verificador presente y a la espera de la
   * credencial (requisito 26.11). En `uninitialized` (aún no hay Verificador
   * local tras una descarga válida) y en `unlocked` (verificado, o en línea con
   * el Control de acceso mediando la entrega) el contenido es visible.
   */
  private isContentVisible(): boolean {
    return this.lockStatus !== "locked";
  }
}

/**
 * Puente entre el Estado aleatorio embebido en la Instantánea y el modelo
 * canónico de aleatoriedad que consume el Coordinador de Tiradas.
 *
 * La Instantánea (`domain/engine/state.ts`) transporta el Estado aleatorio con
 * un alias provisional (`TODO(6.1)`: `algorithmVersion` como `string`), mientras
 * el modelo real (`domain/random`) usa el identificador opaco
 * `RandomAlgorithmVersion`. Esta función construye el modelo real aplicando el
 * constructor de marca SIN perder información: es una adaptación de frontera de
 * capa, no una reinterpretación. La sustitución definitiva del alias por el tipo
 * real en la Instantánea corresponde a la Tarea 29 (refactor no funcional).
 */
function currentRandomState(snapshot: GameSnapshot): RandomState {
  const random = snapshot.randomState;
  return Object.freeze({
    seed: random.seed,
    position: random.position,
    algorithmVersion: randomAlgorithmVersion(random.algorithmVersion),
  });
}

/**
 * Resultado de {@link GameSession.submitIntent}.
 *
 * - `outcome`: la traducción produjo un `GameCommand` y la unidad de trabajo lo
 *   ejecutó; incluye el {@link CommandOutcome} (que puede ser `awaiting-roll`).
 * - `no-command`: la interacción no produce comando (selección irreversible
 *   pendiente de confirmación, cancelación o inspección); el Estado de partida
 *   se conserva (24.12). Incluye la traducción para que la Interfaz reaccione.
 */
export type SubmitIntentResult =
  | Readonly<{ kind: "outcome"; outcome: CommandOutcome }>
  | Readonly<{
      kind: "no-command";
      translation: ReturnType<IntentTranslator["translate"]>;
    }>;
