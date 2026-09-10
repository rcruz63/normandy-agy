/**
 * Barrel de las declaraciones de coste cero (Tarea 24.2).
 *
 * Reexporta el Plan Gratuito CloudFront con WAF incluido, el Zero spend budget
 * con Avisos de franquicia y la denylist de recursos excluidos. Se mantiene
 * separado de `index.ts` para componerse junto al `HostingStack` (Tarea 24.1)
 * sin conflictos de edición. Módulo de `infrastructure/`: la PWA no lo importa
 * y no contiene secretos.
 */
export {
  PLAN_FAMILY,
  PLAN_TIER,
  PLAN_SUBSCRIPTION_RESOURCE_TYPE,
  WEB_ACL_RESOURCE_TYPE,
  INCLUDED_CAPABILITIES,
  createFreePlanDeclaration,
} from "./cost-plan.js";
export type {
  IncludedCapability,
  IncludedCapabilityId,
  IncludedWebAcl,
  PricingPlanSubscription,
  FreePlanDeclaration,
} from "./cost-plan.js";

export {
  BUDGET_RESOURCE_TYPE,
  FRANCHISE_NOTICE_THRESHOLDS,
  CostMonitoringConfigError,
  createCostMonitoringDeclaration,
} from "./cost-budget.js";
export type {
  FranchiseNotice,
  FranchiseNoticeThreshold,
  ZeroSpendBudget,
  CostMonitoringDeclaration,
} from "./cost-budget.js";

export {
  EXCLUDED_FEATURES,
  EXCLUDED_CLOUDFORMATION_TYPES,
  isExcludedCloudFormationType,
  assertNoExcludedResources,
} from "./cost-exclusions.js";
export type {
  ExcludedFeature,
  ExcludedFeatureId,
  ExclusionAssertion,
} from "./cost-exclusions.js";

export { createCostPlanDeclaration } from "./cost-plan-stack.js";
export type { CostPlanDeclaration } from "./cost-plan-stack.js";
