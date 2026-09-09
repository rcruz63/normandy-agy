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
import type { DomainMessage } from "../../domain/engine/transition.js";
import type { Diagnostic } from "../../domain/ports/index.js";
import type { EnvelopeRejectionReason } from "../../domain/persistence/index.js";

/** Clave `es-ES` del diagnóstico de sobre corrupto aislado en cuarentena. */
export const CORRUPT_SNAPSHOT_MESSAGE_KEY =
  "persistencia.recuperacion.sobreCorrupto";

/** Clave `es-ES` del diagnóstico de cuarentena no persistible (fallo de escritura). */
export const QUARANTINE_WRITE_FAILURE_MESSAGE_KEY =
  "persistencia.recuperacion.cuarentenaNoPersistible";

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
