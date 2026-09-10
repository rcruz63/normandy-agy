/**
 * Adaptadores de entrada e `IntentTranslator` (Tarea 20.2).
 *
 * Punto de entrada de la capa de entrada del navegador: los adaptadores por
 * dispositivo producen un `InteractionIntent` idéntico para la misma acción
 * semántica y el `IntentTranslator` elimina la modalidad (`source`) antes de
 * construir un `GameCommand`, gestionando la confirmación `selected`→`confirmed`
 * de las Acciones irreversibles. Diseño §8; requisitos 24.1, 24.2, 24.3, 24.5,
 * 24.10, 24.11, 24.12.
 */
export {
  interactionIntent,
  areIntentsEquivalent,
  InvalidInteractionIntentError,
} from "./interaction-intent.js";
export type {
  InteractionIntent,
  InteractionIntentInput,
  InteractionSource,
  SemanticAction,
} from "./interaction-intent.js";

export {
  TouchInputAdapter,
  MouseInputAdapter,
  KeyboardInputAdapter,
  AssistiveInputAdapter,
  createInputAdapters,
} from "./input-adapters.js";
export type {
  InputAdapter,
  InputAdapters,
  GestureDescriptor,
} from "./input-adapters.js";

export {
  IntentTranslator,
  IntentTranslationError,
} from "./intent-translator.js";
export type {
  ActionDescriptor,
  CommandContext,
  PendingIrreversible,
  TranslationResult,
} from "./intent-translator.js";

export {
  HIDDEN_INTERACTION_KINDS,
  visibleAlternativeControl,
  checkAlternativeCoverage,
  InvalidVisibleAlternativeError,
} from "./alternative-controls.js";
export type {
  HiddenInteractionKind,
  VisibleAlternativeControl,
  AlternativeCoverageResult,
} from "./alternative-controls.js";
