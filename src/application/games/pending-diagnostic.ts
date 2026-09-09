/**
 * Diagnóstico pendiente EN MEMORIA (Tarea 15.4, requisitos 19.9, 19.10, 21.5).
 *
 * Cuando IndexedDB NO acepta escritura (p. ej. cuota agotada o el propio
 * registro de cuarentena no se puede persistir), el diagnóstico no debe
 * perderse ni silenciarse: se conserva en un registro EN MEMORIA para que una
 * capa superior lo consulte y, más adelante, lo incorpore a la exportación de
 * recuperación (esa exportación es Tarea 17.1; aquí solo se conserva y expone).
 *
 * FRONTERA DE CAPAS Y PUREZA: estructura de aplicación pura. No accede a
 * IndexedDB, DOM, red, reloj ni `Math.random`. La marca temporal y el
 * identificador de la anomalía llegan SIEMPRE por parámetro (los aporta la
 * Instantánea afectada o un generador inyectado), nunca se leen aquí. No hay
 * estado global mutable implícito: el registro se instancia e inyecta.
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { Diagnostic } from "../../domain/ports/index.js";

/**
 * Entrada de diagnóstico pendiente conservada en memoria.
 *
 * Reúne el {@link Diagnostic} `es-ES` estructurado, la Partida afectada y, si se
 * conoce, la última Instantánea confirmada de esa Partida (`snapshotId` y su
 * `confirmedAt`), que la exportación de recuperación (17.1) podrá incluir. Es
 * inmutable: se congela al registrarla.
 */
export type PendingDiagnostic = Readonly<{
  gameId: GameId;
  diagnostic: Diagnostic;
  lastConfirmedSnapshotId?: SnapshotId;
  lastConfirmedAt?: string;
}>;

/** Entrada para {@link PendingDiagnosticRegistry.record}. */
export type PendingDiagnosticInput = Readonly<{
  gameId: GameId;
  diagnostic: Diagnostic;
  lastConfirmedSnapshotId?: SnapshotId;
  lastConfirmedAt?: string;
}>;

/**
 * Registro EN MEMORIA de diagnósticos pendientes no persistibles.
 *
 * Acumula diagnósticos en orden de llegada y permite consultarlos y limpiarlos.
 * No persiste nada: precisamente existe para el caso en que la persistencia ha
 * fallado. Instánciese e inyéctese donde se necesite (fail-fast: nada de
 * singletons ocultos).
 */
export class PendingDiagnosticRegistry {
  private readonly entries: PendingDiagnostic[] = [];

  /**
   * Conserva un diagnóstico pendiente. Devuelve la entrada inmutable registrada
   * para que el llamante la propague sin volver a consultarla.
   */
  public record(input: PendingDiagnosticInput): PendingDiagnostic {
    const base = { gameId: input.gameId, diagnostic: input.diagnostic };
    const withSnapshot =
      input.lastConfirmedSnapshotId === undefined
        ? base
        : { ...base, lastConfirmedSnapshotId: input.lastConfirmedSnapshotId };
    const entry: PendingDiagnostic = Object.freeze(
      input.lastConfirmedAt === undefined
        ? withSnapshot
        : { ...withSnapshot, lastConfirmedAt: input.lastConfirmedAt },
    );
    this.entries.push(entry);
    return entry;
  }

  /** ¿Hay algún diagnóstico pendiente conservado? */
  public get hasPending(): boolean {
    return this.entries.length > 0;
  }

  /** Número de diagnósticos pendientes conservados. */
  public get size(): number {
    return this.entries.length;
  }

  /** Proyecta los diagnósticos pendientes en orden de llegada (copia inmutable). */
  public list(): readonly PendingDiagnostic[] {
    return Object.freeze([...this.entries]);
  }

  /**
   * Vacía el registro (p. ej. tras exportarlos en la recuperación, Tarea 17.1) y
   * devuelve los diagnósticos que contenía, en orden de llegada.
   */
  public drain(): readonly PendingDiagnostic[] {
    const drained = Object.freeze([...this.entries]);
    this.entries.length = 0;
    return drained;
  }
}
