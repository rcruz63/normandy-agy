/**
 * Fases ordenadas del pipeline de despliegue fail-closed (Tarea 25.2, diseño §11
 * «IaC, Bloqueo de producción y observabilidad», requisitos 27.9, 28.12, 28.13,
 * 29.11).
 *
 * El diseño exige EXACTAMENTE estas fases, en este orden: `build-content`,
 * `test`, `synth`, `preflight`, `deploy-staging`, `verify-staging` y `promote`.
 * Solo `promote` crea o actualiza producción y únicamente con un
 * `ProductionEvidence` `allow` generado en la MISMA ejecución (véase
 * `production-pipeline.ts`). Este módulo define solo la identidad y el orden de
 * las fases como datos inmutables; la orquestación vive en `production-pipeline`.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/**
 * Identificadores estables de cada fase del pipeline. El orden del array ES el
 * orden de ejecución: una fase anterior fallida impide las posteriores
 * (fail-closed). `preflight` precede a `promote` porque su evidencia gobierna la
 * promoción.
 */
export const PIPELINE_PHASE_IDS = Object.freeze([
  "build-content",
  "test",
  "synth",
  "preflight",
  "deploy-staging",
  "verify-staging",
  "promote",
] as const);

/** Identificador de una fase del pipeline (unión literal derivada del orden). */
export type PipelinePhaseId = (typeof PIPELINE_PHASE_IDS)[number];

/** Índice canónico de la fase que genera la evidencia de producción. */
export const PREFLIGHT_PHASE_ID: PipelinePhaseId = "preflight";

/** Índice canónico de la única fase que crea o actualiza producción. */
export const PROMOTE_PHASE_ID: PipelinePhaseId = "promote";

/**
 * Devuelve la posición ordinal (0..n-1) de una fase dentro de la secuencia
 * canónica. Base para verificar que `preflight` precede a `promote` y que las
 * fases se ejecutan en orden.
 *
 * @param phase Identificador de la fase.
 * @returns Índice de la fase en el orden canónico.
 */
export function phaseOrdinal(phase: PipelinePhaseId): number {
  return PIPELINE_PHASE_IDS.indexOf(phase);
}
