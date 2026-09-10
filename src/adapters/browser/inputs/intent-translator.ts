/**
 * Traductor de intención a comando de juego (Tarea 20.2).
 *
 * `IntentTranslator` es la frontera entre la modalidad de entrada y el Motor de
 * reglas. Convierte un {@link InteractionIntent} normalizado en un
 * {@link GameCommand} del dominio y, al hacerlo, ELIMINA el campo `source`: la
 * modalidad (tacto/ratón/teclado/asistencia) nunca llega al Motor (diseño §8,
 * requisito 24.11). Como consecuencia, la misma acción válida ejecutada por
 * tacto o por ratón desde el mismo Estado de partida produce el mismo comando y,
 * por tanto, el mismo Estado resultante y los mismos Consumos aleatorios.
 *
 * Además gestiona la confirmación de las Acciones irreversibles con dos estados
 * de UI, `selected` y `confirmed`: solo `confirmed` emite comando (24.5). Si una
 * interacción no completa la confirmación (cancelación, cambio de sujeto), no se
 * emite comando y el Estado de partida y la posición de secuencia aleatoria se
 * conservan intactos (24.12), porque simplemente no se produce ninguna
 * transición.
 *
 * FRONTERA DE CAPAS: `adapters/browser/`. Importa el constructor `gameCommand` y
 * los tipos de identidad del dominio; no ejecuta reglas ni muta estado.
 */
import {
  gameCommand,
  type GameCommand,
} from "../../../domain/engine/index.js";
import type { GameId, SnapshotId } from "../../../domain/identity/index.js";
import type { HexId, PieceId } from "../../../domain/geometry/identifiers.js";
import type {
  InteractionIntent,
  SemanticAction,
} from "./interaction-intent.js";

/**
 * Contexto de dominio necesario para construir un comando. Lo aporta la vista a
 * partir del Estado de partida activo; no proviene de la modalidad de entrada.
 */
export type CommandContext = Readonly<{
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
}>;

/**
 * Descriptor de acción de juego que la vista asocia a la selección actual. Fija
 * el `type` del comando y si la acción es irreversible (requiere confirmación).
 * El `payload` extra se fusiona con los identificadores del intento.
 */
export type ActionDescriptor = Readonly<{
  commandType: string;
  irreversible: boolean;
  payload?: Readonly<Record<string, unknown>>;
}>;

/**
 * Resultado de traducir un intento. El traductor no siempre emite comando:
 * - `command`: hay un `GameCommand` listo para el Motor.
 * - `awaiting-confirmation`: acción irreversible seleccionada; falta `confirm`.
 * - `cleared`: se canceló o cambió la selección; no se emite comando y el
 *   Estado de partida se conserva (24.12).
 * - `ignored`: el intento no produce comando por sí mismo (p. ej. `inspect`,
 *   que solo afecta a la vista).
 */
export type TranslationResult =
  | Readonly<{ kind: "command"; command: GameCommand }>
  | Readonly<{ kind: "awaiting-confirmation"; pendingAction: PendingIrreversible }>
  | Readonly<{ kind: "cleared" }>
  | Readonly<{ kind: "ignored"; reason: SemanticAction }>;

/**
 * Acción irreversible en estado `selected`, a la espera de `confirm`. Guarda el
 * sujeto seleccionado y el descriptor para construir el comando al confirmar.
 */
export type PendingIrreversible = Readonly<{
  action: ActionDescriptor;
  subjectId?: PieceId | HexId;
  targetId?: PieceId | HexId;
}>;

/** Error lanzado ante una traducción inconsistente. */
export class IntentTranslationError extends Error {
  public constructor(detail: string) {
    super(`Traducción de intención inválida: ${detail}.`);
    this.name = "IntentTranslationError";
  }
}

/**
 * Traductor con memoria mínima del paso `selected` de una Acción irreversible.
 *
 * Mantiene a lo sumo UNA acción irreversible pendiente. La confirmación exige
 * que la acción de `confirm` recaiga sobre el mismo sujeto seleccionado; en caso
 * contrario se descarta la pendiente y no se emite comando (24.12).
 */
export class IntentTranslator {
  private pending: PendingIrreversible | undefined;

  /** Devuelve la Acción irreversible pendiente de confirmación, si la hay. */
  public getPendingAction(): PendingIrreversible | undefined {
    return this.pending;
  }

  /** ¿Hay una Acción irreversible en estado `selected`? */
  public hasPendingConfirmation(): boolean {
    return this.pending !== undefined;
  }

