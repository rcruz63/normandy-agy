/**
 * Cola/mutex de exclusión mutua por `gameId` (Tarea 15.2, diseño §4).
 *
 * Serializa las operaciones mutables de una MISMA Partida: solo una transición
 * puede estar «en vuelo» por `gameId`. Partidas distintas no comparten cola: se
 * ejecutan en paralelo sin bloquearse entre sí.
 *
 * IMPLEMENTACIÓN: una cadena de promesas por `gameId`. Cada tarea encolada
 * espera a que termine la anterior de su misma Partida (con éxito o error) y
 * solo entonces se ejecuta. NO usa `setTimeout` ni temporizadores: la
 * serialización es puramente estructural (encadenado de promesas).
 *
 * FRONTERA DE CAPAS: lógica de aplicación pura. No accede a IndexedDB, DOM, red
 * ni reloj.
 */
import type { GameId } from "../../domain/identity/index.js";

/** Cola por `gameId` que serializa tareas asíncronas de una misma Partida. */
export class PerGameQueue {
  private readonly tails = new Map<GameId, Promise<unknown>>();

  /**
   * Encola `task` para el `gameId` dado y devuelve su resultado. Las tareas del
   * mismo `gameId` se ejecutan en el orden de encolado, sin solaparse; un fallo
   * de una tarea no rompe la cadena para las siguientes.
   */
  public enqueue<T>(gameId: GameId, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(gameId) ?? Promise.resolve();
    const result = previous.then(task, task);
    // La cola avanza aunque `task` falle: se ignora el rechazo del eslabón para
    // no dejar promesas rechazadas sin manejar en la cadena interna.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(gameId, settled);
    void settled.then(() => {
      if (this.tails.get(gameId) === settled) {
        this.tails.delete(gameId);
      }
    });
    return result;
  }

  /** ¿Hay alguna tarea en vuelo o encolada para este `gameId`? */
  public isBusy(gameId: GameId): boolean {
    return this.tails.has(gameId);
  }
}
