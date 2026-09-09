/**
 * Constructores puros de {@link Diagnostic} `es-ES` de recuperación (Tarea 15.4).
 *
 * Centraliza las claves `messageKey` y las categorías reutilizadas por la
 * cuarentena y recuperación de corrupción (requisitos 21.5-21.8, 19.9, 19.10):
 * un diagnóstico de sobre corrupto (`corrupt-snapshot`) y uno de fallo de
 * persistencia cuando ni siquiera la cuarentena puede escribirse
 * (`persistence-failure`). Reutiliza las categorías del puerto; no inventa
 * nuevas.
 *
 * FRONTERA DE CAPAS Y PUREZA: vive en `application/`. Es puro: compone mensajes
 * `es-ES` por clave (nunca texto interpolado en el dominio) sin I/O, reloj ni
 * `Math.random`.
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { DomainMessage } from "../../domain/engine/transition.js";
import type { Diagnostic } from "../../domain/ports/index.js";
import type {
  CompatibilityEvidence,
  EnvelopeIncompatibilityReason,
  EnvelopeRejectionReason,
  RecoveryDiagnostic,
} from "../../domain/persistence/index.js";

/** Clave `es-ES` del diagnóstico de sobre corrupto aislado en cuarentena. */
export const CORRUPT_SNAPSHOT_MESSAGE_KEY =
  "persistencia.recuperacion.sobreCorrupto";

/** Clave `es-ES` del diagnóstico de cuarentena no persistible (fallo de escritura). */
export const QUARANTINE_WRITE_FAILURE_MESSAGE_KEY =
  "persistencia.recuperacion.cuarentenaNoPersistible";

/** Clave `es-ES` para una reanudación bloqueada por versión incompatible. */
export const INCOMPATIBLE_VERSION_MESSAGE_KEY =
  "persistencia.recuperacion.versionIncompatible";

/** Clave `es-ES` que explica la única recuperación tras perder almacenamiento. */
export const PREVIOUS_BACKUP_REQUIRED_MESSAGE_KEY =
  "persistencia.recuperacion.copiaPreviaRequerida";

/**
 * Construye el {@link Diagnostic} de un sobre corrupto detectado al cargar. El
 * motivo tipado (`reason`) del sobre viaja como parámetro para que la UI pueda
 * distinguir la causa (integridad, versión, id cruzado…) sin analizar cadenas.
 */
export function corruptSnapshotDiagnostic(
  reason: EnvelopeRejectionReason,
  detail: string,
): Diagnostic {
  const message: DomainMessage = Object.freeze({
    messageKey: CORRUPT_SNAPSHOT_MESSAGE_KEY,
    params: Object.freeze({ reason, detail }),
  });
  return Object.freeze({ category: "corrupt-snapshot", message });
}

/**
 * Construye el {@link Diagnostic} de un fallo al persistir la cuarentena. Se usa
 * cuando IndexedDB rechaza también la escritura de aislamiento: el diagnóstico
 * se conserva en memoria (19.9, 19.10) en vez de perderse.
 */
export function quarantineWriteFailureDiagnostic(detail: string): Diagnostic {
  const message: DomainMessage = Object.freeze({
    messageKey: QUARANTINE_WRITE_FAILURE_MESSAGE_KEY,
    params: Object.freeze({ detail }),
  });
  return Object.freeze({ category: "persistence-failure", message });
}

/** Entrada para el diagnóstico identificable de incompatibilidad. */
export type IncompatibleVersionDiagnosticInput = Readonly<{
  diagnosticId: string;
  gameId: GameId;
  snapshotId?: SnapshotId;
  reason: EnvelopeIncompatibilityReason;
  compatibility: CompatibilityEvidence;
}>;

/** Construye el bloqueo estructurado de reanudación por versión no soportada. */
export function incompatibleVersionDiagnostic(
  input: IncompatibleVersionDiagnosticInput,
): RecoveryDiagnostic {
  const message: DomainMessage = Object.freeze({
    messageKey: INCOMPATIBLE_VERSION_MESSAGE_KEY,
    params: Object.freeze({ reason: input.reason }),
  });
  const base = {
    diagnosticId: input.diagnosticId,
    category: "incompatible-version" as const,
    phase: "resume" as const,
    reason: input.reason,
    gameId: input.gameId,
    message,
    compatibility: input.compatibility,
  };
  return Object.freeze(
    input.snapshotId === undefined
      ? base
      : { ...base, snapshotId: input.snapshotId },
  );
}

/**
 * Explica que los datos locales ya no están y que no existe restauración
 * automática: solo puede importarse un Paquete previamente exportado.
 */
export function previousBackupRequiredDiagnostic(
  diagnosticId: string,
  gameId: GameId,
): RecoveryDiagnostic {
  const message: DomainMessage = Object.freeze({
    messageKey: PREVIOUS_BACKUP_REQUIRED_MESSAGE_KEY,
    params: Object.freeze({ recovery: "previously-exported-backup" }),
  });
  return Object.freeze({
    diagnosticId,
    category: "storage-unavailable",
    phase: "storage-read",
    reason: "previous-backup-required",
    gameId,
    message,
  });
}
