/**
 * Modelo puro del paquete de diagnóstico y recuperación (Tarea 17.1).
 *
 * La exportación es local, explícita y versionada. Puede transportar el sobre
 * que no pudo abrirse, la evidencia de versiones encontrada/soportada y los
 * diagnósticos que solo existen en memoria porque IndexedDB rechazó toda
 * escritura. No contiene credenciales ni abre canales de red.
 *
 * La integridad usa la misma suma canónica del resto de la persistencia. Solo
 * detecta alteración accidental: NO es firma, autenticación ni cifrado.
 */
import type { GameId, RulesVersion, SaveVersion, SnapshotId } from "../identity/index.js";
import type { IntegrityDescriptor } from "../engine/state.js";
import type { DomainMessage } from "../engine/transition.js";
import type { Diagnostic } from "../ports/game-persistence.js";
import {
  canonicalize,
  computeIntegrity,
  type CompatibilityPolicy,
  type EnvelopeIncompatibilityReason,
  type VersionedEnvelope,
} from "./versioned-envelope.js";

/** Marcador inequívoco del archivo local de diagnóstico. */
export const RECOVERY_EXPORT_FORMAT = "fields-of-normandy-recovery" as const;

/** Versión de la forma serializada del paquete de recuperación. */
export const CURRENT_RECOVERY_EXPORT_VERSION = 1 as const;

/** Declaración explícita del alcance criptográfico de la suma. */
export const RECOVERY_INTEGRITY_PURPOSE =
  "accidental-alteration-detection-only" as const;

/** Fase local en la que se detectó el fallo recuperable. */
export type RecoveryFailurePhase =
  | "resume"
  | "import"
  | "quarantine-write"
  | "storage-read";

/** Categoría estructurada consumible por una futura proyección de UI. */
export type RecoveryDiagnosticCategory =
  | "incompatible-version"
  | "storage-failure"
  | "storage-unavailable";

/** Motivo tipado del diagnóstico principal de recuperación. */
export type RecoveryDiagnosticReason =
  | EnvelopeIncompatibilityReason
  | "storage-write-failure"
  | "previous-backup-required";

/** Versiones observadas; cada campo solo aparece si la fuente lo declara. */
export type FoundCompatibilityVersions = Readonly<{
  envelopeVersion?: number;
  saveVersion?: SaveVersion;
  rulesVersion?: RulesVersion;
  algorithmVersion?: string;
}>;

/** Versiones aceptadas por el Entorno que intentó abrir/importar los datos. */
export type SupportedCompatibilityVersions = Readonly<{
  envelopeVersions: readonly number[];
  saveVersions: readonly SaveVersion[];
  rulesVersions: readonly RulesVersion[];
  algorithmVersions: readonly string[];
}>;

/** Evidencia completa para explicar una incompatibilidad sin texto libre. */
export type CompatibilityEvidence = Readonly<{
  found: FoundCompatibilityVersions;
  supported: SupportedCompatibilityVersions;
}>;

/** Diagnóstico identificable y estructurado de la operación bloqueada. */
export type RecoveryDiagnostic = Readonly<{
  diagnosticId: string;
  category: RecoveryDiagnosticCategory;
  phase: RecoveryFailurePhase;
  reason: RecoveryDiagnosticReason;
  gameId: GameId;
  snapshotId?: SnapshotId;
  message: DomainMessage;
  compatibility?: CompatibilityEvidence;
}>;

/** Sobre persistido afectado, conservado sin interpretarlo ni modificarlo. */
export type RecoveryArtifact = Readonly<{
  kind: "versioned-envelope";
  gameId: GameId;
  snapshotId?: SnapshotId;
  envelope: VersionedEnvelope<unknown>;
}>;

/** Diagnóstico pendiente copiado directamente desde el registro en memoria. */
export type ExportedPendingDiagnostic = Readonly<{
  diagnosticId: string;
  gameId: GameId;
  phase: RecoveryFailurePhase;
  diagnostic: Diagnostic;
  lastConfirmedSnapshotId?: SnapshotId;
  lastConfirmedAt?: string;
}>;

