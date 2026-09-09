/**
 * Adaptador de bajo nivel de IndexedDB con sobres versionados (Tarea 15.1).
 *
 * Expone operaciones tipadas y cohesivas que la Tarea 15.2 consumirá para
 * construir `GameRepository`/`GameUnitOfWork` con commit transaccional único.
 * Cada registro persistido combina las columnas de clave del object store
 * (según `schema.ts`) con un {@link VersionedEnvelope} en el campo `envelope`.
 *
 * TODA lectura valida versión, integridad del sobre, `gameId` interno y
 * compatibilidad (catálogo/algoritmo/guardado) mediante `openEnvelope`; ante
 * cualquier discrepancia lanza {@link EnvelopeValidationError} (fail-closed).
 *
 * FRONTERA DE CAPAS: vive en el adaptador de navegador y usa IndexedDB. La
 * `IDBFactory` se inyecta por constructor (pruebas con `fake-indexeddb`). No
 * usa reloj ni `Math.random`; las marcas de tiempo llegan ya dentro de los
 * `payload` que aporta la capa de aplicación.
 */
import type { GameId, SnapshotId } from "../../../domain/identity/index.js";
import {
  openEnvelope,
  sealEnvelope,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
  type EnvelopeReadContext,
  type VersionedEnvelope,
} from "../../../domain/persistence/index.js";
import { OBJECT_STORES, type ObjectStoreName } from "./schema.js";
import {
  openDatabase,
  requestToPromise,
  runTransaction,
} from "./idb-runtime.js";

/** Identificador de generación de almacenamiento (activa/anterior). */
export type GenerationId = string;

/** Identificador de una copia de migración recuperable. */
export type BackupId = string;

/** Identificador del instante de detección de un sobre corrupto (cuarentena). */
export type DetectedAtId = string;

/** Clave lógica de una Instantánea dentro de una generación y Partida. */
export type SnapshotKey = Readonly<{
  generationId: GenerationId;
  gameId: GameId;
  snapshotId: SnapshotId;
}>;

/** Clave lógica del resumen de una Partida dentro de una generación. */
export type GameKey = Readonly<{
  generationId: GenerationId;
  gameId: GameId;
}>;

/** Registro almacenado en `snapshots`: clave compuesta + sobre del `payload`. */
export type SnapshotRecord<T> = SnapshotKey &
  Readonly<{ envelope: VersionedEnvelope<T> }>;

/** Registro almacenado en `games`: clave compuesta + sobre del resumen. */
export type GameRecord<T> = GameKey &
  Readonly<{ envelope: VersionedEnvelope<T> }>;

/** Registro almacenado en `migrationBackups`: `backupId` + sobre. */
export type MigrationBackupRecord<T> = Readonly<{
  backupId: BackupId;
  envelope: VersionedEnvelope<T>;
}>;

/** Registro almacenado en `settings`/`meta`: `key` + sobre. */
export type KeyedRecord<T> = Readonly<{
  key: string;
  envelope: VersionedEnvelope<T>;
}>;

/** Registro almacenado en `quarantine`: clave + bytes aislados sin validar. */
export type QuarantineRecord = Readonly<{
  gameId: GameId;
  detectedAtId: DetectedAtId;
  reasonKey: string;
  isolatedPayload: unknown;
}>;

/** Descripción de un sobre a escribir: compatibilidad, `gameId` y `payload`. */
export type EnvelopeWrite<T> = Readonly<{
  compatibility: EnvelopeCompatibility;
  gameId?: GameId;
  payload: T;
}>;

/**
 * Escritura de un metadato dentro de un commit atómico (opcional).
 *
 * Permite actualizar, en la MISMA transacción del commit, un metadato de la
 * Partida (p. ej. la generación activa o el estado de última confirmación) sin
 * abrir una transacción aparte que rompería la atomicidad.
 */
export type MetaWrite<M> = Readonly<{
  key: string;
  write: EnvelopeWrite<M>;
}>;

