/**
 * Persistencia de Partidas en la capa de aplicación (Tareas 15.2-15.4).
 *
 * Punto de entrada de la orquestación de casos de uso de Partida sobre el
 * adaptador de IndexedDB (Tarea 15.1): repositorio real, unidad de trabajo con
 * cola/mutex por `gameId`, la fábrica de desenlaces, el modelo del resumen de
 * Partida, la creación/reanudación/reinicio y la sonda de cuota (Tarea 15.3) y
 * la cuarentena y recuperación de corrupción con diagnóstico pendiente en
 * memoria (Tarea 15.4).
 */
export {
  DEFAULT_GENERATION_ID,
  RESTART_STAGING_GENERATION_ID,
  IMPORT_STAGING_GENERATION_ID,
  ACTIVE_GENERATION_META_KEY,
  toGameRecordPayload,
  toGameSummary,
} from "./game-store-model.js";
export type {
  GameRecordPayload,
  ActiveGenerationMeta,
} from "./game-store-model.js";

export { PerGameQueue } from "./per-game-queue.js";

export {
  staleOutcome,
  rejectedOutcome,
  blockedOutcome,
  invalidOutcome,
  failedOutcome,
  nonAcceptedOutcome,
} from "./command-outcome-factory.js";

export {
  IndexedDbGameRepository,
  GameNotFoundError,
} from "./indexeddb-game-repository.js";
export type {
  IdGenerator,
  IndexedDbGameRepositoryDeps,
} from "./indexeddb-game-repository.js";

export { GameCommandDispatcher } from "./game-command-dispatcher.js";
export type {
  Clock,
  SnapshotIdGenerator,
  GameCommandDispatcherDeps,
} from "./game-command-dispatcher.js";

export { buildInitialSnapshot } from "./initial-state-factory.js";
export type {
  GameIdentity,
  InitialSnapshotInput,
} from "./initial-state-factory.js";

export { CreateGame } from "./create-game.js";
export type { CreateGameDeps, CreateGameResult } from "./create-game.js";

export { ResumeGame } from "./resume-game.js";
export type {
  ResumeGameDeps,
  ResumeGameResult,
  ResumeSummary,
} from "./resume-game.js";

export {
  RestartGame,
  RestartConfirmation,
  RestartAlreadyResolvedError,
} from "./restart-game.js";
export type { RestartGameDeps } from "./restart-game.js";

export { QuotaProbe } from "./quota-probe.js";
export type {
  QuotaProbeResult,
  StorageEstimate,
  StorageEstimator,
} from "./quota-probe.js";

export { PendingDiagnosticRegistry } from "./pending-diagnostic.js";
export type {
  PendingDiagnostic,
  PendingDiagnosticInput,
} from "./pending-diagnostic.js";

export { QuarantineLedger } from "./quarantine-ledger.js";
export type { QuarantineEntry } from "./quarantine-ledger.js";

export {
  CORRUPT_SNAPSHOT_MESSAGE_KEY,
  QUARANTINE_WRITE_FAILURE_MESSAGE_KEY,
  corruptSnapshotDiagnostic,
  quarantineWriteFailureDiagnostic,
} from "./recovery-diagnostics.js";

export { CorruptionRecoveryService } from "./corruption-recovery.js";
export type {
  QuarantineArchive,
  RestoredSnapshotNotice,
  SafeResumeResult,
  CorruptionRecoveryDeps,
} from "./corruption-recovery.js";

export {
  ImportBackup,
  ImportPreview,
  ImportAlreadyResolvedError,
  UnresolvedCollisionError,
} from "./import-backup.js";
export type {
  ImportBackupDeps,
  ImportFailure,
  ImportRejection,
  ImportRejectionReason,
  CollisionResolution,
  CollisionResolutions,
} from "./import-backup.js";
