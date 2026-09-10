/**
 * Punto de entrada del esquema de catálogo y fuente (Tarea 2.1).
 *
 * Reexporta los tipos `Readonly` del catálogo canónico y sus constructores
 * validadores para que las tareas de fixtures (3.x), el compilador (2.2) y el
 * Publication Gate (2.3) los consuman. Módulo puro, sin dependencias de
 * plataforma.
 */
export type {
  SourceVersion,
  MissionRefString,
  SourceRef,
  SourceRefInput,
} from "./source-ref.js";
export {
  SOURCE_VERSION,
  MIN_MISSION_NUMBER,
  MAX_MISSION_NUMBER,
  GENERAL_RULES_FIRST_PAGE,
  GENERAL_RULES_LAST_PAGE,
  MISSION_INDEX_PAGE,
  COUNTERS_INVENTORY_PAGE,
  InvalidSourceRefError,
  formatMissionNumber,
  missionRulesPage,
  missionMapPage,
  missionRefString,
  parseMissionNumber,
  isMissionRefString,
  sourceRef,
} from "./source-ref.js";

export type {
  PublicationBlockerKind,
  PublicationStatus,
  DecisionStatus,
  DecisionAlternative,
  DecisionRecord,
  ConformanceStatus,
  ConformanceEntry,
  ResourceOwnership,
  LicenseEntry,
  VisualReviewRecord,
  AcceptanceOutcome,
  AcceptanceRun,
} from "./publication.js";
export {
  InvalidPublicationDataError,
  publishedStatus,
  blockedStatus,
  isPublished,
  decisionAlternative,
  decisionRecord,
  conformanceEntry,
  licenseEntry,
  visualReviewRecord,
  acceptanceRun,
} from "./publication.js";

export type {
  CatalogItem,
  CanonicalRule,
  TableRow,
  CanonicalTable,
  DurationOptions,
  MissionDefinition,
  RulesCatalog,
} from "./catalog.js";
export {
  DURATION_OPTIONS,
  InvalidCatalogModelError,
  catalogItem,
  canonicalRule,
  canonicalTable,
  missionDefinition,
  rulesCatalog,
} from "./catalog.js";

export type {
  HexMapDefinition,
  PieceDefinition,
  ObjectiveDefinition,
  SetupDefinition,
  BritishForceKind,
  SquadDesignation,
  ForceEntry,
  RevealResult,
  OrderTableInput,
  OrderCode,
  OrderTableResult,
  OrderTable,
  DeclarativePredicate,
  DeclarativeEffect,
} from "./placeholders.js";

export type {
  MaintenanceCatalog,
  CatalogValidationCode,
  CatalogValidationError,
  CatalogBuildResult,
  CatalogCompiler,
} from "./build.js";
