/**
 * Caso de uso «reiniciar Partida» con staging y confirmación cancelable (Tarea
 * 15.3, requisitos 7.3, 7.4, 7.5, 7.6).
 *
 * El reinicio sustituye ÚNICAMENTE la Partida identificada por una preparación
 * inicial NUEVA de la MISMA Misión, y solo tras una CONFIRMACIÓN EXPLÍCITA
 * cancelable (diseño §4). El flujo tiene dos fases:
 *
 * 1. `prepare`: construye en memoria la Instantánea inicial de reemplazo y la
 *    escribe en una GENERACIÓN DE STAGING distinta de la activa. Escribir en
 *    staging NO toca las Partidas activas (ni la que se reinicia ni las demás):
 *    la generación activa permanece intacta. Devuelve un {@link RestartConfirmation}
 *    cancelable que identifica la Partida y su última Instantánea válida (7.3).
 *
 * 2a. `confirm`: PROMUEVE la Instantánea preparada a la generación activa
 *     mediante una única transacción del repositorio activo, reemplazando solo
 *     el resumen y el puntero de ESA Partida (7.5). No se borra la Instantánea
 *     original hasta esta promoción atómica; si la promoción falla, IndexedDB
 *     revierte y la última Instantánea válida de la Partida permanece (7.6).
 *
 * 2b. `cancel`: descarta el reinicio sin tocar la generación activa. TODAS las
 *     Partidas se conservan sin modificación (7.4). Lo preparado en staging es
 *     material de trabajo invisible para la generación activa.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta dos vistas del puerto de
 * repositorio (activa y staging) y la fábrica de Instantánea inicial; no
 * interpreta reglas ni accede a IndexedDB/DOM/red. Reloj, generador de
 * identificadores y Semilla se INYECTAN (reproducibilidad, 19.1, 19.7).
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type {
  CommitReceipt,
  GameRepository,
} from "../../domain/ports/index.js";
import type { Clock, SnapshotIdGenerator } from "./game-command-dispatcher.js";
import {
  buildInitialSnapshot,
  type InitialSnapshotInput,
} from "./initial-state-factory.js";
import { PerGameQueue } from "./per-game-queue.js";

/**
 * Dependencias inyectadas del reinicio. `activeRepository` opera sobre la
 * generación activa; `stagingRepository` sobre una generación de staging
 * distinta. Ambos comparten el adaptador de IndexedDB pero nunca la misma
 * generación, de modo que preparar en staging no afecta a las Partidas activas.
 */
export type RestartGameDeps = Readonly<{
  activeRepository: GameRepository;
  stagingRepository: GameRepository;
  clock: Clock;
  idGenerator: SnapshotIdGenerator;
  queue?: PerGameQueue;
}>;

/** Estado del ciclo de vida de una confirmación de reinicio (fail-fast). */
type RestartLifecycle = "pending" | "confirmed" | "cancelled";

/**
 * Confirmación cancelable de un reinicio preparado (7.3). Identifica la Partida
 * afectada y su última Instantánea válida antes del reemplazo, y expone las dos
 * únicas acciones: confirmar la promoción o cancelar conservando todo. La
 * confirmación es de un solo uso: confirmar o cancelar dos veces falla-rápido.
 */
export class RestartConfirmation {
  /** Partida que se reiniciará (única afectada, 7.5). */
  public readonly gameId: GameId;
  /** Última Instantánea válida antes del reinicio (para la confirmación, 7.3). */
  public readonly previousSnapshotId: SnapshotId;
  /** Instantánea inicial preparada en staging, pendiente de promoción. */
  public readonly preparedSnapshot: GameSnapshot;

  private readonly promote: () => Promise<CommitReceipt>;
  private lifecycle: RestartLifecycle = "pending";

  public constructor(params: {
    gameId: GameId;
    previousSnapshotId: SnapshotId;
    preparedSnapshot: GameSnapshot;
    promote: () => Promise<CommitReceipt>;
  }) {
    this.gameId = params.gameId;
    this.previousSnapshotId = params.previousSnapshotId;
    this.preparedSnapshot = params.preparedSnapshot;
    this.promote = params.promote;
  }