/**
 * Entrada del commit transaccional único {@link IndexedDbStoreAdapter.commitTransition}.
 *
 * Reúne todo lo que una transición confirmada debe escribir de forma indivisible:
 * la nueva Instantánea íntegra (con ambos registros dentro del `payload`), el
 * resumen de la Partida con su puntero `latestSnapshotId` y, opcionalmente, un
 * metadato. El repositorio (Tarea 15.2) compone esta entrada; el adaptador solo
 * hace I/O.
 */
export type CommitTransitionInput<S, G, M = never> = Readonly<{
  snapshot: Readonly<{ key: SnapshotKey; write: EnvelopeWrite<S> }>;
  game: Readonly<{ key: GameKey; write: EnvelopeWrite<G> }>;
  meta?: MetaWrite<M>;
}>;

/**
 * Agregado a escribir dentro de un commit de importación: la Instantánea íntegra
 * y el resumen de la Partida con su puntero `latestSnapshotId`, ambos bajo la
 * misma generación destino. El adaptador solo hace I/O; la validación profunda y
 * la resolución de colisiones viven en la capa de aplicación (Tarea 16.2).
 */
export type ImportAggregateWrite<S, G> = Readonly<{
  snapshot: Readonly<{ key: SnapshotKey; write: EnvelopeWrite<S> }>;
  game: Readonly<{ key: GameKey; write: EnvelopeWrite<G> }>;
}>;

/**
 * Entrada del commit transaccional único de importación
 * {@link IndexedDbStoreAdapter.commitImport}.
 *
 * Reúne VARIOS agregados (Instantánea + resumen por Partida) y un metadato
 * opcional (p. ej. el puntero de generación activa) que deben escribirse de
 * forma INDIVISIBLE en una sola transacción. Si cualquier escritura falla,
 * IndexedDB aborta TODAS (nada a medias) y la generación activa previa se
 * conserva íntegra (requisitos 22.4, 22.5).
 */
export type CommitImportInput<S, G, M = never> = Readonly<{
  aggregates: readonly ImportAggregateWrite<S, G>[];
  meta?: MetaWrite<M>;
}>;

/**
 * Adaptador de bajo nivel. Mantiene la conexión abierta y la política de
 * compatibilidad con la que valida CADA lectura. Es reutilizable por 15.2
 * (repositorio/unidad de trabajo) y por 15.4 (cuarentena de alto nivel).
 */
export class IndexedDbStoreAdapter {
  private readonly factory: IDBFactory;
  private readonly compatibilityPolicy: CompatibilityPolicy;
  private database: IDBDatabase | undefined;

  public constructor(factory: IDBFactory, compatibilityPolicy: CompatibilityPolicy) {
    this.factory = factory;
    this.compatibilityPolicy = compatibilityPolicy;
  }

  /** Abre la base creando los seis object stores si no existen (idempotente). */
  public async open(): Promise<void> {
    if (this.database !== undefined) {
      return;
    }
    this.database = await openDatabase(this.factory);
  }

  /** Cierra la conexión; nuevas operaciones exigirán reabrir con {@link open}. */
  public close(): void {
    if (this.database === undefined) {
      return;
    }
    this.database.close();
    this.database = undefined;
  }

  // --- snapshots -----------------------------------------------------------

  /** Escribe una Instantánea sellada en un sobre dentro de una transacción. */
  public async putSnapshot<T>(key: SnapshotKey, write: EnvelopeWrite<T>): Promise<void> {
    const record: SnapshotRecord<T> = { ...key, envelope: this.seal(write) };
    await this.putRecord(OBJECT_STORES.snapshots, record);
  }

  /** Lee y valida una Instantánea; devuelve el `payload` o `undefined`. */
  public async getSnapshot<T>(key: SnapshotKey): Promise<T | undefined> {
    return this.getValidatedPayload<T>(
      OBJECT_STORES.snapshots,
      [key.generationId, key.gameId, key.snapshotId],
      { expectedGameId: key.gameId, expectedSnapshotId: key.snapshotId },
    );
  }

