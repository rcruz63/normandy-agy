/**
 * Modelo del plan de IaC del que el preflight DERIVA las categorías de operación
 * S3 previstas y los hechos de seguridad (Tarea 25.1, requisitos 27.9-27.11,
 * 28.9-28.15, diseño §11).
 *
 * El diseño exige que el preflight derive del plan de IaC TODAS las categorías
 * de operación previstas —administración y lecturas de origen— y que la lista NO
 * se limite a ejemplos predefinidos: cualquier categoría nueva que aparezca en
 * el plan debe exigir su propia evidencia y, de faltar, causar `deny`.
 *
 * Este módulo describe el plan como estructura de datos inyectable (sin llamar a
 * AWS ni desplegar) para que el preflight sea una función pura y determinista,
 * verificable sin credenciales en vivo. El pipeline de despliegue construye este
 * plan a partir de la síntesis CDK real; aquí solo se define su forma.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Unidad canónica del volumen de almacenamiento S3 Standard previsto. */
export const STORAGE_UNIT_GB = "GB" as const;

/**
 * Naturaleza de una Categoría de operación S3 prevista: solicitudes
 * administrativas (síntesis/despliegue) o lecturas de origen de la distribución.
 * El diseño exige cubrir AMBAS.
 */
export type S3OperationKind = "admin" | "origin-read";

/**
 * Categoría de operación S3 prevista derivada del plan de IaC. Cada categoría
 * requiere su propia `CoverageEvidence` vigente a coste 0 €.
 */
export type S3OperationCategory = Readonly<{
  /** Identificador estable de la categoría (debe casar con la evidencia). */
  category: string;
  /** Naturaleza de la operación (admin o lectura de origen). */
  kind: S3OperationKind;
  /** Volumen previsto de solicitudes para la categoría. */
  projectedQuantity: number;
  /** Unidad del volumen previsto (p. ej. `requests/mes`). */
  unit: string;
}>;

/** Volumen de almacenamiento S3 Standard previsto por el plan de IaC. */
export type S3StoragePlan = Readonly<{
  /** Identificador estable de la categoría de almacenamiento. */
  category: string;
  /** Volumen previsto de almacenamiento. */
  projectedQuantity: number;
  /** Unidad del volumen (siempre `GB` para S3 Standard). */
  unit: typeof STORAGE_UNIT_GB;
}>;

/**
 * Hechos de seguridad/coste observados en el plan de IaC sintetizado. Cada campo
 * es un tri-estado explícito (`true`/`false`/`"unknown"`) para permitir el
 * mapeo fail-closed: lo desconocido cuenta como incumplido.
 */
export type SecurityFact = boolean | "unknown";

/**
 * Hechos derivados del plan de IaC que el preflight traduce a `GateCheck`. No
 * incluye secretos: solo veredictos observados sobre la configuración.
 */
export type IacSecurityFacts = Readonly<{
  /** La distribución sirve exclusivamente por HTTPS (27.10). */
  httpsOnly: SecurityFact;
  /** Se usa el Dominio CloudFront `*.cloudfront.net` sin alias/dominio propio. */
  usesCloudFrontDomainOnly: SecurityFact;
  /** El Origen privado bloquea todo acceso público (27.9). */
  s3PublicAccessBlocked: SecurityFact;
  /** La distribución lee del origen mediante OAC. */
  originAccessControlEnabled: SecurityFact;
  /** Los roles conceden solo permisos mínimos necesarios (27.11). */
  minimumPrivilege: SecurityFact;
  /** El plan `FREE` no habilita pay-as-you-go ni migración automática (28.16). */
  noPayAsYouGoOrMigration: SecurityFact;
  /** El volumen S3 previsto cabe en el crédito aplicable (28.10). */
  s3VolumeWithinCredit: SecurityFact;
  /** La autenticación es válida y no expone secretos en artefactos (26.6/26.7). */
  authValidWithoutExposedSecrets: SecurityFact;
}>;

/**
 * Plan de IaC completo que consume el preflight. Combina identidad de
 * cuenta/distribución, el almacenamiento y las categorías de operación previstas
 * y los tipos de recurso CloudFormation presentes (para la denylist).
 */
export type IacPlan = Readonly<{
  /** Cuenta AWS objetivo del despliegue. */
  accountId: string;
  /** Distribución CloudFront objetivo. */
  distributionId: string;
  /** Almacenamiento S3 Standard previsto. */
  s3Storage: S3StoragePlan;
  /** Todas las categorías de operación S3 previstas (admin y origen). */
  s3OperationCategories: readonly S3OperationCategory[];
  /** Elegibilidad de la cuenta/distribución para el plan `FREE`. */
  planEligible: SecurityFact;
  /** Tipos de recurso CloudFormation presentes en el plan sintetizado. */
  presentCloudFormationTypes: readonly string[];
  /** Hechos de seguridad/coste observados en el plan. */
  securityFacts: IacSecurityFacts;
}>;

/**
 * Extrae el conjunto de identificadores de categoría de operación S3 previstos
 * por el plan. Base para comparar contra las categorías con evidencia demostrada
 * y detectar cualquier categoría nueva sin cobertura.
 *
 * @param plan Plan de IaC sintetizado.
 * @returns Conjunto de identificadores de categoría previstos.
 */
export function projectedOperationCategoryIds(
  plan: IacPlan,
): ReadonlySet<string> {
  return new Set(plan.s3OperationCategories.map((operation) => operation.category));
}
