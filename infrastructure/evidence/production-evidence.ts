/**
 * Tipos y validadores de la evidencia de despliegue fail-closed
 * (Tarea 25.1, requisitos 27.9-27.11, 28.9-28.15, 29.9-29.12, diseño §11
 * «IaC, Bloqueo de producción y observabilidad» y §«Evidencia de despliegue»).
 *
 * Define las estructuras EXACTAS del diseño (`CoverageEvidence`, `GateCheck`,
 * `ProductionEvidence`) como tipos `Readonly` y las reglas fail-closed que las
 * gobiernan:
 *
 * - Una `CoverageEvidence` solo cuenta como cobertura demostrada si está
 *   VIGENTE (fecha de condiciones no caducada respecto a la comprobación) Y
 *   declara explícitamente `fullyCoveredAtZeroCost` con la elegibilidad de la
 *   cuenta comprobada. Cualquier laguna deja la categoría SIN cubrir.
 * - Un `GateCheck` con estado `unknown` equivale a `fail` (diseño: «`unknown`
 *   equivale a `fail`»); solo `pass` contribuye a permitir.
 *
 * Una estimación, el límite nominal de 5 GB, un Aviso de franquicia o el Zero
 * spend budget NUNCA convierten una laguna en cobertura: este módulo modela solo
 * la evidencia demostrada, sin asumir cobertura no verificada.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Coste autorizado por el diseño (DC-009). Cualquier otro importe bloquea. */
export const AUTHORIZED_MONTHLY_COST_EUR = 0 as const;

/**
 * Cobertura gratuita verificada de una parte del plan: el almacenamiento S3
 * Standard o una Categoría de operación S3 prevista. Refleja el tipo del diseño
 * §«Evidencia de despliegue».
 */
export type CoverageEvidence = Readonly<{
  /** Categoría cubierta (almacenamiento o Categoría de operación S3). */
  category: string;
  /** Volumen previsto para esa categoría bajo el plan de IaC. */
  projectedQuantity: number;
  /** Unidad del volumen previsto (p. ej. `GB`, `requests/mes`). */
  unit: string;
  /** Origen verificable de la cobertura (condición del plan/cuenta). */
  coverageSource: string;
  /** Fecha de vigencia de las condiciones consultadas (ISO 8601). */
  termsEffectiveAt: string;
  /** Instante en que se comprobó la cobertura (ISO 8601). */
  checkedAt: string;
  /** Indica si se comprobó la elegibilidad de la cuenta para la cobertura. */
  accountEligibilityChecked: boolean;
  /** Indica si el 100 % de la categoría queda cubierto a coste 0 €. */
  fullyCoveredAtZeroCost: boolean;
}>;

/** Estados posibles de una comprobación del Bloqueo de producción. */
export type GateCheckStatus = "pass" | "fail" | "unknown";

/**
 * Comprobación individual de seguridad/coste del Bloqueo de producción. `pass`
 * es el único estado que permite promoción; `unknown` equivale a `fail`.
 */
export type GateCheck = Readonly<{
  /** Identificador estable de la comprobación (en inglés, sin valores mágicos). */
  id: string;
  /** Estado de la comprobación. `unknown` cuenta como `fail`. */
  status: GateCheckStatus;
  /** Referencias a la evidencia que respalda el estado (no credenciales). */
  evidenceRefs: readonly string[];
}>;

/** Familia y nivel de plan permitidos. Cualquier otra combinación bloquea. */
export type PlanEligibility = Readonly<{
  family: "CloudFront";
  tier: "FREE";
  /** Elegibilidad de la cuenta/distribución para el plan `FREE`. */
  eligible: boolean;
}>;

/** Veredicto del Bloqueo de producción. */
export type PreflightConclusion = "allow" | "deny";

/**
 * Evidencia de despliegue completa que exige la fase `promote` del pipeline.
 * Refleja EXACTAMENTE el tipo del diseño §11. Solo `conclusion === "allow"`
 * autoriza crear o actualizar producción.
 */
export type ProductionEvidence = Readonly<{
  accountId: string;
  distributionId: string;
  /** Instante de generación de la evidencia (ISO 8601). */
  checkedAt: string;
  plan: PlanEligibility;
  /** Cobertura del 100 % del almacenamiento S3 Standard previsto. */
  s3Storage: CoverageEvidence;
  /** Cobertura de cada Categoría de operación S3 prevista (admin y origen). */
  s3OperationCategories: readonly CoverageEvidence[];
  /** Comprobaciones de seguridad, transporte, dominio, OAC, permisos y auth. */
  securityChecks: readonly GateCheck[];
  /** Comprobación de ausencia de recursos/características excluidos por coste. */
  excludedResourcesCheck: GateCheck;
  conclusion: PreflightConclusion;
}>;

/**
 * Indica si un `GateCheck` contribuye a permitir la promoción. Solo `pass`
 * cuenta; `unknown` equivale a `fail` (diseño §«Evidencia de despliegue»).
 *
 * @param check Comprobación a evaluar.
 * @returns `true` únicamente si el estado es `pass`.
 */
export function isPassingCheck(check: GateCheck): boolean {
  return check.status === "pass";
}

/**
 * Comprueba si una fecha ISO 8601 es válida y no posterior a la referencia.
 * Una fecha ausente, malformada o futura respecto a la comprobación invalida la
 * vigencia (fail-closed): no se puede demostrar cobertura con datos inválidos.
 *
 * @param isoDate Fecha en formato ISO 8601 a validar.
 * @param notAfter Instante de referencia (normalmente `checkedAt`).
 * @returns `true` si la fecha es válida y anterior o igual a la referencia.
 */
function isEffectiveOnOrBefore(isoDate: string, notAfter: Date): boolean {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= notAfter.getTime();
}

/**
 * Determina si una `CoverageEvidence` demuestra cobertura VIGENTE a coste 0 €.
 * Fail-closed: exige elegibilidad comprobada, cobertura total declarada,
 * cantidad prevista no negativa y fechas válidas donde la vigencia de las
 * condiciones no es posterior al instante de comprobación.
 *
 * @param evidence Evidencia de cobertura a evaluar.
 * @returns `true` solo si la cobertura es demostrada, total y vigente.
 */
export function isCurrentZeroCostCoverage(evidence: CoverageEvidence): boolean {
  if (!evidence.accountEligibilityChecked) {
    return false;
  }
  if (!evidence.fullyCoveredAtZeroCost) {
    return false;
  }
  if (!Number.isFinite(evidence.projectedQuantity)) {
    return false;
  }
  if (evidence.projectedQuantity < 0) {
    return false;
  }
  const checkedAt = new Date(evidence.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) {
    return false;
  }
  return isEffectiveOnOrBefore(evidence.termsEffectiveAt, checkedAt);
}