  /**
   * Confirma el reinicio: promueve la Instantánea preparada a la generación
   * activa reemplazando solo esta Partida (7.5). Fail-fast si ya se consumió la
   * confirmación. Si la promoción falla, se propaga el error y la generación
   * activa queda intacta (7.6): la confirmación NO pasa a `confirmed`.
   */
  public async confirm(): Promise<CommitReceipt> {
    this.assertPending();
    const receipt = await this.promote();
    this.lifecycle = "confirmed";
    return receipt;
  }

  /**
   * Cancela el reinicio sin tocar la generación activa: todas las Partidas se
   * conservan (7.4). Fail-fast si la confirmación ya se consumió.
   */
  public cancel(): void {
    this.assertPending();
    this.lifecycle = "cancelled";
  }

  /** ¿Sigue pendiente de confirmar o cancelar? */
  public get isPending(): boolean {
    return this.lifecycle === "pending";
  }

  private assertPending(): void {
    if (this.lifecycle !== "pending") {
      throw new RestartAlreadyResolvedError(this.gameId, this.lifecycle);
    }
  }
}

/** Error tipado al operar sobre una confirmación de reinicio ya resuelta. */
export class RestartAlreadyResolvedError extends Error {
  public readonly gameId: GameId;

  public constructor(gameId: GameId, lifecycle: RestartLifecycle) {
    super(`El reinicio de la Partida «${gameId}» ya estaba ${lifecycle}.`);
    this.name = "RestartAlreadyResolvedError";
    this.gameId = gameId;
  }
}

/** Caso de uso de reinicio con preparación en staging y promoción atómica. */
export class RestartGame {
  private readonly activeRepository: GameRepository;
  private readonly stagingRepository: GameRepository;
  private readonly clock: Clock;
  private readonly idGenerator: SnapshotIdGenerator;
  private readonly queue: PerGameQueue;

  public constructor(deps: RestartGameDeps) {
    this.activeRepository = deps.activeRepository;
    this.stagingRepository = deps.stagingRepository;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
    this.queue = deps.queue ?? new PerGameQueue();
  }

  /**
   * Prepara un reinicio de la MISMA Misión en staging y devuelve una
   * confirmación cancelable. Lee primero la última Instantánea válida de la
   * Partida (para identificarla en la confirmación, 7.3) y escribe la
   * Instantánea de reemplazo en la generación de staging, sin tocar la activa.
   */
  public execute(input: InitialSnapshotInput): Promise<RestartConfirmation> {
    return this.queue.enqueue(input.identity.gameId, () =>
      this.runPrepare(input),
    );
  }

  private async runPrepare(
    input: InitialSnapshotInput,
  ): Promise<RestartConfirmation> {
    const gameId = input.identity.gameId;
    const current = await this.activeRepository.loadLatest(gameId);
    const prepared = buildInitialSnapshot(input, this.clock, this.idGenerator);

    // Escritura en staging: no afecta a la generación activa (ni a esta Partida
    // ni a las demás). Es material de trabajo para la posible promoción.
    await this.stagingRepository.commit({
      gameId,
      expectedSnapshotId: prepared.id,
      next: prepared,
      mode: "complete",
    });

    return new RestartConfirmation({
      gameId,
      previousSnapshotId: current.id,
      preparedSnapshot: prepared,
      promote: () => this.promote(gameId, prepared),
    });
  }

  /**
   * Promueve la Instantánea preparada a la generación activa en una única
   * transacción, reemplazando únicamente el resumen y el puntero de ESA Partida
   * (7.5). La promoción se serializa por `gameId` con la misma cola que la
   * preparación para no solaparse con otras operaciones de la Partida.
   */
  private promote(
    gameId: GameId,
    prepared: GameSnapshot,
  ): Promise<CommitReceipt> {
    return this.queue.enqueue(gameId, () =>
      this.activeRepository.commit({
        gameId,
        expectedSnapshotId: prepared.id,
        next: prepared,
        mode: "complete",
      }),
    );
  }
}
