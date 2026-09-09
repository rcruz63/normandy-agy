/**
 * Modelos puros de persistencia del dominio: sobre versionado e integridad.
 *
 * Reexporta el contrato del sobre para que el adaptador de IndexedDB
 * (`adapters/browser/indexeddb/`) y las tareas 15.2/16.x lo consuman sin
 * acoplar el dominio a IndexedDB.
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
