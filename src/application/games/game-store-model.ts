/**
 * Modelo del `payload` del resumen de Partida almacenado en el store `games`
 * y constantes de persistencia (Tarea 15.2).
 *
 * El store `games` guarda un resumen proyectable con el puntero
 * `latestSnapshotId` a la última Instantánea confirmada (diseño §5). Este
 * módulo fija su forma y los derivadores puros que la construyen a partir de
 * una Instantánea real del dominio, sin duplicar campos del `GameState`.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Coordina puertos y adaptadores; no
 * interpreta reglas. Es puro (no usa reloj ni `Math.random`): las marcas de
 * tiempo llegan dentro de la Instantánea, que las recibió por inyección.
 */
import type {
  GameId,
  MissionId,
  SnapshotId,
} from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { GameSummary } from "../../domain/ports/index.js";

/**
 * Generación de almacenamiento por defecto (activa). La gestión de generaciones
 * alternativas (staging, migración) corresponde a las Tareas 15.3/16.x; 15.2
 * opera siempre sobre la generación activa por defecto.
 */
export const DEFAULT_GENERATION_ID = "active" as const;

/**
 * Generación de STAGING para el reinicio de una Partida (Tarea 15.3). La
 * preparación de reemplazo se escribe aquí, en una generación distinta de la
 * activa, de modo que no toca ninguna Partida activa hasta la promoción atómica
 * tras confirmación explícita (diseño §4, requisitos 7.4, 7.5, 7.6).
 */
export const RESTART_STAGING_GENERATION_ID = "restart-staging" as const;

/**
 * Generación de STAGING para la importación de una copia (Tarea 16.2). Los
 * agregados validados se escriben aquí ANTES de cualquier confirmación, en una
 * generación distinta tanto de la activa como de la de reinicio, de modo que
 * ninguna Partida activa se toca hasta la confirmación explícita en una sola
 * transacción (diseño §6, requisitos 22.4, 22.5).
 */
export const IMPORT_STAGING_GENERATION_ID = "import-staging" as const;

/**
 * Generación de STAGING para una migración de Versión de guardado (Tarea 16.3).
 * La generación activa se copia como `migrationBackup` recuperable y la cadena
 * de migradores puros produce una nueva generación que se escribe aquí, en una
 * generación distinta de la activa, la de reinicio y la de importación, de modo
 * que ninguna Partida activa se toca hasta la confirmación atómica que cambia
 * el puntero de generación activa (diseño §6, requisitos 22.6, 22.7, 22.8).
 */
export const MIGRATION_STAGING_GENERATION_ID = "migration-staging" as const;

/**
 * Clave del metadato (store `meta`) que apunta a la generación de almacenamiento
 * activa. El paso 5 del flujo de importación consolida los agregados y, DESPUÉS,
 * actualiza este puntero dentro de la MISMA transacción (diseño §6).
 */
export const ACTIVE_GENERATION_META_KEY = "active-generation" as const;

/** `payload` del metadato que identifica la generación activa vigente. */
export type ActiveGenerationMeta = Readonly<{
  activeGenerationId: string;
}>;

/**
 * `payload` del resumen de una Partida en el store `games`. Contiene el puntero
 * `latestSnapshotId` (fuente de verdad del enlace a la última Instantánea) y los
 * campos proyectables del resumen; se deriva íntegramente de la Instantánea
 * confirmada, nunca al revés.
 */
export type GameRecordPayload = Readonly<{
  gameId: GameId;
  missionId: MissionId;
  latestSnapshotId: SnapshotId;
  confirmedAt: string;
  turn: number;
  outcome: GameSummary["outcome"];
}>;

/**
 * Deriva el `payload` del resumen a partir de una Instantánea confirmada. El
 * puntero `latestSnapshotId` apunta a esa misma Instantánea.
 */
export function toGameRecordPayload(snapshot: GameSnapshot): GameRecordPayload {
  return Object.freeze({
    gameId: snapshot.gameId,
    missionId: snapshot.state.missionId,
    latestSnapshotId: snapshot.id,
    confirmedAt: snapshot.confirmedAt,
    turn: snapshot.state.turn,
    outcome: snapshot.state.outcome,
  });
}

/** Proyecta un {@link GameSummary} del puerto a partir del resumen almacenado. */
export function toGameSummary(payload: GameRecordPayload): GameSummary {
  return Object.freeze({
    gameId: payload.gameId,
    missionId: payload.missionId,
    latestSnapshotId: payload.latestSnapshotId,
    confirmedAt: payload.confirmedAt,
    turn: payload.turn,
    outcome: payload.outcome,
  });
}
