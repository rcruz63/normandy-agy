/**
 * Caso de uso «migrar la generación de almacenamiento» con copia recuperable,
 * staging en memoria, confirmación atómica y rollback (Tarea 16.3, requisitos
 * 22.6, 22.7, 22.8, 22.9, 22.10).
 *
 * La migración es EXPLÍCITA en el dispositivo y no abre ningún canal de
 * sincronización (22.10). El flujo replica los cinco pasos del diseño §6:
 *
 * 1. Copiar la generación activa como `migrationBackup` recuperable ANTES de
 *    tocar el Almacenamiento (requisito 22.7).
 * 2. Ejecutar la cadena EXPLÍCITA de migradores PUROS sobre una
 *    {@link StorageGeneration} EN MEMORIA (no toca IndexedDB); la aporta el
 *    dominio {@link MigrationRegistry} (Tarea 16.3, `domain/`).
 * 3. Verificar la conservación de todos los campos, ambos registros y el Estado
 *    aleatorio, y ejecutar las Invariantes por Instantánea (lo hace el propio
 *    `migrate`, puro). Cualquier fallo devuelve un {@link MigrationOutcome} de
 *    rechazo tipado SIN tocar la generación activa (requisito 22.6, 22.9).
 * 4. Cambiar `activeGenerationId` a la generación migrada dentro de la MISMA
 *    transacción que escribe sus Instantáneas y resúmenes, SOLO si todo es
 *    válido (requisito 22.8): consolidación atómica vía `commitImport`.
 * 5. Conservar la copia anterior (no se borra `migrationBackup`) y, ante fallo,
 *    seguir apuntando a la generación anterior (requisito 22.9). El rollback es
 *    no cambiar el puntero: la generación anterior permanece íntegra.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta el registro de migración
 * (dominio, puro) y el adaptador de IndexedDB (copia recuperable, staging,
 * commit atómico y cambio de generación). No interpreta reglas ni migradores,
 * no accede a DOM/red/reloj/`Math.random`/AWS ni realiza llamadas a servidor.
 */
import type { GameId, SaveVersion } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { MigrationRegistry } from "../../domain/ports/index.js";
import type {
  MigrationFailure,
  StorageGeneration,
} from "../../domain/persistence/index.js";
import type { EnvelopeCompatibility } from "../../domain/persistence/index.js";
import {
  IndexedDbStoreAdapter,
  type BackupId,
  type GameKey,
  type GenerationId,
  type ImportAggregateWrite,
  type SnapshotKey,
} from "../../adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  DEFAULT_GENERATION_ID,
  MIGRATION_STAGING_GENERATION_ID,
  toGameRecordPayload,
  type ActiveGenerationMeta,
  type GameRecordPayload,
} from "./game-store-model.js";

// ---------------------------------------------------------------------------
// Motivos de fallo de la orquestación (fail-closed, tipados)
// ---------------------------------------------------------------------------

/**
 * Motivos por los que la ORQUESTACIÓN de la migración falla-cerrado, además de
 * los del dominio ({@link MigrationFailure}):
 *
 * - `no-migration-path`: el registro no conoce ninguna ruta de la Versión de
 *   guardado activa a la de destino (el plan es `undefined`).
 * - `missing-snapshot`: el resumen de una Partida apunta a una Instantánea
 *   ausente; no se migra sobre datos incompletos.
 */
export type MigrationOrchestrationReason =
  | "no-migration-path"
  | "missing-snapshot";

/** Rechazo tipado propio de la orquestación (fuera del dominio puro). */
export type MigrationOrchestrationFailure = Readonly<{
  ok: false;
  reason: MigrationOrchestrationReason;
  detail: string;
}>;

/**
 * Confirmación de una migración satisfactoria. Expone la Versión de guardado de
 * destino, el `backupId` recuperable conservado (requisito 22.9) y los `gameId`
 * migrados, para diagnóstico y para una eventual recuperación manual.
 */
export type MigrationConfirmed = Readonly<{
  ok: true;
  saveVersion: SaveVersion;
  backupId: BackupId;
  migratedGameIds: readonly GameId[];
}>;

/**
 * Resultado del caso de uso: confirmación atómica, rechazo del dominio (validez
 * de campos/Invariantes) o rechazo de la orquestación (ruta/lectura). En
 * cualquier rechazo la generación activa permanece intacta y recuperable.
 */
export type MigrationOutcome =
  | MigrationConfirmed
  | MigrationFailure
  | MigrationOrchestrationFailure;