  // --- games ---------------------------------------------------------------

  /** Escribe el resumen de una Partida (con puntero a última Instantánea). */
  public async putGame<T>(key: GameKey, write: EnvelopeWrite<T>): Promise<void> {
    const record: GameRecord<T> = { ...key, envelope: this.seal(write) };
    await this.putRecord(OBJECT_STORES.games, record);
  }

  /** Lee y valida el resumen de una Partida; devuelve el `payload`. */
  public async getGame<T>(key: GameKey): Promise<T | undefined> {
    return this.getValidatedPayload<T>(
      OBJECT_STORES.games,
      [key.generationId, key.gameId],
      { expectedGameId: key.gameId },
    );
  }

  /**
   * Lee y valida TODOS los resúmenes de Partida de una generación, devolviendo
   * sus `payload`. Cada sobre se valida (versión, integridad, `gameId` interno)
   * como en cualquier otra lectura; ante un sobre corrupto se propaga
   * {@link EnvelopeValidationError} para que la capa superior lo trate
   * (cuarentena, Tarea 15.4). Reutilizable por el repositorio (Tarea 15.2) para
   * `list()` sin exponer cursores a la capa de aplicación.
   */
  public async listGames<T>(generationId: GenerationId): Promise<readonly T[]> {
    const database = this.requireDatabase();
    return runTransaction(
      database,
      [OBJECT_STORES.games],
      "readonly",
      async (transaction) => {
        const store = transaction.objectStore(OBJECT_STORES.games);
        const rawRecords = await requestToPromise(store.getAll());
        return rawRecords.map((raw) => {
          const record = raw as GameRecord<unknown>;
          if (record.generationId !== generationId) {
            return undefined;
          }
          return openEnvelope<T>(record.envelope, this.compatibilityPolicy, {
            expectedGameId: record.gameId,
          });
        }).filter((payload): payload is T => payload !== undefined);
      },
    );
  }

  // --- commit transaccional único (Tarea 15.2) -----------------------------

  /**
   * Confirma una transición escribiendo, en UNA sola transacción `readwrite`,
   * la nueva Instantánea, el resumen de la Partida (con su puntero
   * `latestSnapshotId` dentro del `payload`) y, opcionalmente, un metadato.
   *
   * ATOMICIDAD REAL: las operaciones `putSnapshot`/`putGame`/`putMeta` abren una
   * transacción SEPARADA por store, lo que NO satisface el commit único que
   * exigen los requisitos 7.7/21.9 (Instantánea + resumen + puntero + metadatos
   * indivisibles, con abort atómico). Este método reutiliza el
   * {@link runTransaction} del runtime abarcando los tres stores a la vez: si
   * cualquier `put` falla, IndexedDB aborta TODOS los cambios (nada a medias) y
   * la promesa se rechaza con {@link IndexedDbError}. La orquestación (cola por
   * `gameId`, control optimista, validación de invariantes) vive en la capa de
   * aplicación; aquí solo se realiza el I/O indivisible.
   */
  public async commitTransition<S, G, M = never>(
    input: CommitTransitionInput<S, G, M>,
  ): Promise<void> {
    const database = this.requireDatabase();
    const stores: ObjectStoreName[] = [OBJECT_STORES.snapshots, OBJECT_STORES.games];
    if (input.meta !== undefined) {
      stores.push(OBJECT_STORES.meta);
    }

    const snapshotRecord: SnapshotRecord<S> = {
      ...input.snapshot.key,
      envelope: this.seal(input.snapshot.write),
    };
    const gameRecord: GameRecord<G> = {
      ...input.game.key,
      envelope: this.seal(input.game.write),
    };

    await runTransaction(database, stores, "readwrite", async (transaction) => {
      await requestToPromise(
        transaction.objectStore(OBJECT_STORES.snapshots).put(snapshotRecord),
      );
      await requestToPromise(
        transaction.objectStore(OBJECT_STORES.games).put(gameRecord),
      );
      if (input.meta !== undefined) {
        const metaRecord: KeyedRecord<M> = {
          key: input.meta.key,
          envelope: this.seal(input.meta.write),
        };
        await requestToPromise(
          transaction.objectStore(OBJECT_STORES.meta).put(metaRecord),
        );
      }
    });
  }

