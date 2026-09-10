/**
 * Denylist declarativa de recursos/características excluidos por coste
 * (Tarea 24.2, requisitos 28.3, 28.4, 28.16, 29.7, 29.8).
 *
 * El diseño (§Despliegue) exige la AUSENCIA EXPLÍCITA de dominio registrado,
 * Route 53 propio, Lambda@Edge, AWS KMS, DNSSEC, logs facturables, Amazon Data
 * Firehose y cualquier modalidad pay-as-you-go, además de excluir cualquier
 * recurso que pueda generar un precio mensual superior al Coste autorizado
 * (0 €) y la migración automática a pay-as-you-go.
 *
 * Este módulo NO despliega nada: declara la lista de tipos de recurso
 * CloudFormation y características prohibidos como estructura de datos inmutable
 * para que:
 *
 * - las pruebas de IaC (Tarea 24.3) puedan afirmar su ausencia en el plan
 *   sintetizado, y
 * - el preflight fail-closed (Tarea 25) pueda comprobar `excludedResourcesCheck`
 *   contra el plan de IaC real.
 *
 * La existencia de esta declaración NO demuestra por sí sola la elegibilidad ni
 * la cobertura: solo enumera lo que jamás debe aparecer.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Identificador estable de cada característica/recurso excluido. */
export type ExcludedFeatureId =
  | "cloudfront-pay-as-you-go"
  | "registered-domain"
  | "route53-hosted-zone"
  | "lambda-edge"
  | "aws-kms"
  | "dnssec"
  | "cloudfront-function-logs"
  | "additional-cloudwatch-metrics"
  | "billable-cloudwatch-logs"
  | "cloudwatch-log-queries"
  | "amazon-data-firehose"
  | "automatic-pay-as-you-go-migration"
  | "non-free-plan-features";

/**
 * Entrada de la denylist: describe una característica/recurso prohibido, los
 * tipos de recurso CloudFormation asociados (cuando aplica) y el requisito que
 * ordena su exclusión.
 */
export type ExcludedFeature = Readonly<{
  /** Identificador estable de la exclusión. */
  id: ExcludedFeatureId;
  /** Descripción en es-ES de qué se excluye y por qué. */
  description: string;
  /**
   * Tipos de recurso CloudFormation cuya presencia en el plan de IaC delata la
   * característica prohibida. Vacío cuando la exclusión es de configuración
   * (p. ej. una propiedad o modalidad) y no de un tipo de recurso concreto.
   */
  cloudFormationTypes: readonly string[];
  /** Referencias a criterios de aceptación (requisitos 28/29). */
  requirementRefs: readonly string[];
}>;

/**
 * Denylist canónica de recursos y características excluidos del Plan Gratuito
 * CloudFront. Cualquier aparición de estos tipos o modalidades en el plan de
 * IaC debe causar el bloqueo del despliegue.
 */
