/**
 * Punto de entrada de la evidencia de despliegue (Tarea 25.1).
 *
 * Reexporta los tipos y validadores fail-closed de `ProductionEvidence`,
 * `CoverageEvidence` y `GateCheck`. Módulo de `infrastructure/`: la PWA no lo
 * importa y no contiene secretos.
 */
export {
  AUTHORIZED_MONTHLY_COST_EUR,
  isCurrentZeroCostCoverage,
  isPassingCheck,
} from "./production-evidence.js";
export type {
  CoverageEvidence,
  GateCheck,
  GateCheckStatus,
  PlanEligibility,
  PreflightConclusion,
  ProductionEvidence,
} from "./production-evidence.js";