  // --- commit transaccional único de importación (Tarea 16.2) --------------

  /**
   * Confirma VARIOS agregados importados en UNA sola transacción `readwrite`
   * sobre `snapshots`, `games` y (opcionalmente) `meta`. Para cada agregado
   * escribe la Instantánea íntegra y el resumen de la Partida con su puntero
   * `latestSnapshotId`; tras las escrituras, y dentro de la MISMA transacción,
   * actualiza el metadato de generación activa si se aporta.
   *
   * ATOMICIDAD REAL (requisitos 22.4, 22.5): a diferencia de invocar
   * `putSnapshot`/`putGame`/`putMeta` por separado (una transacción por store,
   * que dejaría escrituras a medias ante un fallo), este método abarca los tres
   * stores a la vez reutilizando {@link runTransaction}. Si cualquier `put`
   * falla, IndexedDB aborta TODOS los cambios (importación fail-closed) y la
   * generación activa previa permanece intacta; la promesa se rechaza con
   * {@link IndexedDbError}. La detección de colisiones de `gameId`, la
   * confirmación explícita y la validación de invariantes viven en la capa de
   * aplicación; aquí solo se realiza el I/O indivisible.
   */
  public async commitImport<S, G, M = never>(
    input: CommitImportInput<S, G, M>,
  ): Promise<void> {
    const database = this.requireDatabase();
    const stores: ObjectStoreName[] = [OBJECT_STORES.snapshots, OBJECT_STORES.games];
    if (input.meta !== undefined) {
      stores.push(OBJECT_STORES.meta);
    }

    const records = input.aggregates.map((aggregate) => ({
      snapshotRecord: {
        ...aggregate.snapshot.key,
        envelope: this.seal(aggregate.snapshot.write),
      } as SnapshotRecord<S>,
      gameRecord: {
        ...aggregate.game.key,
        envelope: this.seal(aggregate.game.write),
      } as GameRecord<G>,
    }));

    await runTransaction(database, stores, "readwrite", async (transaction) => {
      const snapshots = transaction.objectStore(OBJECT_STORES.snapshots);
      const games = transaction.objectStore(OBJECT_STORES.games);
      for (const record of records) {
        await requestToPromise(snapshots.put(record.snapshotRecord));
        await requestToPromise(games.put(record.gameRecord));
      }
      if (input.meta !== undefined) {
        const metaRecord: KeyedRecord<M> = {
          key: input.meta.key,
          envelope: this.seal(input.meta.write),
        };
        await requestToPromise(
          transaction.objectStore(OBJECT_STORES.meta).put(metaRecord),
        );
      }
    });
  }

  // --- migrationBackups ----------------------------------------------------

  /** Escribe una copia de migración recuperable bajo `backupId`. */
  public async putMigrationBackup<T>(backupId: BackupId, write: EnvelopeWrite<T>): Promise<void> {
    const record: MigrationBackupRecord<T> = { backupId, envelope: this.seal(write) };
    await this.putRecord(OBJECT_STORES.migrationBackups, record);
  }

  /** Lee y valida una copia de migración; devuelve el `payload`. */
  public async getMigrationBackup<T>(backupId: BackupId): Promise<T | undefined> {
    return this.getValidatedPayload<T>(OBJECT_STORES.migrationBackups, backupId);
  }

  // --- settings / meta -----------------------------------------------------