export const EXCLUDED_FEATURES: readonly ExcludedFeature[] = Object.freeze([
  {
    id: "cloudfront-pay-as-you-go",
    description:
      "CloudFront en modalidad pay-as-you-go: la distribución solo puede " +
      "asociarse al Plan Gratuito CloudFront de 0 USD/mes.",
    cloudFormationTypes: [],
    requirementRefs: ["28.1", "28.3", "28.4"],
  },
  {
    id: "registered-domain",
    description:
      "Dominio registrado propio: solo se usa el Dominio CloudFront " +
      "*.cloudfront.net incluido en el plan.",
    cloudFormationTypes: [
      "AWS::Route53Domains::Domain",
      "AWS::CloudFront::Distribution.Aliases",
    ],
    requirementRefs: ["28.2", "28.3", "28.4"],
  },
  {
    id: "route53-hosted-zone",
    description:
      "Route 53 propio (zonas alojadas, registros y health checks): DNS " +
      "incluido por el Dominio CloudFront, sin canales facturables.",
    cloudFormationTypes: [
      "AWS::Route53::HostedZone",
      "AWS::Route53::RecordSet",
      "AWS::Route53::RecordSetGroup",
      "AWS::Route53::HealthCheck",
    ],
    requirementRefs: ["28.3", "28.4"],
  },
  {
    id: "lambda-edge",
    description:
      "Lambda@Edge: la lógica de borde permitida es exclusivamente " +
      "CloudFront Functions incluidas en el plan.",
    cloudFormationTypes: [
      "AWS::Lambda::Function",
      "AWS::CloudFront::Distribution.LambdaFunctionAssociation",
    ],
    requirementRefs: ["28.2", "28.3", "28.4"],
  },
  {
    id: "aws-kms",
    description:
      "AWS KMS: el cifrado permitido es únicamente el administrado incluido " +
      "sin coste; no se declaran claves KMS.",
    cloudFormationTypes: [
      "AWS::KMS::Key",
      "AWS::KMS::Alias",
      "AWS::KMS::ReplicaKey",
    ],
    requirementRefs: ["28.3", "28.4"],
  },
  {
    id: "dnssec",
    description:
      "DNSSEC: no se habilita firma DNSSEC ni claves de firma de zona.",
    cloudFormationTypes: [
      "AWS::Route53::DNSSEC",
      "AWS::Route53::KeySigningKey",
    ],
    requirementRefs: ["28.3", "28.4"],
  },
  {
    id: "cloudfront-function-logs",
    description:
      "Logs de CloudFront Functions: no se habilita registro de ejecución " +
      "de funciones (canal facturable).",
    cloudFormationTypes: [],
    requirementRefs: ["28.3", "29.7", "29.8"],
  },
  {
    id: "additional-cloudwatch-metrics",
    description:
      "Métricas adicionales de CloudWatch no incluidas: la monitorización se " +
      "limita a capacidades incluidas sin coste.",
    cloudFormationTypes: [
      "AWS::CloudWatch::Alarm",
      "AWS::CloudFront::MonitoringSubscription",
    ],
    requirementRefs: ["28.3", "29.7", "29.8"],
  },
  {
    id: "billable-cloudwatch-logs",
    description:
      "Almacenamiento de registros CloudWatch facturable: no se declaran " +
      "grupos ni flujos de logs facturables.",
    cloudFormationTypes: [
      "AWS::Logs::LogGroup",
      "AWS::Logs::LogStream",
    ],
    requirementRefs: ["28.3", "29.7", "29.8"],
  },
  {
    id: "cloudwatch-log-queries",
    description:
      "Consultas de CloudWatch Logs no incluidas: no se declaran " +
      "consultas/definiciones facturables.",
    cloudFormationTypes: ["AWS::Logs::QueryDefinition"],
    requirementRefs: ["28.3", "29.7", "29.8"],
  },
  {
    id: "amazon-data-firehose",
    description:
      "Amazon Data Firehose: no se declara ningún canal de entrega de datos.",
    cloudFormationTypes: ["AWS::KinesisFirehose::DeliveryStream"],
    requirementRefs: ["28.3", "29.8"],
  },
  {
    id: "automatic-pay-as-you-go-migration",
    description:
      "Migración automática a pay-as-you-go: la suscripción FREE no habilita " +
      "conversión automática a la modalidad de pago por uso.",
    cloudFormationTypes: [],
    requirementRefs: ["28.16", "28.4"],
  },
  {
    id: "non-free-plan-features",
    description:
      "Cualquier función no incluida en el Plan Gratuito CloudFront o que " +
      "pueda generar un precio mensual superior al Coste autorizado (0 €).",
    cloudFormationTypes: [],
    requirementRefs: ["28.3", "28.4"],
  },
]);

/**
 * Conjunto plano de tipos de recurso CloudFormation prohibidos, derivado de la
 * denylist. Útil para que las pruebas de IaC y el preflight comprueben la
 * ausencia por tipo de recurso.
 */
export const EXCLUDED_CLOUDFORMATION_TYPES: ReadonlySet<string> = Object.freeze(
  new Set<string>(
    EXCLUDED_FEATURES.flatMap((feature) => feature.cloudFormationTypes),
  ),
) as ReadonlySet<string>;

/**
 * Indica si un tipo de recurso CloudFormation está en la denylist de coste.
 *
 * @param cloudFormationType Tipo de recurso, p. ej. `AWS::Lambda::Function`.
 * @returns `true` si el tipo está explícitamente excluido.
 */
export function isExcludedCloudFormationType(
  cloudFormationType: string,
): boolean {
  return EXCLUDED_CLOUDFORMATION_TYPES.has(cloudFormationType);
}

/**
 * Resultado de comprobar una lista de tipos de recurso frente a la denylist.
 */
export type ExclusionAssertion = Readonly<{
  /** `true` si NINGÚN tipo de la entrada aparece en la denylist. */
  clean: boolean;
  /** Tipos de la entrada que violan la denylist (vacío si `clean`). */
  violations: readonly string[];
}>;

/**
 * Comprueba que un conjunto de tipos de recurso previstos no incluye ningún
 * tipo excluido. Base declarativa para `excludedResourcesCheck` del preflight.
 *
 * @param presentCloudFormationTypes Tipos de recurso presentes en el plan.
 * @returns Aserción con el veredicto y las violaciones encontradas.
 */
export function assertNoExcludedResources(
  presentCloudFormationTypes: readonly string[],
): ExclusionAssertion {
  const violations = presentCloudFormationTypes.filter((type) =>
    EXCLUDED_CLOUDFORMATION_TYPES.has(type),
  );
  return Object.freeze({
    clean: violations.length === 0,
    violations: Object.freeze([...violations]),
  });
}
