/**
 * Esquema físico del almacén IndexedDB de la PWA (Tarea 15.1, diseño §5).
 *
 * Declara el nombre y la versión de la base, los seis object stores y sus
 * claves compuestas EXACTAS según la tabla del diseño. Los nombres, `keyPath`
 * y versión son constantes con nombre en inglés (sin valores mágicos): las
 * lecturas y escrituras del adaptador se refieren a ellas, nunca a literales.
 *
 * FRONTERA DE CAPAS: este módulo pertenece al adaptador de navegador; el
 * dominio nunca lo importa. Aquí no hay lógica de dominio ni reloj.
 */

/** Nombre de la base de datos IndexedDB de la aplicación. */
export const DATABASE_NAME = "fields-of-normandy" as const;

/**
 * Versión del esquema FÍSICO de IndexedDB. Solo cambia cuando se crean o
 * modifican object stores/índices (upgrade NO destructivo). La evolución del
 * contenido se gestiona con el sobre versionado, no aquí.
 */
export const DATABASE_VERSION = 1 as const;

/**
 * Nombres de los seis object stores del diseño. El tipo derivado
 * {@link ObjectStoreName} restringe las operaciones del adaptador al conjunto
 * canónico.
 */
export const OBJECT_STORES = {
  games: "games",
  snapshots: "snapshots",
  migrationBackups: "migrationBackups",
  quarantine: "quarantine",
  settings: "settings",
  meta: "meta",
} as const;

export type ObjectStoreName =
  (typeof OBJECT_STORES)[keyof typeof OBJECT_STORES];

/**
 * `keyPath` de cada object store. Las claves compuestas se declaran como
 * `readonly string[]` conforme a la tabla del diseño:
 *
 * - `games`: `[generationId, gameId]`
 * - `snapshots`: `[generationId, gameId, snapshotId]`
 * - `migrationBackups`: `backupId`
 * - `quarantine`: `[gameId, detectedAtId]`
 * - `settings`: `key`
 * - `meta`: `key`
 */
export const OBJECT_STORE_KEY_PATHS: Readonly<
  Record<ObjectStoreName, string | readonly string[]>
> = {
  games: ["generationId", "gameId"],
  snapshots: ["generationId", "gameId", "snapshotId"],
  migrationBackups: "backupId",
  quarantine: ["gameId", "detectedAtId"],
  settings: "key",
  meta: "key",
} as const;

/** Lista de object stores a crear durante el upgrade, en orden estable. */
export const ALL_OBJECT_STORES: readonly ObjectStoreName[] = [
  OBJECT_STORES.games,
  OBJECT_STORES.snapshots,
  OBJECT_STORES.migrationBackups,
  OBJECT_STORES.quarantine,
  OBJECT_STORES.settings,
  OBJECT_STORES.meta,
];
