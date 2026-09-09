/**
 * Adaptador de IndexedDB con object stores versionados (Tarea 15.1).
 *
 * Punto de entrada del adaptador de bajo nivel: esquema físico, envoltorios
 * asíncronos y la clase {@link IndexedDbStoreAdapter} que la Tarea 15.2
 * consumirá para construir `GameRepository`/`GameUnitOfWork`.
 */
export {
  DATABASE_NAME,
  DATABASE_VERSION,
  OBJECT_STORES,
  OBJECT_STORE_KEY_PATHS,
  ALL_OBJECT_STORES,
} from "./schema.js";
export type { ObjectStoreName } from "./schema.js";

export {
  IndexedDbError,
  openDatabase,
  requestToPromise,
  runTransaction,
} from "./idb-runtime.js";
export type { IndexedDbFailureReason } from "./idb-runtime.js";

export { IndexedDbStoreAdapter } from "./indexeddb-store-adapter.js";
export type {
  GenerationId,
  BackupId,
  DetectedAtId,
  SnapshotKey,
  GameKey,
  SnapshotRecord,
  GameRecord,
  MigrationBackupRecord,
  KeyedRecord,
  QuarantineRecord,
  EnvelopeWrite,
  MetaWrite,
  CommitTransitionInput,
  ImportAggregateWrite,
  CommitImportInput,
} from "./indexeddb-store-adapter.js";
