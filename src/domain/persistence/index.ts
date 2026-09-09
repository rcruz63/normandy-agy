/**
 * Modelos puros de persistencia del dominio: sobre versionado e integridad,
 * Paquete de copia de seguridad con su códec canónico (Tarea 16.1) y migración
 * de generaciones con su registro puro (Tarea 16.3).
 *
 * Reexporta el contrato del sobre, del `BackupCodec` y del `MigrationRegistry`
 * para que el adaptador de IndexedDB (`adapters/browser/indexeddb/`) y las
 * tareas 15.2/16.x los consuman sin acoplar el dominio a IndexedDB.
 */
export {
  CURRENT_ENVELOPE_VERSION,
  INTEGRITY_ALGORITHM,
  EnvelopeValidationError,
  canonicalize,
  computeIntegrity,
  sealEnvelope,
  openEnvelope,
} from "./versioned-envelope.js";
export type {
  EnvelopeCompatibility,
  VersionedEnvelope,
  SealEnvelopeInput,
  EnvelopeRejectionReason,
  CompatibilityPolicy,
  EnvelopeReadContext,
} from "./versioned-envelope.js";

export {
  BACKUP_FORMAT,
  CURRENT_CANONICALIZATION_VERSION,
} from "./backup-package.js";
export type {
  GameAggregate,
  BackupPackage,
  ValidatedBackup,
  BackupFailure,
  BackupRejectionReason,
} from "./backup-package.js";

export { CanonicalBackupCodec, createBackupCodec } from "./backup-codec.js";

export { migrationFailure, migrationSuccess } from "./migration.js";
export type {
  GenerationId,
  StorageGeneration,
  Migrator,
  MigrationPlan,
  MigrationRejectionReason,
  MigrationSuccess,
  MigrationFailure,
  MigrationResult,
} from "./migration.js";

export {
  InMemoryMigrationRegistry,
  createMigrationRegistry,
  DuplicateMigratorError,
} from "./migration-registry.js";
