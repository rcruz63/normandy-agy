/**
 * Declaración del Plan Gratuito CloudFront y las capacidades incluidas
 * (Tarea 24.2, requisitos 28.1, 28.2).
 *
 * El diseño (§Investigación técnica y §Despliegue) fija que la suscripción del
 * plan se declara como `AWS::PricingPlanManager::Subscription` con
 * `PlanFamily=CloudFront` y `PlanTier=FREE`, y que la entrega se limita a la
 * forma incluida por el plan: distribución estándar, AWS WAF incluido,
 * protección DDoS incluida, TLS incluido, DNS incluido por el Dominio
 * CloudFront, CloudFront Functions incluidas y un Origen privado S3 Standard.
 *
 * IMPORTANTE: la existencia de este recurso declarativo NO demuestra la
 * elegibilidad de la cuenta ni la cobertura S3. El preflight fail-closed
 * (Tarea 25, fuera de alcance aquí) comprueba esas condiciones en la cuenta.
 * Este módulo solo DECLARA el plan y las capacidades incluidas como estructura
 * inmutable para que las pruebas de IaC (Tarea 24.3) puedan afirmarlas.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Familia de plan aprobada. El único valor permitido es CloudFront. */
export const PLAN_FAMILY = "CloudFront" as const;

/** Nivel de plan aprobado. El único valor permitido es FREE (0 USD/mes). */
export const PLAN_TIER = "FREE" as const;

/** Tipo de recurso CloudFormation de la suscripción del plan. */
export const PLAN_SUBSCRIPTION_RESOURCE_TYPE =
  "AWS::PricingPlanManager::Subscription" as const;

/**
 * Suscripción declarativa al Plan Gratuito CloudFront. Corresponde a las
 * propiedades del recurso `AWS::PricingPlanManager::Subscription` aprobado.
 */
export type PricingPlanSubscription = Readonly<{
  /** Tipo de recurso CloudFormation declarado. */
  resourceType: typeof PLAN_SUBSCRIPTION_RESOURCE_TYPE;
  /** Familia de plan: siempre CloudFront. */
  planFamily: typeof PLAN_FAMILY;
  /** Nivel de plan: siempre FREE. */
  planTier: typeof PLAN_TIER;
  /** Precio mensual comprometido por el plan, en USD (siempre 0). */
  monthlyPriceUsd: 0;
}>;

/**
 * Identificador de cada capacidad incluida sin coste por el Plan Gratuito
 * CloudFront (requisito 28.2).
 */
export type IncludedCapabilityId =
  | "standard-distribution"
  | "aws-waf-included"
  | "ddos-protection-included"
  | "tls-included"
  | "cloudfront-dns-included"
  | "cloudfront-functions-included"
  | "s3-standard-private-origin";

/** Capacidad incluida sin coste y el requisito que la habilita. */
export type IncludedCapability = Readonly<{
  id: IncludedCapabilityId;
  description: string;
  requirementRefs: readonly string[];
}>;

/**
 * Capacidades incluidas sin coste por el Plan Gratuito CloudFront. La entrega
 * se limita EXCLUSIVAMENTE a estas capacidades (requisito 28.2).
 */
export const INCLUDED_CAPABILITIES: readonly IncludedCapability[] = Object.freeze(
  [
    {
      id: "standard-distribution",
      description: "Distribución CloudFront estándar incluida en el plan.",
      requirementRefs: ["28.2"],
    },
    {
      id: "aws-waf-included",
      description:
        "AWS WAF incluido en la forma que el plan aprobado cubre sin coste.",
      requirementRefs: ["28.2"],
    },
    {
      id: "ddos-protection-included",
      description: "Protección DDoS incluida (AWS Shield Standard).",
      requirementRefs: ["28.2"],
    },
    {
      id: "tls-included",
      description: "TLS incluido para el Dominio CloudFront.",
      requirementRefs: ["28.2"],
    },
    {
      id: "cloudfront-dns-included",
      description:
        "DNS incluido por el Dominio CloudFront *.cloudfront.net, sin " +
        "dominios ni zonas propias.",
      requirementRefs: ["28.2"],
    },
    {
      id: "cloudfront-functions-included",
      description:
        "CloudFront Functions incluidas (runtime 2.0), sin Lambda@Edge.",
      requirementRefs: ["28.2"],
    },
    {
      id: "s3-standard-private-origin",
      description: "Origen privado S3 Standard tras OAC, sin acceso público.",
      requirementRefs: ["28.2"],
    },
  ],
);

/** Tipo de recurso CloudFormation del Web ACL de AWS WAF incluido. */
export const WEB_ACL_RESOURCE_TYPE = "AWS::WAFv2::WebACL" as const;

/**
 * Declaración del Web ACL incluido por el plan. Se declara únicamente en la
 * forma incluida por el Plan Gratuito CloudFront (requisito 28.2); no habilita
 * canales facturables (logging, métricas adicionales) — esos quedan en la
 * denylist de `cost-exclusions.ts`.
 */
export type IncludedWebAcl = Readonly<{
  resourceType: typeof WEB_ACL_RESOURCE_TYPE;
  /** Ámbito del Web ACL para CloudFront (global). */
  scope: "CLOUDFRONT";
  /** Indica que el Web ACL es la forma incluida por el plan, sin coste extra. */
  includedByPlan: true;
}>;

/**
 * Declaración completa del plan de coste cero: suscripción FREE, WAF incluido y
 * capacidades incluidas. Estructura inmutable consumible por las pruebas de IaC
 * y por el preflight.
 */
export type FreePlanDeclaration = Readonly<{
  subscription: PricingPlanSubscription;
  webAcl: IncludedWebAcl;
  includedCapabilities: readonly IncludedCapability[];
}>;

/**
 * Construye la declaración canónica del Plan Gratuito CloudFront con WAF
 * incluido y las capacidades permitidas.
 *
 * @returns Declaración inmutable del plan FREE aprobado.
 */
export function createFreePlanDeclaration(): FreePlanDeclaration {
  const subscription: PricingPlanSubscription = Object.freeze({
    resourceType: PLAN_SUBSCRIPTION_RESOURCE_TYPE,
    planFamily: PLAN_FAMILY,
    planTier: PLAN_TIER,
    monthlyPriceUsd: 0,
  });

  const webAcl: IncludedWebAcl = Object.freeze({
    resourceType: WEB_ACL_RESOURCE_TYPE,
    scope: "CLOUDFRONT",
    includedByPlan: true,
  });

  return Object.freeze({
    subscription,
    webAcl,
    includedCapabilities: INCLUDED_CAPABILITIES,
  });
}
