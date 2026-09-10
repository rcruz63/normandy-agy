/**
 * `productionPreflight`: Bloqueo de producción fail-closed que genera un
 * `ProductionEvidence` con `conclusion` `allow`/`deny` (Tarea 25.1, requisitos
 * 27.9-27.11, 28.9-28.15, 29.9-29.12, diseño §11).
 *
 * Es una función PURA: recibe el plan de IaC sintetizado, la evidencia de
 * cobertura recopilada y el instante de comprobación, y no llama a AWS ni
 * despliega. El pipeline de despliegue le inyecta el plan real y la evidencia
 * vigente; aquí solo se decide el veredicto de forma determinista y auditable.
 *
 * Reglas fail-closed (diseño §11 y §«Evidencia de despliegue»):
 *
 * - Se derivan del plan TODAS las categorías de operación S3 previstas (admin y
 *   lecturas de origen). Cada categoría prevista exige una `CoverageEvidence`
 *   VIGENTE a coste 0 €; si falta, es parcial o caducada, hay `deny`.
 * - Cualquier categoría con evidencia que NO esté prevista por el plan (o
 *   viceversa) rompe la correspondencia exacta y produce `deny`. Así, una
 *   categoría nueva en el plan sin evidencia bloquea automáticamente.
 * - El 100 % del almacenamiento S3 Standard previsto exige cobertura vigente a
 *   coste 0 €.
 * - Toda comprobación de seguridad/coste debe ser `pass`; `unknown` = `fail`.
 * - El plan debe ser `FREE`/`CloudFront` y elegible.
 * - Una estimación, el límite nominal de 5 GB, un Aviso de franquicia o el Zero
 *   spend budget NUNCA cambian `deny` a `allow`: esas señales son informativas
 *   y no forman parte del cálculo del veredicto.
 * - Un cambio de IaC/cuenta/precio/condiciones se refleja como plan/evidencia
 *   distintos y obliga a reejecutar el preflight (la evidencia no se reutiliza).
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */
import {
  isCurrentZeroCostCoverage,
  isPassingCheck,
  type CoverageEvidence,
  type GateCheck,
  type PlanEligibility,
  type PreflightConclusion,
  type ProductionEvidence,
} from "../evidence/production-evidence.js";
import {
  projectedOperationCategoryIds,
  type IacPlan,
} from "./iac-plan.js";
import {
  deriveExcludedResourcesCheck,
  deriveSecurityChecks,
} from "./security-checks.js";

/** Familia y nivel de plan permitidos por el diseño. */
const REQUIRED_PLAN_FAMILY = "CloudFront" as const;
const REQUIRED_PLAN_TIER = "FREE" as const;

/**
 * Entrada del preflight: el plan de IaC sintetizado, la evidencia de cobertura
 * recopilada y el instante de comprobación. La evidencia es INYECTADA (no se
 * consulta AWS aquí) para que el veredicto sea puro y determinista.
 */
export type PreflightInput = Readonly<{
  plan: IacPlan;
  /** Evidencia de cobertura del 100 % del almacenamiento S3 Standard previsto. */
  storageCoverage: CoverageEvidence;
  /** Evidencia de cobertura por cada categoría de operación S3 (admin/origen). */
  operationCoverage: readonly CoverageEvidence[];
  /** Instante de la comprobación (ISO 8601); se registra en la evidencia. */
  checkedAt: string;
}>;

/**
 * Determina si la cobertura de las categorías de operación cubre EXACTAMENTE las
 * categorías previstas por el plan, sin lagunas ni sobrantes, y cada evidencia
 * es vigente a coste 0 €. Cualquier discrepancia (categoría prevista sin
 * evidencia, evidencia sin categoría prevista o cobertura no vigente) es fallo.
 *
 * @param plan Plan de IaC sintetizado.
 * @param operationCoverage Evidencia por categoría de operación.
 * @returns `true` solo si la correspondencia es exacta y toda cobertura vigente.
 */
function operationCoverageMatchesPlan(
  plan: IacPlan,
  operationCoverage: readonly CoverageEvidence[],
): boolean {
  const projected = projectedOperationCategoryIds(plan);
  const covered = new Set<string>();
  for (const evidence of operationCoverage) {
    if (!isCurrentZeroCostCoverage(evidence)) {
      return false;
    }
    if (!projected.has(evidence.category)) {
      return false;
    }
    covered.add(evidence.category);
  }
  return covered.size === projected.size;
}

/** Comprueba que el plan sea `CloudFront`/`FREE` y elegible (fail-closed). */
function isPlanEligible(plan: IacPlan): boolean {
  return plan.planEligible === true;
}

/** Indica si todas las comprobaciones de seguridad/coste están en `pass`. */
function allChecksPass(
  securityChecks: readonly GateCheck[],
  excludedResourcesCheck: GateCheck,
): boolean {
  if (!isPassingCheck(excludedResourcesCheck)) {
    return false;
  }
  return securityChecks.every(isPassingCheck);
}

/**
 * Calcula el veredicto fail-closed combinando cobertura, plan y comprobaciones.
 * Devuelve `allow` únicamente si TODAS las condiciones se cumplen; en cualquier
 * otro caso, `deny`.
 */
function concludeVerdict(
  plan: IacPlan,
  storageCoverage: CoverageEvidence,
  operationCoverage: readonly CoverageEvidence[],
  securityChecks: readonly GateCheck[],
  excludedResourcesCheck: GateCheck,
): PreflightConclusion {
  if (!isPlanEligible(plan)) {
    return "deny";
  }
  if (!isCurrentZeroCostCoverage(storageCoverage)) {
    return "deny";
  }
  if (!operationCoverageMatchesPlan(plan, operationCoverage)) {
    return "deny";
  }
  if (!allChecksPass(securityChecks, excludedResourcesCheck)) {
    return "deny";
  }
  return "allow";
}

/**
 * Ejecuta el Bloqueo de producción fail-closed y produce la `ProductionEvidence`
 * completa. Genera las comprobaciones desde el plan, evalúa la cobertura vigente
 * y concluye `allow` solo cuando se cumplen todas las condiciones.
 *
 * @param input Plan de IaC, evidencia de cobertura e instante de comprobación.
 * @returns Evidencia de despliegue inmutable con el veredicto fail-closed.
 */
export function productionPreflight(input: PreflightInput): ProductionEvidence {
  const { plan, storageCoverage, operationCoverage, checkedAt } = input;

  const securityChecks = deriveSecurityChecks(plan);
  const excludedResourcesCheck = deriveExcludedResourcesCheck(
    plan.presentCloudFormationTypes,
  );

  const conclusion = concludeVerdict(
    plan,
    storageCoverage,
    operationCoverage,
    securityChecks,
    excludedResourcesCheck,
  );

  const planEligibility: PlanEligibility = Object.freeze({
    family: REQUIRED_PLAN_FAMILY,
    tier: REQUIRED_PLAN_TIER,
    eligible: isPlanEligible(plan),
  });

  return Object.freeze({
    accountId: plan.accountId,
    distributionId: plan.distributionId,
    checkedAt,
    plan: planEligibility,
    s3Storage: storageCoverage,
    s3OperationCategories: Object.freeze([...operationCoverage]),
    securityChecks,
    excludedResourcesCheck,
    conclusion,
  });
}
