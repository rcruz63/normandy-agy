/**
 * Caso de uso «reanudar Partida» (Tarea 15.3, requisitos 6.3, 6.4, 7.2, 19.7).
 *
 * Restaura la Partida identificada desde su ÚLTIMA Instantánea confirmada: el
 * Estado de partida, ambos registros y el Estado aleatorio EXACTOS (posición de
 * secuencia incluida), sin repetir ni omitir consumos (19.7). La restauración
 * es una lectura pura a través del repositorio (`loadLatest`), que ya devuelve
 * la Instantánea íntegra; esta capa no reconstruye nada por partes.
 *
 * La reanudación no consume aleatoriedad ni evalúa reglas: solo devuelve la
 * última Instantánea confirmada para que la UI la proyecte y, opcionalmente, un
 * resumen (Misión y fecha de la última Instantánea) para la confirmación previa
 * a reanudar (6.4). La continuidad aleatoria tras reanudar (Property 16, req.
 * 6.3) la garantiza que el Estado aleatorio se restaura sin perder posición.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta el puerto del repositorio;
 * no interpreta reglas ni accede a IndexedDB/DOM/red. Se serializa por `gameId`
 * con la cola/mutex para no solaparse con otras operaciones de la Partida.
 */
import type { GameId } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { GameRepository } from "../../domain/ports/index.js";
import { PerGameQueue } from "./per-game-queue.js";

/** Dependencias inyectadas del caso de uso de reanudación. */
export type ResumeGameDeps = Readonly<{
  repository: GameRepository;
  queue?: PerGameQueue;
}>;

/**
 * Resumen previo a reanudar (6.4): Misión y fecha de la última Instantánea
 * confirmada de la Partida. Se deriva de la propia Instantánea restaurada.
 */
export type ResumeSummary = Readonly<{
  missionId: GameSnapshot["state"]["missionId"];
  confirmedAt: string;
  latestSnapshotId: GameSnapshot["id"];
}>;

/**
 * Resultado de reanudar: la Instantánea restaurada íntegra y su resumen. La UI
 * proyecta `snapshot`; `summary` alimenta la confirmación previa a reanudar.
 */
export type ResumeGameResult = Readonly<{
  snapshot: GameSnapshot;
  summary: ResumeSummary;
}>;

/** Caso de uso de reanudación de una Partida desde su última Instantánea. */
export class ResumeGame {
  private readonly repository: GameRepository;
  private readonly queue: PerGameQueue;

  public constructor(deps: ResumeGameDeps) {
    this.repository = deps.repository;
    this.queue = deps.queue ?? new PerGameQueue();
  }

  /**
   * Reanuda la Partida devolviendo su última Instantánea confirmada íntegra.
   * Propaga `GameNotFoundError` si la Partida o su Instantánea no existen
   * (fail-fast: no se inventa un estado vacío).
   */
  public execute(gameId: GameId): Promise<ResumeGameResult> {
    return this.queue.enqueue(gameId, () => this.runResume(gameId));
  }

  private async runResume(gameId: GameId): Promise<ResumeGameResult> {
    const snapshot = await this.repository.loadLatest(gameId);
    const summary: ResumeSummary = Object.freeze({
      missionId: snapshot.state.missionId,
      confirmedAt: snapshot.confirmedAt,
      latestSnapshotId: snapshot.id,
    });
    return Object.freeze({ snapshot, summary });
  }
}
