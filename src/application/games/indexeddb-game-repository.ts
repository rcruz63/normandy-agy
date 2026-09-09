/**
 * Repositorio de Partidas sobre el adaptador de IndexedDB (Tarea 15.2).
 *
 * Implementa el puerto {@link GameRepository} del dominio reutilizando el
 * adaptador de bajo nivel de la Tarea 15.1. Sus responsabilidades:
 *
 * - `loadLatest`: seguir el puntero `latestSnapshotId` del resumen de la Partida
 *   y cargar la última Instantánea confirmada.
 * - `commit`: escribir de forma INDIVISIBLE la nueva Instantánea, el resumen de
 *   la Partida (con su puntero) y el metadato de última confirmación en UNA
 *   sola transacción, mediante {@link IndexedDbStoreAdapter.commitTransition}.
 *   Nunca toca registros de otra Partida.
 * - `list`: proyectar los resúmenes de la generación activa.
 * - `isolateCorrupt`: aislar un sobre corrupto apoyándose en la primitiva de
 *   cuarentena del adaptador, sin borrar bytes (la cuarentena de alto nivel es
 *   Tarea 15.4; aquí queda operativa la del repositorio).
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta puertos y adaptadores; no
 * interpreta reglas ni consume aleatoriedad. El I/O de IndexedDB permanece en el
 * adaptador. La marca de detección de corrupción (`detectedAtId`) se recibe por
 * inyección (`idGenerator`) para no leer reloj ni `Math.random` aquí.
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type {
  CommitReceipt,
  Diagnostic,
  GameRepository,
  GameSummary,
  PersistableTransition,
} from "../../domain/ports/index.js";
import type { EnvelopeCompatibility } from "../../domain/persistence/index.js";
import {
  IndexedDbStoreAdapter,
  type GameKey,
  type GenerationId,
  type SnapshotKey,
} from "../../adapters/browser/indexeddb/index.js";
import {
  DEFAULT_GENERATION_ID,
  toGameRecordPayload,
  toGameSummary,
  type GameRecordPayload,
} from "./game-store-model.js";

/** Clave del metadato que registra la última confirmación por Partida. */
const LATEST_CONFIRMATION_META_PREFIX = "latest-confirmation" as const;

/** `payload` del metadato de última confirmación de una Partida. */
type LatestConfirmationMeta = Readonly<{
  gameId: GameId;
  latestSnapshotId: SnapshotId;
}>;

/** Genera identificadores opacos (p. ej. `detectedAtId`) por inyección. */
export interface IdGenerator {
  next(): string;
}

/** Dependencias inyectadas del repositorio. */
export type IndexedDbGameRepositoryDeps = Readonly<{
  adapter: IndexedDbStoreAdapter;
  compatibility: EnvelopeCompatibility;
  idGenerator: IdGenerator;
  generationId?: GenerationId;
}>;

/**
 * Error de aplicación al no hallar una Partida o su Instantánea. Fail-fast: no
 * se inventa un estado vacío ni se silencia la ausencia.
 */
export class GameNotFoundError extends Error {
  public readonly gameId: GameId;

  public constructor(gameId: GameId, detail: string) {
    super(`Partida «${gameId}» no encontrada: ${detail}.`);
    this.name = "GameNotFoundError";
    this.gameId = gameId;
  }
}

/** Implementación del puerto {@link GameRepository} sobre IndexedDB. */
export class IndexedDbGameRepository implements GameRepository {
  private readonly adapter: IndexedDbStoreAdapter;
  private readonly compatibility: EnvelopeCompatibility;
  private readonly idGenerator: IdGenerator;
  private readonly generationId: GenerationId;

  public constructor(deps: IndexedDbGameRepositoryDeps) {
    this.adapter = deps.adapter;
    this.compatibility = deps.compatibility;
    this.idGenerator = deps.idGenerator;
    this.generationId = deps.generationId ?? DEFAULT_GENERATION_ID;
  }

  /** Carga la última Instantánea confirmada siguiendo el puntero del resumen. */
  public async loadLatest(gameId: GameId): Promise<GameSnapshot> {
    const summary = await this.adapter.getGame<GameRecordPayload>(
      this.gameKey(gameId),
    );
    if (summary === undefined) {
      throw new GameNotFoundError(gameId, "sin resumen en la generación activa");
    }
    const snapshot = await this.adapter.getSnapshot<GameSnapshot>(
      this.snapshotKey(gameId, summary.latestSnapshotId),
    );
    if (snapshot === undefined) {
      throw new GameNotFoundError(
        gameId,
        `puntero latestSnapshotId «${summary.latestSnapshotId}» sin Instantánea`,
      );
    }
    return snapshot;
  }

  /**
   * Confirma una transición en UNA sola transacción: nueva Instantánea, resumen
   * con puntero `latestSnapshotId` y metadato de última confirmación. Solo
   * escribe registros de ESTA Partida (`proposal.gameId`).
   */
  public async commit(
    proposal: PersistableTransition,
  ): Promise<CommitReceipt> {
    const { gameId, next } = proposal;
    const summary = toGameRecordPayload(next);
    const metaValue: LatestConfirmationMeta = {
      gameId,
      latestSnapshotId: next.id,
    };

    await this.adapter.commitTransition<
      GameSnapshot,
      GameRecordPayload,
      LatestConfirmationMeta
    >({
      snapshot: {
        key: this.snapshotKey(gameId, next.id),
        write: { compatibility: this.compatibility, gameId, payload: next },
      },
      game: {
        key: this.gameKey(gameId),
        write: { compatibility: this.compatibility, gameId, payload: summary },
      },
      meta: {
        key: this.confirmationMetaKey(gameId),
        write: { compatibility: this.compatibility, gameId, payload: metaValue },
      },
    });

    return Object.freeze(
      next.previousSnapshotId === undefined
        ? { gameId, snapshotId: next.id, latestSnapshotId: next.id }
        : {
            gameId,
            snapshotId: next.id,
            latestSnapshotId: next.id,
            previousSnapshotId: next.previousSnapshotId,
          },
    );
  }

  /** Proyecta los resúmenes de todas las Partidas de la generación activa. */
  public async list(): Promise<readonly GameSummary[]> {
    const payloads = await this.adapter.listGames<GameRecordPayload>(
      this.generationId,
    );
    return Object.freeze(payloads.map(toGameSummary));
  }

  /**
   * Aísla el sobre de la última Instantánea de una Partida corrupta SIN borrar
   * sus bytes, apoyándose en la primitiva de cuarentena del adaptador. Recibe el
   * resumen sin validar (lectura cruda) para conservar los bytes tal cual.
   */
  public async isolateCorrupt(
    gameId: GameId,
    reason: Diagnostic,
  ): Promise<void> {
    await this.adapter.isolateCorrupt({
      gameId,
      detectedAtId: this.idGenerator.next(),
      reasonKey: reason.message.messageKey,
      isolatedPayload: { gameId, generationId: this.generationId },
    });
  }

  private gameKey(gameId: GameId): GameKey {
    return { generationId: this.generationId, gameId };
  }

  private snapshotKey(gameId: GameId, snapshotId: SnapshotId): SnapshotKey {
    return { generationId: this.generationId, gameId, snapshotId };
  }

  private confirmationMetaKey(gameId: GameId): string {
    return `${LATEST_CONFIRMATION_META_PREFIX}:${this.generationId}:${gameId}`;
  }
}
