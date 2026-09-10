/**
 * Composición del plan de coste cero: suscripción FREE + WAF incluido, Zero
 * spend budget con Avisos de franquicia y denylist de recursos excluidos
 * (Tarea 24.2, requisitos 28.1-28.4, 28.16, 29.1-29.8).
 *
 * Reúne los tres módulos declarativos (`cost-plan`, `cost-budget`,
 * `cost-exclusions`) en una única declaración inmutable que las pruebas de IaC
 * (Tarea 24.3) pueden afirmar y que el preflight fail-closed (Tarea 25) puede
 * comprobar contra el plan de IaC real. NO recrea el bucket S3, el OAC ni la
 * distribución CloudFront (Tarea 24.1): se compone junto a ellos.
 *
 * La existencia de estas declaraciones NO demuestra elegibilidad ni cobertura;
 * solo declara la forma aprobada del coste cero.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */
import {
  createFreePlanDeclaration,
  type FreePlanDeclaration,
} from "./cost-plan.js";
import {
  createCostMonitoringDeclaration,
  type CostMonitoringDeclaration,
} from "./cost-budget.js";
import { EXCLUDED_FEATURES, type ExcludedFeature } from "./cost-exclusions.js";

/**
 * Declaración completa del coste cero de la Plataforma AWS: plan FREE, WAF
 * incluido, monitorización gratuita (Zero spend budget + Avisos de franquicia)
 * y denylist de recursos/características excluidos.
 */
export type CostPlanDeclaration = Readonly<{
  plan: FreePlanDeclaration;
  monitoring: CostMonitoringDeclaration;
  excludedFeatures: readonly ExcludedFeature[];
}>;

/**
 * Construye la declaración completa de coste cero para un correo verificable
 * dado.
 *
 * @param recipientEmail Correo verificable para avisos y presupuesto.
 * @returns Declaración inmutable del plan FREE, la monitorización y la denylist.
 * @throws {import("./cost-budget.js").CostMonitoringConfigError} Si el correo
 *   no tiene forma válida.
 */
export function createCostPlanDeclaration(
  recipientEmail: string,
): CostPlanDeclaration {
  return Object.freeze({
    plan: createFreePlanDeclaration(),
    monitoring: createCostMonitoringDeclaration(recipientEmail),
    excludedFeatures: EXCLUDED_FEATURES,
  });
}