function orchestrationFailure(
  reason: MigrationOrchestrationReason,
  detail: string,
): MigrationOrchestrationFailure {
  return Object.freeze({ ok: false, reason, detail });
}

// ---------------------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------------------

/** Dependencias inyectadas del caso de uso de migración. */
export type MigrateStorageDeps = Readonly<{
  registry: MigrationRegistry;
  adapter: IndexedDbStoreAdapter;
  /** Base de compatibilidad del Entorno para sellar los sobres migrados. */
  compatibility: EnvelopeCompatibility;
  /** Genera el `backupId` de la copia recuperable (por inyección, sin reloj). */
  backupIdGenerator: BackupIdGenerator;
  /** Generación activa de origen; por defecto {@link DEFAULT_GENERATION_ID}. */
  activeGenerationId?: GenerationId;
  /** Generación migrada de destino; por defecto {@link MIGRATION_STAGING_GENERATION_ID}. */
  migratedGenerationId?: GenerationId;
}>;

/** Genera identificadores de copia recuperable (`backupId`) por inyección. */
export interface BackupIdGenerator {
  next(): BackupId;
}

/** Payload de la copia recuperable de una generación (store `migrationBackups`). */
type MigrationBackupPayload = Readonly<{
  generationId: GenerationId;
  saveVersion: SaveVersion;
  games: readonly GameSnapshot[];
}>;

/**
 * Orquesta la migración fail-closed de la generación activa a una Versión de
 * guardado de destino. `execute` lee la generación activa a memoria, la copia
 * como `migrationBackup`, delega los pasos puros en el registro y, solo si todo
 * es válido, consolida la generación migrada y cambia el puntero de generación
 * activa en UNA transacción; ante cualquier fallo, no cambia nada.
 */
export class MigrateStorage {
  private readonly registry: MigrationRegistry;
  private readonly adapter: IndexedDbStoreAdapter;
  private readonly compatibility: EnvelopeCompatibility;
  private readonly backupIdGenerator: BackupIdGenerator;
  private readonly activeGenerationId: GenerationId;
  private readonly migratedGenerationId: GenerationId;

  public constructor(deps: MigrateStorageDeps) {
    this.registry = deps.registry;
    this.adapter = deps.adapter;
    this.compatibility = deps.compatibility;
    this.backupIdGenerator = deps.backupIdGenerator;
    this.activeGenerationId = deps.activeGenerationId ?? DEFAULT_GENERATION_ID;
    this.migratedGenerationId =
      deps.migratedGenerationId ?? MIGRATION_STAGING_GENERATION_ID;
  }

  /**
   * Ejecuta la migración de la generación activa (Versión de guardado `from`) a
   * la Versión de guardado `to`. Devuelve {@link MigrationConfirmed} tras la
   * consolidación atómica, o un rechazo tipado (dominio u orquestación) sin
   * haber tocado la generación activa.
   */
  public async execute(from: SaveVersion, to: SaveVersion): Promise<MigrationOutcome> {
    // Paso previo: componer el plan explícito; sin ruta, rechazo tipado.
    const plan = this.registry.plan(from, to);
    if (plan === undefined) {
      return orchestrationFailure(
        "no-migration-path",
        `no hay ruta de migración de «${from}» a «${to}»`,
      );
    }

    // Leer la generación activa a memoria (StorageGeneration).
    const loaded = await this.loadActiveGeneration(from);
    if (loaded.ok === false) {
      return loaded;
    }

    // Paso 1: copiar la generación activa como copia recuperable ANTES de tocar
    // el Almacenamiento (requisito 22.7). No se borrará ante éxito ni fallo.
    const backupId = await this.backupActiveGeneration(loaded.generation);

    // Pasos 2-3 (puros): aplicar la cadena y verificar campos/registros/aleatorio
    // e Invariantes. El dominio no toca IndexedDB.
    const result = this.registry.migrate(loaded.generation, plan);
    if (result.ok === false) {
      // Paso 5 (rollback): no se cambia el puntero; la anterior sigue activa y
      // la copia recuperable permanece (requisito 22.9).
      return result;
    }

    // Paso 4: consolidar la generación migrada y cambiar `activeGenerationId` en
    // UNA transacción, SOLO porque todo es válido (requisito 22.8).
    await this.commitMigratedGeneration(result.generation);

    return Object.freeze({
      ok: true,
      saveVersion: result.generation.saveVersion,
      backupId,
      migratedGameIds: result.generation.games.map((snapshot) => snapshot.gameId),
    });
  }