  /** Escribe una preferencia/ajuste bajo `key` en `settings`. */
  public async putSetting<T>(key: string, write: EnvelopeWrite<T>): Promise<void> {
    await this.putKeyed(OBJECT_STORES.settings, key, write);
  }

  /** Lee y valida un ajuste de `settings`; devuelve el `payload`. */
  public async getSetting<T>(key: string): Promise<T | undefined> {
    return this.getValidatedPayload<T>(OBJECT_STORES.settings, key);
  }

  /** Escribe un metadato (generación activa, migración…) bajo `key` en `meta`. */
  public async putMeta<T>(key: string, write: EnvelopeWrite<T>): Promise<void> {
    await this.putKeyed(OBJECT_STORES.meta, key, write);
  }

  /** Lee y valida un metadato de `meta`; devuelve el `payload`. */
  public async getMeta<T>(key: string): Promise<T | undefined> {
    return this.getValidatedPayload<T>(OBJECT_STORES.meta, key);
  }

  // --- quarantine ----------------------------------------------------------

  /**
   * Aísla un sobre corrupto en `quarantine` SIN borrar sus bytes originales
   * (`isolatedPayload`). Primitiva reutilizable por la cuarentena de alto nivel
   * (Tarea 15.4). No valida el contenido: precisamente aísla lo que falló.
   */
  public async isolateCorrupt(record: QuarantineRecord): Promise<void> {
    await this.putRecord(OBJECT_STORES.quarantine, record);
  }

  /** Lee un sobre en cuarentena por su clave `[gameId, detectedAtId]`. */
  public async getQuarantined(
    gameId: GameId,
    detectedAtId: DetectedAtId,
  ): Promise<QuarantineRecord | undefined> {
    const database = this.requireDatabase();
    return runTransaction(
      database,
      [OBJECT_STORES.quarantine],
      "readonly",
      async (transaction) => {
        const store = transaction.objectStore(OBJECT_STORES.quarantine);
        const raw = await requestToPromise(store.get([gameId, detectedAtId]));
        return raw as QuarantineRecord | undefined;
      },
    );
  }

  // --- helpers internos ----------------------------------------------------

  private seal<T>(write: EnvelopeWrite<T>): VersionedEnvelope<T> {
    if (write.gameId !== undefined) {
      return sealEnvelope({
        compatibility: write.compatibility,
        gameId: write.gameId,
        payload: write.payload,
      });
    }
    return sealEnvelope({ compatibility: write.compatibility, payload: write.payload });
  }

  private async putKeyed<T>(
    storeName: ObjectStoreName,
    key: string,
    write: EnvelopeWrite<T>,
  ): Promise<void> {
    const record: KeyedRecord<T> = { key, envelope: this.seal(write) };
    await this.putRecord(storeName, record);
  }

  private async putRecord(storeName: ObjectStoreName, record: unknown): Promise<void> {
    const database = this.requireDatabase();
    await runTransaction(database, [storeName], "readwrite", async (transaction) => {
      const store = transaction.objectStore(storeName);
      await requestToPromise(store.put(record));
    });
  }

  private async getValidatedPayload<T>(
    storeName: ObjectStoreName,
    key: IDBValidKey,
    context: EnvelopeReadContext = {},
  ): Promise<T | undefined> {
    const database = this.requireDatabase();
    return runTransaction(database, [storeName], "readonly", async (transaction) => {
      const store = transaction.objectStore(storeName);
      const raw = await requestToPromise(store.get(key));
      if (raw === undefined) {
        return undefined;
      }
      const envelope = (raw as Readonly<{ envelope: unknown }>).envelope;
      return openEnvelope<T>(envelope, this.compatibilityPolicy, context);
    });
  }

  private requireDatabase(): IDBDatabase {
    if (this.database === undefined) {
      throw new Error("El adaptador de IndexedDB no está abierto; llama a open() primero.");
    }
    return this.database;
  }
}
