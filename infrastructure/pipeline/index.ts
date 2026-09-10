/**
 * Punto de entrada del pipeline por fases con promoción condicionada
 * (Tarea 25.2, diseño §11).
 *
 * Reexporta las fases canónicas, las señales informativas, el vínculo de la
 * evidencia a la ejecución y el orquestador `runProductionPipeline`. Módulo de
 * `infrastructure/`: la PWA no lo importa y no contiene secretos.
 */
export {
  PIPELINE_PHASE_IDS,
  PREFLIGHT_PHASE_ID,
  PROMOTE_PHASE_ID,
  phaseOrdinal,
} from "./pipeline-phases.js";
export type { PipelinePhaseId } from "./pipeline-phases.js";

export { createInformationalSignal } from "./informational-signals.js";
export type {
  InformationalSignal,
  InformationalSignalKind,
} from "./informational-signals.js";

export { authorizesPromotion, isEvidenceFromRun } from "./run-context.js";
export type { PipelineRunContext } from "./run-context.js";

export { runProductionPipeline } from "./production-pipeline.js";
export type {
  PhaseEffectResult,
  PhaseOutcome,
  PipelineEffects,
  PipelineRunInput,
  PipelineRunResult,
} from "./production-pipeline.js";
