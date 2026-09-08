/**
 * Comandos, propuestas y decisiones de transición del dominio (Tarea 7.1).
 *
 * Modela el contrato de transición del Motor de reglas a nivel de datos:
 * `GameCommand` (entrada), `TransitionProposal` (salida aceptada) y
 * `TransitionDecision` (`accepted` / `rejected` / `blocked`). Alinea las formas
 * concretas con el puerto `RulesEngine` (`src/domain/ports/rules-engine.ts`),
 * que YA declara `TransitionDecision`; este módulo no contradice ese contrato,
 * solo aporta los modelos concretos que las tareas 8.x cablearán al puerto.
 *
 * Modos de propuesta (diseño § Motor de reglas y tabla de decisiones):
 * - `complete`: la transición aplica el efecto completo del comando.
 * - `stopped-after-consumption`: tras efectuar un Consumo aleatorio que los
 *   requisitos obligan a conservar (13.7, 17.6) se detecta una carencia; la
 *   propuesta es atómica: solo avanza el Estado aleatorio y añade el
 *   consumo/diagnóstico, SIN aplicar el efecto incompleto (nada de contenido
 *   revelado ni resultado de tabla parcial).
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { DecisionRef, GameId, SnapshotId } from "../identity/index.js";
import type { GameSnapshot } from "./state.js";

/**
 * Mensaje de dominio localizable en `es-ES`.
 *
 * Se identifica por `messageKey` (clave de catálogo `es-ES`, Tarea 20/13); el
 * texto visible lo resuelve el proyector. `params` transporta datos para
 * interpolar sin acoplar el dominio al idioma.
 *
 * TODO(13.1/20.3): unificar con `DomainMessage` del proyector de registros.
 */
export type DomainMessage = Readonly<{
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Comando de juego (diseño § Estado de partida y transición).
 *
 * Cada comando incluye `gameId`, `expectedSnapshotId`, `type` y un `payload`
 * validado; ninguna operación mutable acepta un identificador implícito. La
 * modalidad de entrada (`source`) NUNCA llega hasta aquí: la elimina el
 * `IntentTranslator` (Tarea 20.1) antes de construir el comando.
 *
 * `payload` se tipa como registro opaco de solo lectura en esta tarea; las
 * tareas 8.x/9.x/20.x refinarán payloads concretos por `type`.
 */
export type GameCommand = Readonly<{
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  type: string;
  payload: Readonly<Record<string, unknown>>;
}>;

/** Modo de una propuesta de transición aceptada. */
export type TransitionMode = "complete" | "stopped-after-consumption";

/**
 * Propuesta de transición aceptada (diseño § Estado de partida y transición).
 *
 * `expectedSnapshotId` es el identificador de la Instantánea sobre la que se
 * calculó (control de concurrencia optimista, Tarea 15). `next` es la
 * Instantánea resultante. `mode` distingue transición completa de detención
 * tras consumo.
 */
export type TransitionProposal = Readonly<{
  expectedSnapshotId: SnapshotId;
  next: GameSnapshot;
  mode: TransitionMode;
}>;

/**
 * Decisión de transición del Motor.
 *
 * Estructura IDÉNTICA a la del puerto `RulesEngine.TransitionDecision`:
 * - `accepted`: se propone una transición (modo `complete` o
 *   `stopped-after-consumption`).
 * - `rejected`: comando no permitido por estado/secuencia; identidad, sin
 *   consumo nuevo.
 * - `blocked`: dato, prioridad, revisión o DP pendiente; enlaza a la decisión
 *   afectada mediante `decisionRef`.
 */
export type TransitionDecision =
  | Readonly<{ kind: "accepted"; proposal: TransitionProposal }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>
  | Readonly<{
      kind: "blocked";
      reason: DomainMessage;
      decisionRef: DecisionRef;
    }>;

/** Error lanzado por los constructores de este módulo ante datos inválidos. */
export class InvalidTransitionError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Transición inválida en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidTransitionError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidTransitionError(field, value, "no puede estar vacío");
  }
}

/** Entrada de {@link gameCommand}. */
export type GameCommandInput = Readonly<{
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  type: string;
  payload?: Readonly<Record<string, unknown>>;
}>;

/**
 * Construye un {@link GameCommand} inmutable.
 *
 * Valida que `type` no esté vacío. `payload` se congela; si se omite, queda un
 * registro vacío inmutable.
 */
export function gameCommand(input: GameCommandInput): GameCommand {
  assertNonEmpty("type", input.type);
  const payload = Object.freeze({ ...(input.payload ?? {}) });
  return Object.freeze({
    gameId: input.gameId,
    expectedSnapshotId: input.expectedSnapshotId,
    type: input.type,
    payload,
  });
}

/** Entrada de {@link transitionProposal}. */
export type TransitionProposalInput = Readonly<{
  expectedSnapshotId: SnapshotId;
  next: GameSnapshot;
  mode: TransitionMode;
}>;

/**
 * Construye una {@link TransitionProposal} inmutable.
 *
 * Valida que `mode` sea uno de los dos permitidos y que la Instantánea
 * resultante enlace su Estado aleatorio hacia delante respecto de
 * `expectedSnapshotId` (la Instantánea `next` no puede tener el mismo id que la
 * esperada, pues siempre representa un nuevo estado confirmable).
 */
export function transitionProposal(
  input: TransitionProposalInput,
): TransitionProposal {
  if (input.mode !== "complete" && input.mode !== "stopped-after-consumption") {
    throw new InvalidTransitionError(
      "mode",
      input.mode,
      "debe ser complete|stopped-after-consumption",
    );
  }
  if (input.next.id === input.expectedSnapshotId) {
    throw new InvalidTransitionError(
      "next.id",
      input.next.id,
      "la Instantánea resultante no puede reutilizar expectedSnapshotId",
    );
  }
  return Object.freeze({
    expectedSnapshotId: input.expectedSnapshotId,
    next: input.next,
    mode: input.mode,
  });
}

/** Construye una decisión `accepted` a partir de una propuesta. */
export function accepted(proposal: TransitionProposal): TransitionDecision {
  return Object.freeze({ kind: "accepted", proposal });
}

/** Construye una decisión `rejected` con su motivo `es-ES`. */
export function rejected(reason: DomainMessage): TransitionDecision {
  return Object.freeze({ kind: "rejected", reason });
}

/** Construye una decisión `blocked` con motivo y referencia de decisión. */
export function blocked(
  reason: DomainMessage,
  ref: DecisionRef,
): TransitionDecision {
  return Object.freeze({ kind: "blocked", reason, decisionRef: ref });
}
