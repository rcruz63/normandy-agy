/**
 * Registro de Partidas en cuarentena (Tarea 15.4, requisito 21.6).
 *
 * Cuando una Partida se aísla por corrupción de sobre, hay que EXCLUIRLA de la
 * reanudación conservando intactas las demás. Este registro mantiene el índice
 * de Partidas aisladas (por `gameId`) que la recuperación consulta para filtrar
 * los resúmenes reanudables, junto con el `detectedAtId` con el que se archivó
 * el sobre corrupto (clave `[gameId, detectedAtId]` del store `quarantine`),
 * de modo que sus bytes sean recuperables después.
 *
 * FRONTERA DE CAPAS Y PUREZA: estructura de aplicación pura. No accede a
 * IndexedDB, DOM, red, reloj ni `Math.random`. No hay estado global implícito:
 * se instancia e inyecta. La primitiva de bytes vive en el adaptador; aquí solo
 * se lleva el índice lógico de exclusión.
 */
import type { GameId } from "../../domain/identity/index.js";
import type { DetectedAtId } from "../../adapters/browser/indexeddb/index.js";

/** Referencia a un sobre archivado en cuarentena: Partida e instante detectado. */
export type QuarantineEntry = Readonly<{
  gameId: GameId;
  detectedAtId: DetectedAtId;
  reasonKey: string;
}>;

/** Índice lógico, en memoria, de las Partidas actualmente en cuarentena. */
export class QuarantineLedger {
  private readonly entries = new Map<GameId, QuarantineEntry>();

  /**
   * Marca una Partida como aislada. Si ya lo estaba, conserva la primera
   * detección (no se pierde la referencia original a sus bytes archivados).
   */
  public record(entry: QuarantineEntry): void {
    if (this.entries.has(entry.gameId)) {
      return;
    }
    this.entries.set(entry.gameId, Object.freeze({ ...entry }));
  }

  /** ¿Está esta Partida en cuarentena (excluida de la reanudación)? */
  public isQuarantined(gameId: GameId): boolean {
    return this.entries.has(gameId);
  }

  /** Referencia de cuarentena de una Partida, si está aislada. */
  public get(gameId: GameId): QuarantineEntry | undefined {
    return this.entries.get(gameId);
  }

  /** Proyecta todas las referencias de cuarentena (copia inmutable). */
  public list(): readonly QuarantineEntry[] {
    return Object.freeze([...this.entries.values()]);
  }
}
