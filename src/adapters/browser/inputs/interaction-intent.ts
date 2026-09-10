/**
 * Intención de interacción normalizada e independiente del dispositivo (Tarea 20.2).
 *
 * Los adaptadores de entrada (tacto, ratón, teclado, tecnología de asistencia)
 * traducen sus eventos de plataforma a un ÚNICO tipo {@link InteractionIntent}.
 * Dos dispositivos distintos que expresen la misma acción semántica sobre el
 * mismo Estado de partida producen un `InteractionIntent` estructuralmente
 * idéntico salvo por el campo `source`, que solo registra la modalidad de
 * origen y NUNCA llega hasta el Motor (lo elimina {@link IntentTranslator}).
 *
 * FRONTERA DE CAPAS: este módulo vive en `adapters/browser/`. Solo importa
 * TIPOS del dominio (`HexId`, `PieceId`) para nombrar sujetos/objetivos; no
 * ejecuta reglas ni toca `GameState`. Diseño §8 (Interfaz, entrada y
 * accesibilidad), requisitos 24.1, 24.2, 24.11.
 */
import type { HexId, PieceId } from "../../../domain/geometry/identifiers.js";

/**
 * Modalidad de origen de una interacción. Es metadato de la capa de entrada:
 * sirve para trazas/telemetría local y para verificar equivalencia entre
 * dispositivos, pero se descarta antes de construir un `GameCommand` (24.11).
 */
export type InteractionSource = "touch" | "mouse" | "keyboard" | "assistive";

/**
 * Acción semántica del Jugador, independiente de la modalidad física con la que
 * se exprese. Un mismo `SemanticAction` puede originarse por tacto de un solo
 * puntero, por clic/movimiento/arrastre de ratón o por teclado (24.1, 24.2).
 *
 * - `select`: seleccionar un Hexágono, Ficha o control (primer paso, no
 *   irreversible por sí mismo).
 * - `inspect`: inspeccionar por separado elementos que comparten ubicación
 *   (24.10); alternativa explícita a hover/botón secundario.
 * - `confirm`: confirmar una selección previa; único paso que puede emitir un
 *   comando irreversible (24.5, 24.12).
 * - `cancel`: cancelar la selección/confirmación pendiente sin efecto.
 * - `activate`: activar directamente una acción reversible (no requiere
 *   confirmación).
 */
export type SemanticAction =
  | "select"
  | "inspect"
  | "confirm"
  | "cancel"
  | "activate";

/**
 * Intención de interacción normalizada (diseño §8).
 *
 * `subjectId`/`targetId` identifican el elemento afectado con identificadores
 * de dominio opacos. `source` es la modalidad de origen y se elimina antes de
 * construir el comando de juego.
 */
export type InteractionIntent = Readonly<{
  semanticAction: SemanticAction;
  source: InteractionSource;
  subjectId?: PieceId | HexId;
  targetId?: PieceId | HexId;
}>;

/** Error lanzado por {@link interactionIntent} ante datos inválidos. */
export class InvalidInteractionIntentError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Intención de interacción inválida en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidInteractionIntentError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

const SEMANTIC_ACTIONS: ReadonlySet<SemanticAction> = new Set<SemanticAction>([
  "select",
  "inspect",
  "confirm",
  "cancel",
  "activate",
]);

const INTERACTION_SOURCES: ReadonlySet<InteractionSource> =
  new Set<InteractionSource>(["touch", "mouse", "keyboard", "assistive"]);

/** Entrada de {@link interactionIntent}. */
export type InteractionIntentInput = Readonly<{
  semanticAction: SemanticAction;
  source: InteractionSource;
  subjectId?: PieceId | HexId;
  targetId?: PieceId | HexId;
}>;

/**
 * Construye un {@link InteractionIntent} inmutable y validado.
 *
 * Normaliza para que dos modalidades distintas produzcan objetos
 * estructuralmente idénticos salvo `source`: los campos opcionales ausentes se
 * omiten (nunca `undefined` explícito) para que la igualdad estructural sea
 * comparable entre dispositivos (24.11).
 */
export function interactionIntent(
  input: InteractionIntentInput,
): InteractionIntent {
  if (!SEMANTIC_ACTIONS.has(input.semanticAction)) {
    throw new InvalidInteractionIntentError(
      "semanticAction",
      input.semanticAction,
      "acción semántica no reconocida",
    );
  }
  if (!INTERACTION_SOURCES.has(input.source)) {
    throw new InvalidInteractionIntentError(
      "source",
      input.source,
      "modalidad de origen no reconocida",
    );
  }

  const result: {
    semanticAction: SemanticAction;
    source: InteractionSource;
    subjectId?: PieceId | HexId;
    targetId?: PieceId | HexId;
  } = {
    semanticAction: input.semanticAction,
    source: input.source,
  };

  if (input.subjectId !== undefined) {
    assertNonEmptyId("subjectId", input.subjectId);
    result.subjectId = input.subjectId;
  }
  if (input.targetId !== undefined) {
    assertNonEmptyId("targetId", input.targetId);
    result.targetId = input.targetId;
  }

  return Object.freeze(result);
}

function assertNonEmptyId(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidInteractionIntentError(field, value, "no puede estar vacío");
  }
}

/**
 * Compara dos intenciones ignorando `source`. Es la relación de equivalencia
 * que garantiza que tacto y ratón produzcan el MISMO efecto (24.11): si dos
 * intenciones son equivalentes, el traductor generará comandos idénticos.
 */
export function areIntentsEquivalent(
  a: InteractionIntent,
  b: InteractionIntent,
): boolean {
  return (
    a.semanticAction === b.semanticAction &&
    a.subjectId === b.subjectId &&
    a.targetId === b.targetId
  );
}