  /**
   * Lee todos los resúmenes de la generación activa y sus últimas Instantáneas
   * confirmadas, construyendo una {@link StorageGeneration} en memoria. Cada
   * lectura del adaptador valida el sobre (versión, integridad, `gameId`). Ante
   * un resumen cuyo puntero no resuelve una Instantánea, falla-cerrado.
   */
  private async loadActiveGeneration(
    from: SaveVersion,
  ): Promise<
    | Readonly<{ ok: true; generation: StorageGeneration }>
    | MigrationOrchestrationFailure
  > {
    const summaries = await this.adapter.listGames<GameRecordPayload>(
      this.activeGenerationId,
    );
    const games: GameSnapshot[] = [];
    for (const summary of summaries) {
      const snapshot = await this.adapter.getSnapshot<GameSnapshot>({
        generationId: this.activeGenerationId,
        gameId: summary.gameId,
        snapshotId: summary.latestSnapshotId,
      });
      if (snapshot === undefined) {
        return orchestrationFailure(
          "missing-snapshot",
          `la Partida «${summary.gameId}» apunta a la Instantánea ` +
            `«${summary.latestSnapshotId}» pero no existe en la generación activa`,
        );
      }
      games.push(snapshot);
    }

    const generation: StorageGeneration = Object.freeze({
      id: this.activeGenerationId as StorageGeneration["id"],
      saveVersion: from,
      games: Object.freeze([...games]),
    });
    return Object.freeze({ ok: true, generation });
  }

  /**
   * Paso 1: escribe una copia recuperable de la generación activa en el store
   * `migrationBackups` bajo un `backupId` nuevo. La copia porta las Instantáneas
   * íntegras (Estado, ambos registros y Estado aleatorio) para poder restaurar.
   */
  private async backupActiveGeneration(
    generation: StorageGeneration,
  ): Promise<BackupId> {
    const backupId = this.backupIdGenerator.next();
    const payload: MigrationBackupPayload = {
      generationId: generation.id as GenerationId,
      saveVersion: generation.saveVersion,
      games: generation.games,
    };
    await this.adapter.putMigrationBackup<MigrationBackupPayload>(backupId, {
      compatibility: this.compatibility,
      payload,
    });
    return backupId;
  }

  /**
   * Paso 4: escribe la generación migrada (Instantáneas + resúmenes) y actualiza
   * el puntero de generación activa en UNA sola transacción vía `commitImport`.
   * Si cualquier escritura falla, IndexedDB aborta TODAS y la generación activa
   * previa permanece intacta (atomicidad real, requisito 22.8).
   */
  private async commitMigratedGeneration(
    generation: StorageGeneration,
  ): Promise<void> {
    const aggregates = generation.games.map((snapshot) =>
      this.snapshotWrite(this.migratedGenerationId, generation.saveVersion, snapshot),
    );
    const activeMeta: ActiveGenerationMeta = {
      activeGenerationId: this.migratedGenerationId,
    };

    await this.adapter.commitImport<
      GameSnapshot,
      GameRecordPayload,
      ActiveGenerationMeta
    >({
      aggregates,
      meta: {
        key: ACTIVE_GENERATION_META_KEY,
        write: { compatibility: this.compatibility, payload: activeMeta },
      },
    });
  }

  /**
   * Compone la escritura de una Instantánea migrada (Instantánea + resumen) bajo
   * la generación de destino. La compatibilidad del sobre se deriva de la propia
   * Instantánea migrada (Versión de guardado de destino, Versión de reglas y
   * algoritmo aleatorio) para que cualquier lectura posterior la valide.
   */
  private snapshotWrite(
    generationId: GenerationId,
    saveVersion: SaveVersion,
    snapshot: GameSnapshot,
  ): ImportAggregateWrite<GameSnapshot, GameRecordPayload> {
    const compatibility: EnvelopeCompatibility = {
      saveVersion,
      rulesVersion: snapshot.state.rulesVersion,
      algorithmVersion: snapshot.randomState.algorithmVersion,
    };
    const snapshotKey: SnapshotKey = {
      generationId,
      gameId: snapshot.gameId,
      snapshotId: snapshot.id,
    };
    const gameKey: GameKey = { generationId, gameId: snapshot.gameId };
    return {
      snapshot: {
        key: snapshotKey,
        write: { compatibility, gameId: snapshot.gameId, payload: snapshot },
      },
      game: {
        key: gameKey,
        write: {
          compatibility,
          gameId: snapshot.gameId,
          payload: toGameRecordPayload(snapshot),
        },
      },
    };
  }
}