/** Cuerpo canónico cubierto por la suma de integridad. */
export type RecoveryExportBody = Readonly<{
  format: typeof RECOVERY_EXPORT_FORMAT;
  exportVersion: typeof CURRENT_RECOVERY_EXPORT_VERSION;
  integrityPurpose: typeof RECOVERY_INTEGRITY_PURPOSE;
  diagnostic: RecoveryDiagnostic;
  artifact?: RecoveryArtifact;
  pendingDiagnostics: readonly ExportedPendingDiagnostic[];
}>;

/** Paquete local listo para descargar/escribir por una futura capa de UI. */
export type RecoveryExportPackage = RecoveryExportBody &
  Readonly<{
    integrity: IntegrityDescriptor;
    bytes: Uint8Array;
  }>;

/** Entrada pura para construir una exportación local de recuperación. */
export type RecoveryExportInput = Readonly<{
  diagnostic: RecoveryDiagnostic;
  artifact?: RecoveryArtifact;
  pendingDiagnostics?: readonly ExportedPendingDiagnostic[];
}>;

interface Utf8Encoder {
  encode(input: string): Uint8Array;
}

declare const TextEncoder: { new (): Utf8Encoder };

/** Crea una foto inmutable de las versiones soportadas por una política. */
export function supportedCompatibilityVersions(
  policy: CompatibilityPolicy,
): SupportedCompatibilityVersions {
  return Object.freeze({
    envelopeVersions: Object.freeze([...policy.supportedEnvelopeVersions]),
    saveVersions: Object.freeze([...policy.supportedSaveVersions]),
    rulesVersions: Object.freeze([...policy.supportedRulesVersions]),
    algorithmVersions: Object.freeze([...policy.supportedAlgorithmVersions]),
  });
}

/** Compone evidencia de compatibilidad a partir de datos observados. */
export function compatibilityEvidence(
  found: FoundCompatibilityVersions,
  policy: CompatibilityPolicy,
): CompatibilityEvidence {
  return Object.freeze({
    found: Object.freeze({ ...found }),
    supported: supportedCompatibilityVersions(policy),
  });
}

/** Extrae las versiones declaradas por un sobre sin abrir su `payload`. */
export function envelopeCompatibilityEvidence(
  envelope: VersionedEnvelope<unknown>,
  policy: CompatibilityPolicy,
): CompatibilityEvidence {
  return compatibilityEvidence(
    {
      envelopeVersion: envelope.envelopeVersion,
      saveVersion: envelope.compatibility.saveVersion,
      rulesVersion: envelope.compatibility.rulesVersion,
      algorithmVersion: envelope.compatibility.algorithmVersion,
    },
    policy,
  );
}

/**
 * Serializa de forma canónica el diagnóstico, el sobre y los pendientes en
 * memoria. Los bytes solo se entregan al llamante; esta función no hace I/O.
 */
export function createRecoveryExport(
  input: RecoveryExportInput,
): RecoveryExportPackage {
  const pendingDiagnostics = Object.freeze([
    ...(input.pendingDiagnostics ?? []),
  ]);
  const base = {
    format: RECOVERY_EXPORT_FORMAT,
    exportVersion: CURRENT_RECOVERY_EXPORT_VERSION,
    integrityPurpose: RECOVERY_INTEGRITY_PURPOSE,
    diagnostic: input.diagnostic,
    pendingDiagnostics,
  };
  const body: RecoveryExportBody =
    input.artifact === undefined
      ? Object.freeze(base)
      : Object.freeze({ ...base, artifact: input.artifact });
  const integrity = computeIntegrity(body);
  const bytes = new TextEncoder().encode(canonicalize({ ...body, integrity }));
  return Object.freeze({ ...body, integrity, bytes });
}
