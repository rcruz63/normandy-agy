/**
 * Puertos de unidad de trabajo y repositorio de Partidas (diseño §4).
 *
 * `GameUnitOfWork` ejecuta un comando en exclusión mutua por `gameId`.
 * `GameRepository` carga la última Instantánea confirmada, confirma una
 * transición persistible en una única transacción, lista resúmenes y aísla
 * sobres corruptos sin borrar bytes.
 */
import type { GameId } from "../identity/index.js";
import type { GameSnapshot } from "../engine/state.js";
import type { GameCommand } from "../engine/transition.js";
import type {
  CommandOutcome,
  CommitReceipt,
  Diagnostic,
  GameSummary,
  PersistableTransition,
} from "./game-persistence.js";

export interface GameUnitOfWork {
  execute(command: GameCommand): Promise<CommandOutcome>;
}

export interface GameRepository {
  loadLatest(gameId: GameId): Promise<GameSnapshot>;
  commit(proposal: PersistableTransition): Promise<CommitReceipt>;
  list(): Promise<readonly GameSummary[]>;
  isolateCorrupt(gameId: GameId, reason: Diagnostic): Promise<void>;
}
