/**
 * Punto de entrada del Bloqueo de producción fail-closed (Tarea 25.1).
 *
 * Reexporta el modelo del plan de IaC, la derivación de comprobaciones de
 * seguridad/coste y la función pura `productionPreflight` que genera la
 * `ProductionEvidence`. Módulo de `infrastructure/`: la PWA no lo importa y no
 * contiene secretos.
 */
export {
  STORAGE_UNIT_GB,
  projectedOperationCategoryIds,
} from "./iac-plan.js";
export type {
  IacPlan,
  IacSecurityFacts,
  S3OperationCategory,
  S3OperationKind,
  S3StoragePlan,
  SecurityFact,
} from "./iac-plan.js";

export {
  SECURITY_CHECK_IDS,
  deriveExcludedResourcesCheck,
  deriveSecurityChecks,
} from "./security-checks.js";

export { productionPreflight } from "./production-preflight.js";
export type { PreflightInput } from "./production-preflight.js";

// Reexporta la evidencia para consumidores del preflight (fase `promote`).
export {
  AUTHORIZED_MONTHLY_COST_EUR,
  isCurrentZeroCostCoverage,
  isPassingCheck,
} from "../evidence/index.js";
export type {
  CoverageEvidence,
  GateCheck,
  GateCheckStatus,
  PlanEligibility,
  PreflightConclusion,
  ProductionEvidence,
} from "../evidence/index.js";
