/**
 * Modelos puros de persistencia del dominio: sobre versionado e integridad, y
 * Paquete de copia de seguridad con su códec canónico (Tarea 16.1).
 *
 * Reexporta el contrato del sobre y del `BackupCodec` para que el adaptador de
 * IndexedDB (`adapters/browser/indexeddb/`) y las tareas 15.2/16.x los consuman
 * sin acoplar el dominio a IndexedDB.
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
