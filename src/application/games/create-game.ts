/**
 * Caso de uso «crear Partida» (Tarea 15.3, requisitos 5.6, 5.7, 6.1, 7.7).
 *
 * Prepara EN MEMORIA todo el Estado inicial de la Partida (a partir de la
 * preparación fiel de la Misión) y confirma una ÚNICA Instantánea inicial
 * completa mediante una sola transacción del repositorio (diseño §4). Si la
 * confirmación falla, IndexedDB revierte todo y la creación se cancela de forma
 * atómica sin conservar datos parciales (5.7): esta capa no deja rastros porque
 * solo escribe a través del commit transaccional del repositorio.
 *
 * No existe un máximo codificado de Partidas: la creación no impone un límite;
 * la conservación ante falta de espacio procede del commit abortable (6.5) y la
 * sonda de cuota solo informa capacidad (6.6). Cada creación se serializa por
 * `gameId` con la cola/mutex para no solaparse con otras operaciones de la misma
 * Partida (7.1).
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta el puerto del repositorio
 * y la fábrica de Instantánea inicial; no interpreta reglas ni accede a
 * IndexedDB/DOM/red. El reloj, el generador de identificadores y la Semilla se
 * INYECTAN (reproducibilidad, 19.1, 19.7).
 */
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

/** Dependencias inyectadas del caso de uso de creación. */
export type CreateGameDeps = Readonly<{
  repository: GameRepository;
  clock: Clock;
  idGenerator: SnapshotIdGenerator;
  queue?: PerGameQueue;
}>;

/**
 * Resultado de crear una Partida: la Instantánea inicial confirmada y su acuse.
 * La UI proyecta directamente `snapshot`; `receipt` traza el commit único.
 */
export type CreateGameResult = Readonly<{
  snapshot: GameSnapshot;
  receipt: CommitReceipt;
}>;

/**
 * Caso de uso de creación de Partida con Instantánea inicial única confirmada.
 */
export class CreateGame {
  private readonly repository: GameRepository;
  private readonly clock: Clock;
  private readonly idGenerator: SnapshotIdGenerator;
  private readonly queue: PerGameQueue;

  public constructor(deps: CreateGameDeps) {
    this.repository = deps.repository;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
    this.queue = deps.queue ?? new PerGameQueue();
  }

  /**
   * Crea la Partida confirmando su Instantánea inicial única. Se serializa por
   * `gameId`. Propaga el error del commit si la confirmación falla (5.7): nada
   * queda a medias porque el repositorio confirma en una sola transacción.
   */
  public execute(input: InitialSnapshotInput): Promise<CreateGameResult> {
    return this.queue.enqueue(input.identity.gameId, () => this.runCreate(input));
  }

  private async runCreate(
    input: InitialSnapshotInput,
  ): Promise<CreateGameResult> {
    const snapshot = buildInitialSnapshot(input, this.clock, this.idGenerator);
    // La Instantánea inicial no procede de una transición previa: `next` no
    // tiene `previousSnapshotId` y el repositorio emite el acuse inicial. El
    // `expectedSnapshotId` iguala al de la propia Instantánea porque no hay una
    // confirmación anterior contra la que comprobar concurrencia optimista.
    const receipt = await this.repository.commit({
      gameId: snapshot.gameId,
      expectedSnapshotId: snapshot.id,
      next: snapshot,
      mode: "complete",
    });
    return Object.freeze({ snapshot, receipt });
  }
}
