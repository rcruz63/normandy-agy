/**
 * Modelos de dominio del Paquete de copia de seguridad (Tarea 16.1,
 * requisitos 22.2, 22.3, 22.11).
 *
 * La Tarea 1 fijó la FIRMA del puerto `BackupCodec` con tipos opacos (marcas)
 * en `ports/placeholders.ts`. La Tarea 16.1 SUSTITUYE esos marcadores
 * (`GameAggregate`, `BackupPackage`, `ValidatedBackup`, `BackupFailure`) por
 * los modelos reales que atraviesan la frontera de exportación/importación:
 *
 * - {@link GameAggregate}: unidad exportable por Partida. Transporta lo que el
 *   requisito 22.2 exige por agregado: `gameId`, `saveVersion` y la Instantánea
 *   confirmada íntegra (Estado, ambos registros y Estado aleatorio). Reutiliza
 *   el {@link GameSnapshot} REAL de `engine/state.ts`; no duplica su forma.
 * - {@link BackupPackage}: envoltorio versionado de un conjunto de agregados,
 *   con Versión de guardado, versión de canonicalización, identificadores,
 *   Suma de integridad y los bytes UTF-8 canónicos serializados.
 * - {@link ValidatedBackup}: resultado de una validación satisfactoria; expone
 *   los agregados ya tipados listos para el flujo de staging (Tarea 16.2).
 * - {@link BackupFailure}: rechazo tipado fail-fast con `reason` accionable.
 *
 * La Suma de integridad DETECTA alteración accidental (FNV-1a de 32 bits sobre
 * la forma canónica); NO es firma, autenticación ni cifrado (requisito 22.11).
 * El algoritmo y la canonicalización se versionan explícitamente en el paquete.
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es PURO. No
 * importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`. Reutiliza el {@link IntegrityDescriptor} real de `engine/state.ts` y
 * la canonicalización/suma de `versioned-envelope.ts` sin duplicarlas.
 */
import type { GameId, SaveVersion } from "../identity/index.js";
import type { GameSnapshot, IntegrityDescriptor } from "../engine/state.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/**
 * Marcador de formato del archivo exportado. Permite descartar de inmediato un
 * archivo ajeno antes de intentar cualquier validación estructural profunda.
 */
export const BACKUP_FORMAT = "fields-of-normandy-backup" as const;

/**
 * Versión de la serialización canónica del paquete. Se incrementa cuando cambia
 * la FORMA canónica (orden de claves, representación de tipos, envoltorio), de
 * modo que un lector rechace explícitamente versiones que no sabe interpretar
 * en lugar de recalcular una suma sobre una forma incompatible.
 */
export const CURRENT_CANONICALIZATION_VERSION = "1" as const;

// ---------------------------------------------------------------------------
// Agregado exportable por Partida
// ---------------------------------------------------------------------------

/**
 * Unidad exportable por Partida. Reúne el `gameId`, la Versión de guardado y la
 * Instantánea confirmada íntegra que se traslada entre dispositivos (requisito
 * 22.11): la Instantánea porta Estado, ambos registros y Estado aleatorio, por
 * lo que no se duplica ninguno de esos campos aquí.
 */
export type GameAggregate = Readonly<{
  gameId: GameId;
  saveVersion: SaveVersion;
  snapshot: GameSnapshot;
}>;

// ---------------------------------------------------------------------------
// Paquete de copia de seguridad
// ---------------------------------------------------------------------------

/**
 * Paquete de copia de seguridad producido por `encode`. Contiene el envoltorio
 * versionado, los agregados exportados, la Suma de integridad calculada sobre
 * la forma canónica y los bytes UTF-8 serializados listos para escribir a un
 * archivo (requisito 22.2).
 *
 * `integrityAlgorithm` es redundante con `integrity.algorithm` a propósito: el
 * lector puede rechazar un algoritmo no soportado antes de recomputar la suma.
 */
export type BackupPackage = Readonly<{
  format: typeof BACKUP_FORMAT;
  canonicalizationVersion: string;
  integrityAlgorithm: string;
  saveVersion: SaveVersion;
  exportedGameIds: readonly GameId[];
  games: readonly GameAggregate[];
  integrity: IntegrityDescriptor;
  bytes: Uint8Array;
}>;

// ---------------------------------------------------------------------------
// Resultados de validación
// ---------------------------------------------------------------------------

/**
 * Resultado de una validación satisfactoria de bytes → paquete. Expone los
 * agregados ya tipados y los metadatos del envoltorio para que el flujo de
 * staging (Tarea 16.2) valide en profundidad e integre en una generación.
 */
export type ValidatedBackup = Readonly<{
  ok: true;
  canonicalizationVersion: string;
  saveVersion: SaveVersion;
  exportedGameIds: readonly GameId[];
  games: readonly GameAggregate[];
  integrity: IntegrityDescriptor;
}>;

/**
 * Motivos tipados por los que la validación del paquete falla-cerrado. El
 * llamante decide en función de `reason` sin analizar cadenas. La validación
 * profunda de Instantáneas/registros/aleatorio e invariantes corresponde a la
 * Tarea 16.2; aquí se cubren envoltorio, canonicalización, suma y forma.
 */
export type BackupRejectionReason =
  | "malformed-package"
  | "unsupported-format"
  | "unsupported-canonicalization-version"
  | "unsupported-integrity-algorithm"
  | "integrity-mismatch";

/**
 * Rechazo tipado de una validación de copia. `reason` clasifica el fallo y
 * `detail` aporta contexto `es-ES` para diagnósticos. Fail-fast: nunca se
 * devuelve un agregado parcialmente validado.
 */
export type BackupFailure = Readonly<{
  ok: false;
  reason: BackupRejectionReason;
  detail: string;
}>;
