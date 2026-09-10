/**
 * Contexto de ejecución del pipeline y vínculo de la evidencia a la ejecución
 * (Tarea 25.2, requisitos 27.9, 28.12, 28.13, 29.11, diseño §11).
 *
 * El diseño exige que `promote` requiera un `ProductionEvidence` «válido
 * generado en la misma ejecución». Aquí se modela la identidad de la ejecución
 * (`PipelineRunContext`) y la comprobación fail-closed de que una evidencia
 * pertenece a ESA ejecución: mismo identificador de ejecución, misma identidad
 * de plan (cuenta y distribución sintetizadas en esta ejecución) e instante de
 * comprobación coincidente. Así, una evidencia `allow` obsoleta o suministrada
 * externamente desde otra ejecución NO puede autorizar la promoción.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */
import type { ProductionEvidence } from "../evidence/production-evidence.js";

/**
 * Identidad inmutable de una ejecución del pipeline. El `runId` identifica la
 * ejecución de forma única; `accountId`/`distributionId` fijan el objetivo
 * sintetizado en esta misma ejecución; `checkedAt` es el instante de la
 * ejecución al que debe atarse la evidencia del preflight.
 */
export type PipelineRunContext = Readonly<{
  /** Identificador único de la ejecución (no reutilizable entre ejecuciones). */
  runId: string;
  /** Cuenta AWS objetivo sintetizada en esta ejecución. */
  accountId: string;
  /** Distribución CloudFront objetivo sintetizada en esta ejecución. */
  distributionId: string;
  /** Instante de la ejecución (ISO 8601) al que se ata la evidencia. */
  checkedAt: string;
}>;

/**
 * Comprueba que un `runId` sea una cadena no vacía. Un identificador ausente o
 * en blanco no permite atar evidencia a la ejecución (fail-closed).
 *
 * @param runId Identificador de ejecución a validar.
 * @returns `true` si el identificador es una cadena con contenido.
 */
function isNonEmptyRunId(runId: string): boolean {
  return runId.trim().length > 0;
}

/**
 * Determina si una `ProductionEvidence` fue generada en la ejecución dada. Ata
 * la evidencia a la ejecución por identidad de plan (cuenta y distribución) e
 * instante de comprobación coincidente. Cualquier discrepancia significa que la
 * evidencia procede de otra ejecución y no puede autorizar la promoción.
 *
 * No compara `runId` contra la evidencia porque `ProductionEvidence` refleja el
 * tipo EXACTO del diseño (sin `runId`); el vínculo se hace por la identidad del
 * plan sintetizado y el `checkedAt` propios de esta ejecución, que solo casan si
 * el preflight se ejecutó dentro de ella.
 *
 * @param run Contexto de la ejecución en curso.
 * @param evidence Evidencia candidata para autorizar `promote`.
 * @returns `true` solo si la evidencia pertenece a esta ejecución.
 */
export function isEvidenceFromRun(
  run: PipelineRunContext,
  evidence: ProductionEvidence,
): boolean {
  if (!isNonEmptyRunId(run.runId)) {
    return false;
  }
  if (evidence.accountId !== run.accountId) {
    return false;
  }
  if (evidence.distributionId !== run.distributionId) {
    return false;
  }
  return evidence.checkedAt === run.checkedAt;
}

/**
 * Determina si una `ProductionEvidence` de ESTA ejecución autoriza la promoción.
 * Fail-closed: exige a la vez que la evidencia pertenezca a la ejecución y que su
 * veredicto sea `allow`. Una evidencia `deny`, o un `allow` de otra ejecución,
 * nunca autoriza.
 *
 * @param run Contexto de la ejecución en curso.
 * @param evidence Evidencia candidata para autorizar `promote`.
 * @returns `true` solo si la evidencia es de la ejecución y concluye `allow`.
 */
export function authorizesPromotion(
  run: PipelineRunContext,
  evidence: ProductionEvidence,
): boolean {
  if (!isEvidenceFromRun(run, evidence)) {
    return false;
  }
  return evidence.conclusion === "allow";
}
