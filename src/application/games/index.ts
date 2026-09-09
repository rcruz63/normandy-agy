/**
 * Persistencia de Partidas en la capa de aplicación (Tarea 15.2).
 *
 * Punto de entrada de la orquestación de casos de uso de Partida sobre el
 * adaptador de IndexedDB (Tarea 15.1): repositorio real, unidad de trabajo con
 * cola/mutex por `gameId`, la fábrica de desenlaces y el modelo del resumen de
 * Partida. Las Tareas 15.3 (creación/reanudación/reinicio, sonda de cuota) y
 * 15.4 (cuarentena de alto nivel, recuperación) construirán sobre esta base.
 */
export {
  DEFAULT_GENERATION_ID,
  RESTART_STAGING_GENERATION_ID,
  toGameRecordPayload,
  toGameSummary,
} from "./game-store-model.js";
export type { GameRecordPayload } from "./game-store-model.js";

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
