/**
 * Puertos del dominio: contratos que las capas externas implementan.
 *
 * Estas interfaces expresan las fronteras del diseño. El dominio depende solo
 * de estos contratos, nunca de implementaciones concretas (IndexedDB, Cache
 * API, red, reloj o SDK de AWS).
 */
export type {
  MaintenanceCatalog,
  RulesCatalog,
  CatalogBuildResult,
  PublicationReport,
  GameState,
  GameSnapshot,
  GameCommand,
  TransitionProposal,
  ActionDescriptor,
  DiceRollRequest,
  DiceRollResolution,
  DomainMessage,
  Diagnostic,
  RandomState,
  RandomRequest,
  RandomConsumption,
  CommandOutcome,
  PersistableTransition,
  CommitReceipt,
  GameSummary,
  GameAggregate,
  BackupPackage,
  ValidatedBackup,
  BackupFailure,
  MigrationPlan,
  MigrationResult,
  StorageGeneration,
  OfflinePackageManifest,
  OfflineAvailability,
  StagedPackageResult,
  ActivationResult,
} from "./placeholders.js";

export type { DiagnosticCategory } from "./game-persistence.js";

export type { RulesEngine, TransitionDecision } from "./rules-engine.js";
export type { VersionedRandom, RandomStep } from "./versioned-random.js";
export type { GameUnitOfWork, GameRepository } from "./game-repository.js";
export type { BackupCodec, MigrationRegistry } from "./backup-codec.js";
export type { OfflinePackageCoordinator } from "./offline-package-coordinator.js";
export type { CatalogCompiler, PublicationGate } from "./catalog.js";
