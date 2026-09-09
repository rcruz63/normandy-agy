import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
} from "../../src/domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
} from "../../src/domain/engine/state.js";
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
  Migrator,
} from "../../src/domain/persistence/index.js";
import { createMigrationRegistry } from "../../src/domain/persistence/index.js";
import {
  IndexedDbStoreAdapter,
  type BackupId,
  type GenerationId,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  DEFAULT_GENERATION_ID,
  MIGRATION_STAGING_GENERATION_ID,
  MigrateStorage,
  toGameRecordPayload,
  type ActiveGenerationMeta,
  type BackupIdGenerator,
  type GameRecordPayload,
} from "../../src/application/games/index.js";

// --- Fixtures de compatibilidad (soporta origen y destino) ------------------

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: "rav-1",
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1"), saveVersion("sv-2")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: ["rav-1"],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;
const migratedGeneration: GenerationId = MIGRATION_STAGING_GENERATION_ID;

// --- Instantáneas de prueba -------------------------------------------------

function makeSnapshot(id: string, save: string): GameSnapshot {
  const state = gameState({
    gameId: makeGameId(id),
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion(save),
    difficulty: { id: "normal" },
    duration: { turns: 8 },
    turn: 3,
    phase: "british-orders",
    activation: {},
    pieces: {},
    unknowns: {},
    objectives: {},
    effects: [],
    outcome: "in-progress",
  });
  return gameSnapshot({
    id: makeSnapshotId(`s-${id}`),
    gameId: makeGameId(id),
    confirmedAt: "2024-01-01T00:03:00.000Z",
    state,
    randomState: { seed: "abc", position: 5, algorithmVersion: "rav-1" },
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: "fnv1a-32", value: "00000000" },
  });
}

/** Migrador que solo eleva la Versión de guardado (conservador). */
function bumpSaveVersion(from: string, to: string): Migrator {
  return {
    from: saveVersion(from),
    to: saveVersion(to),
    apply: (input) => ({
      id: input.id,
      saveVersion: saveVersion(to),
      games: input.games.map((snapshot) =>
        gameSnapshot({
          ...snapshot,
          state: gameState({ ...snapshot.state, saveVersion: saveVersion(to) }),
        }),
      ),
    }),
  };
}

// --- Infraestructura de prueba ----------------------------------------------

async function openAdapter(factory: IDBFactory): Promise<IndexedDbStoreAdapter> {
  const adapter = new IndexedDbStoreAdapter(factory, policy);
  await adapter.open();
  return adapter;
}

function counterBackupIds(): BackupIdGenerator {
  let counter = 0;
  return {
    next: (): BackupId => {
      counter += 1;
      return `backup-${counter}`;
    },
  };
}

/** Siembra una Instantánea + su resumen en la generación activa. */
async function seedActive(
  adapter: IndexedDbStoreAdapter,
  snapshot: GameSnapshot,
): Promise<void> {
  const key: SnapshotKey = {
    generationId: activeGeneration,
    gameId: snapshot.gameId,
    snapshotId: snapshot.id,
  };
  await adapter.putSnapshot(key, {
    compatibility,
    gameId: snapshot.gameId,
    payload: snapshot,
  });
  await adapter.putGame(
    { generationId: activeGeneration, gameId: snapshot.gameId },
    {
      compatibility,
      gameId: snapshot.gameId,
      payload: toGameRecordPayload(snapshot),
    },
  );
}

function migrateStorageFor(adapter: IndexedDbStoreAdapter): MigrateStorage {
  const registry = createMigrationRegistry([bumpSaveVersion("sv-1", "sv-2")]);
  return new MigrateStorage({
    registry,
    adapter,
    compatibility: { ...compatibility, saveVersion: saveVersion("sv-2") },
    backupIdGenerator: counterBackupIds(),
  });
}

describe("MigrateStorage — migración con copia recuperable y confirmación atómica", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("copia la generación activa, migra y cambia el puntero activo (requisitos 22.7, 22.8)", async () => {
    const adapter = await openAdapter(factory);
    await seedActive(adapter, makeSnapshot("g-1", "sv-1"));
    await seedActive(adapter, makeSnapshot("g-2", "sv-1"));

    const outcome = await migrateStorageFor(adapter).execute(
      saveVersion("sv-1"),
      saveVersion("sv-2"),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.saveVersion).toBe(saveVersion("sv-2"));
      expect([...outcome.migratedGameIds].sort()).toEqual(
        [makeGameId("g-1"), makeGameId("g-2")].sort(),
      );

      // Paso 4: el puntero activo apunta a la generación migrada.
      const meta = await adapter.getMeta<ActiveGenerationMeta>(
        ACTIVE_GENERATION_META_KEY,
      );
      expect(meta?.activeGenerationId).toBe(migratedGeneration);

      // Paso 5: la copia recuperable se conserva (requisito 22.9).
      const backup = await adapter.getMigrationBackup(outcome.backupId);
      expect(backup).toBeDefined();

      // La generación migrada contiene la Instantánea con la nueva Versión.
      const migrated = await adapter.getGame<GameRecordPayload>({
        generationId: migratedGeneration,
        gameId: makeGameId("g-1"),
      });
      expect(migrated?.gameId).toBe(makeGameId("g-1"));
    }
  });

  it("no cambia el puntero activo cuando no existe ruta de migración (rollback)", async () => {
    const adapter = await openAdapter(factory);
    await seedActive(adapter, makeSnapshot("g-1", "sv-1"));

    const outcome = await migrateStorageFor(adapter).execute(
      saveVersion("sv-1"),
      saveVersion("sv-9"),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "no-migration-path" });
    const meta = await adapter.getMeta<ActiveGenerationMeta>(
      ACTIVE_GENERATION_META_KEY,
    );
    // La generación activa nunca se tocó: sin metadato de cambio.
    expect(meta).toBeUndefined();
  });

  it("conserva la generación anterior y la copia recuperable ante fallo del dominio (requisito 22.9)", async () => {
    const adapter = await openAdapter(factory);
    await seedActive(adapter, makeSnapshot("g-1", "sv-1"));

    // Migrador que descarta la Partida: el dominio devuelve field-not-preserved.
    const dropper: Migrator = {
      from: saveVersion("sv-1"),
      to: saveVersion("sv-2"),
      apply: (input) => ({ id: input.id, saveVersion: saveVersion("sv-2"), games: [] }),
    };
    const migrate = new MigrateStorage({
      registry: createMigrationRegistry([dropper]),
      adapter,
      compatibility: { ...compatibility, saveVersion: saveVersion("sv-2") },
      backupIdGenerator: counterBackupIds(),
    });

    const outcome = await migrate.execute(saveVersion("sv-1"), saveVersion("sv-2"));

    expect(outcome).toMatchObject({ ok: false, reason: "field-not-preserved" });

    // Rollback: el puntero activo no cambió y la copia recuperable existe.
    const meta = await adapter.getMeta<ActiveGenerationMeta>(
      ACTIVE_GENERATION_META_KEY,
    );
    expect(meta).toBeUndefined();
    const backup = await adapter.getMigrationBackup("backup-1");
    expect(backup).toBeDefined();

    // La generación activa original permanece íntegra.
    const original = await adapter.getGame<GameRecordPayload>({
      generationId: activeGeneration,
      gameId: makeGameId("g-1"),
    });
    expect(original?.gameId).toBe(makeGameId("g-1"));
  });
});