  /**
   * Traduce un intento a resultado. La modalidad `source` se descarta aquí: no
   * se propaga a ningún comando (24.11).
   *
   * @param intent  intención normalizada de cualquier dispositivo.
   * @param action  descriptor de la acción de juego que resuelve la selección.
   * @param context contexto de dominio (gameId + Instantánea esperada).
   */
  public translate(
    intent: InteractionIntent,
    action: ActionDescriptor,
    context: CommandContext,
  ): TranslationResult {
    switch (intent.semanticAction) {
      case "cancel":
        // Cancelar descarta cualquier confirmación pendiente sin emitir comando
        // ni tocar el Estado de partida (24.12).
        this.pending = undefined;
        return Object.freeze({ kind: "cleared" as const });

      case "inspect":
        // Inspeccionar solo afecta a la vista (24.10): no emite comando.
        return Object.freeze({ kind: "ignored" as const, reason: "inspect" });

      case "activate":
        // Acción reversible directa: emite comando sin confirmación.
        this.pending = undefined;
        return Object.freeze({
          kind: "command" as const,
          command: this.buildCommand(action, context, intent),
        });

      case "select":
        return this.handleSelect(intent, action, context);

      case "confirm":
        return this.handleConfirm(intent, action, context);

      default:
        throw new IntentTranslationError(
          `acción semántica no soportada: ${String(intent.semanticAction)}`,
        );
    }
  }

  private handleSelect(
    intent: InteractionIntent,
    action: ActionDescriptor,
    context: CommandContext,
  ): TranslationResult {
    if (action.irreversible) {
      // Primer paso `selected`: registra la acción pendiente y NO emite comando.
      this.pending = Object.freeze({
        action,
        ...(intent.subjectId !== undefined ? { subjectId: intent.subjectId } : {}),
        ...(intent.targetId !== undefined ? { targetId: intent.targetId } : {}),
      });
      return Object.freeze({
        kind: "awaiting-confirmation" as const,
        pendingAction: this.pending,
      });
    }
    // Acción reversible: seleccionar la ejecuta directamente.
    this.pending = undefined;
    return Object.freeze({
      kind: "command" as const,
      command: this.buildCommand(action, context, intent),
    });
  }

  private handleConfirm(
    intent: InteractionIntent,
    action: ActionDescriptor,
    context: CommandContext,
  ): TranslationResult {
    const pending = this.pending;
    if (pending === undefined) {
      // Confirmar sin selección previa no emite comando: nada que confirmar.
      return Object.freeze({ kind: "cleared" as const });
    }
    // La confirmación debe recaer sobre el mismo sujeto/objetivo seleccionado;
    // si difiere, se descarta la pendiente sin emitir comando (24.12).
    if (
      pending.subjectId !== intent.subjectId ||
      pending.targetId !== intent.targetId
    ) {
      this.pending = undefined;
      return Object.freeze({ kind: "cleared" as const });
    }
    this.pending = undefined;
    return Object.freeze({
      kind: "command" as const,
      command: this.buildCommandFromPending(pending, action, context),
    });
  }

  private buildCommand(
    action: ActionDescriptor,
    context: CommandContext,
    intent: InteractionIntent,
  ): GameCommand {
    // `source` NUNCA se copia al payload: la modalidad no llega al Motor (24.11).
    return gameCommand({
      gameId: context.gameId,
      expectedSnapshotId: context.expectedSnapshotId,
      type: action.commandType,
      payload: mergePayload(action.payload, intent.subjectId, intent.targetId),
    });
  }

  private buildCommandFromPending(
    pending: PendingIrreversible,
    action: ActionDescriptor,
    context: CommandContext,
  ): GameCommand {
    return gameCommand({
      gameId: context.gameId,
      expectedSnapshotId: context.expectedSnapshotId,
      type: action.commandType,
      payload: mergePayload(action.payload, pending.subjectId, pending.targetId),
    });
  }
}

/**
 * Fusiona el payload declarado por la acción con los identificadores del
 * intento. Solo añade `subjectId`/`targetId` cuando existen; el payload de la
 * acción tiene prioridad si define esas claves explícitamente.
 */
function mergePayload(
  base: Readonly<Record<string, unknown>> | undefined,
  subjectId: PieceId | HexId | undefined,
  targetId: PieceId | HexId | undefined,
): Readonly<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  if (subjectId !== undefined) {
    payload["subjectId"] = subjectId;
  }
  if (targetId !== undefined) {
    payload["targetId"] = targetId;
  }
  if (base !== undefined) {
    Object.assign(payload, base);
  }
  return payload;
}
