/**
 * Derivación de las comprobaciones de seguridad/coste del Bloqueo de producción
 * a partir de los hechos del plan de IaC (Tarea 25.1, requisitos 27.9-27.11,
 * 28.9-28.16, diseño §11).
 *
 * Traduce cada hecho tri-estado (`true`/`false`/`"unknown"`) a un `GateCheck`
 * fail-closed: `true` → `pass`, `false` → `fail`, `"unknown"` → `unknown`
 * (que a su vez equivale a `fail` al concluir). No asume ningún hecho por
 * defecto: la ausencia de veredicto es `unknown`, no `pass`.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */
import {
  EXCLUDED_CLOUDFORMATION_TYPES,
} from "../stacks/cost-exclusions.js";
import type { GateCheck, GateCheckStatus } from "../evidence/production-evidence.js";
import type { IacPlan, IacSecurityFacts, SecurityFact } from "./iac-plan.js";

/** Identificadores estables de cada comprobación de seguridad/coste. */
export const SECURITY_CHECK_IDS = Object.freeze({
  planEligibility: "plan-free-eligibility",
  httpsOnly: "transport-https-only",
  cloudFrontDomain: "cloudfront-domain-only",
  publicAccessBlocked: "s3-public-access-blocked",
  originAccessControl: "origin-access-control",
  minimumPrivilege: "minimum-privilege",
  noPayAsYouGo: "no-pay-as-you-go-or-migration",
  s3VolumeWithinCredit: "s3-volume-within-credit",
  authWithoutSecrets: "auth-valid-without-exposed-secrets",
  excludedResources: "no-excluded-resources",
} as const);

/**
 * Convierte un hecho tri-estado en un estado de `GateCheck`. Fail-closed: solo
 * `true` produce `pass`; `false` es `fail` y cualquier `"unknown"` se conserva
 * como `unknown` (que equivale a `fail` al concluir).
 *
 * @param fact Hecho observado en el plan de IaC.
 * @returns Estado del `GateCheck` correspondiente.
 */
function factToStatus(fact: SecurityFact): GateCheckStatus {
  if (fact === true) {
    return "pass";
  }
  if (fact === false) {
    return "fail";
  }
  return "unknown";
}

/**
 * Construye un `GateCheck` inmutable a partir de un identificador, un hecho y
 * sus referencias de evidencia.
 */
function buildCheck(
  id: string,
  fact: SecurityFact,
  evidenceRefs: readonly string[],
): GateCheck {
  return Object.freeze({
    id,
    status: factToStatus(fact),
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });
}

/**
 * Deriva la comprobación de ausencia de recursos/características excluidos por
 * coste. Es `fail` si el plan declara cualquier tipo de la denylist; `pass` si
 * no hay ninguno. No es `unknown` porque la presencia de tipos es un hecho
 * observable directamente en el plan sintetizado.
 *
 * @param presentCloudFormationTypes Tipos de recurso presentes en el plan.
 * @returns `GateCheck` de recursos excluidos con las violaciones como refs.
 */
export function deriveExcludedResourcesCheck(
  presentCloudFormationTypes: readonly string[],
): GateCheck {
  const violations = presentCloudFormationTypes.filter((type) =>
    EXCLUDED_CLOUDFORMATION_TYPES.has(type),
  );
  return Object.freeze({
    id: SECURITY_CHECK_IDS.excludedResources,
    status: violations.length === 0 ? "pass" : "fail",
    evidenceRefs: Object.freeze([...violations]),
  });
}

/**
 * Deriva las comprobaciones de seguridad/coste (excepto recursos excluidos, que
 * tiene su propia función) a partir del plan de IaC. Cada hecho ausente o
 * desconocido queda como `unknown` (fail-closed).
 *
 * @param plan Plan de IaC sintetizado.
 * @returns Lista inmutable de `GateCheck` de seguridad y coste.
 */
export function deriveSecurityChecks(plan: IacPlan): readonly GateCheck[] {
  const facts: IacSecurityFacts = plan.securityFacts;
  return Object.freeze([
    buildCheck(SECURITY_CHECK_IDS.planEligibility, plan.planEligible, [
      "plan:AWS::PricingPlanManager::Subscription",
    ]),
    buildCheck(SECURITY_CHECK_IDS.httpsOnly, facts.httpsOnly, [
      "distribution:viewerProtocolPolicy",
    ]),
    buildCheck(
      SECURITY_CHECK_IDS.cloudFrontDomain,
      facts.usesCloudFrontDomainOnly,
      ["distribution:domainNames"],
    ),
    buildCheck(
      SECURITY_CHECK_IDS.publicAccessBlocked,
      facts.s3PublicAccessBlocked,
      ["bucket:blockPublicAccess"],
    ),
    buildCheck(
      SECURITY_CHECK_IDS.originAccessControl,
      facts.originAccessControlEnabled,
      ["distribution:originAccessControl"],
    ),
    buildCheck(SECURITY_CHECK_IDS.minimumPrivilege, facts.minimumPrivilege, [
      "iam:deploymentRole",
      "iam:originReadRole",
    ]),
    buildCheck(
      SECURITY_CHECK_IDS.noPayAsYouGo,
      facts.noPayAsYouGoOrMigration,
      ["plan:payAsYouGo", "plan:automaticMigration"],
    ),
    buildCheck(
      SECURITY_CHECK_IDS.s3VolumeWithinCredit,
      facts.s3VolumeWithinCredit,
      ["bucket:projectedStorage"],
    ),
    buildCheck(
      SECURITY_CHECK_IDS.authWithoutSecrets,
      facts.authValidWithoutExposedSecrets,
      ["access:verifierMaterial"],
    ),
  ]);
}
