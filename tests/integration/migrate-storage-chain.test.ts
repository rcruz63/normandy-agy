import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  type GameId,
  type SaveVersion,
} from "../../src/domain/identity/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import { gameSnapshot, gameState } from "../../src/domain/engine/state.js";
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
  Migrator,
} from "../../src/domain/persistence/index.js";
import { createMigrationRegistry } from "../../src/domain/persistence/index.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import {
  IndexedDbStoreAdapter,
  type BackupId,
  type GameKey,
  type GenerationId,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  CreateGame,
  DEFAULT_GENERATION_ID,
  MIGRATION_STAGING_GENERATION_ID,
  IndexedDbGameRepository,
  MigrateStorage,
  type ActiveGenerationMeta,
  type BackupIdGenerator,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

/**
 * Pruebas de integración DETERMINISTAS de migración con una CADENA de
 * migradores y fallo INTERMEDIO (Tarea 16.6, requisitos 22.10, 22.11).
 *
 * Cubren el hueco que el test de 16.3 (`migrate-storage.test.ts`) no ejercita:
 * allí un ÚNICO migrador rompedor fuerza el rollback. Aquí la ruta encadena
 * varios migradores (`sv-1` → `sv-2` → `sv-3`) donde el paso INTERMEDIO no
 * conserva un campo, de modo que el fallo aparece a mitad de la cadena y todo
 * el traslado se cancela (fail-closed, 22.9). Se comprueba que el
 * `activeGenerationId` sigue apuntando a la generación ANTERIOR, que la copia
 * recuperable (`migrationBackup`) está presente y que las Partidas activas
 * quedan intactas.
 *
 * La migración es EXPLÍCITA y local: sin canal de sincronización, reloj real ni
 * `Math.random` (22.10). Reloj, `idGenerator` y `backupIdGenerator` se inyectan.
 */

// --- Versiones de guardado de la cadena -------------------------------------

const V1: SaveVersion = saveVersion("sv-1");
const V2: SaveVersion = saveVersion("sv-2");
const V3: SaveVersion = saveVersion("sv-3");

// --- Fixtures de compatibilidad (soporta toda la cadena) --------------------

const compatibility: EnvelopeCompatibility = {
  saveVersion: V1,
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: ALGORITHM_SPLITMIX64_V1,
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [V1, V2, V3],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: [ALGORITHM_SPLITMIX64_V1],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;
const migratedGeneration: GenerationId = MIGRATION_STAGING_GENERATION_ID;

// --- Preparación de Misión reutilizada (dominio, Tarea 11.2) ----------------

function missionSetup(): MissionSetup {
  return prepareMission({
    missionNumber: 1,
    duration: { baseTurns: 4 },
    durationChoice: "base",
    britishForces: [
      { kind: "rifle-squad", squad: "A", labelEs: "Escuadra de fusileros A" },
    ],
    fixedGermanUnits: { present: false },
    objective: { kind: "eliminate-single-revealed-german" },
    revealTable: { missionRef: "FON-ML-2022-M01" },
  });
}

function identityFor(id: GameId): GameIdentity {
  return {
    gameId: id,
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: V1,
    difficulty: { id: "normal" },
  };
}

function initialInput(id: GameId, seed: string): InitialSnapshotInput {
  return { missionSetup: missionSetup(), identity: identityFor(id), seed };
}

// --- Infraestructura de prueba ----------------------------------------------

async function openAdapter(factory: IDBFactory): Promise<IndexedDbStoreAdapter> {
  const adapter = new IndexedDbStoreAdapter(factory, policy);
  await adapter.open();
  return adapter;
}

function counterIdGenerator(prefix: string): IdGenerator & SnapshotIdGenerator {
  let counter = 0;
  return {
    next: (): string => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}

function fixedClock(value: string): Clock {
  return { now: (): string => value };
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

function repositoryFor(adapter: IndexedDbStoreAdapter): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId: activeGeneration,
  });
}

// --- Migradores de la cadena ------------------------------------------------

/**
 * Migrador CONSERVADOR entre dos Versiones contiguas: identidad salvo la
 * Versión de guardado de la generación y de cada Instantánea. No descarta
 * Partidas ni toca registros o Estado aleatorio.
 */
function conservativeMigrator(from: SaveVersion, to: SaveVersion): Migrator {
  return {
    from,
    to,
    apply: (input) => ({
      id: input.id,
      saveVersion: to,
      games: input.games.map((snapshot) =>
        gameSnapshot({
          ...snapshot,
          state: gameState({ ...snapshot.state, saveVersion: to }),
        }),
      ),
    }),
  };
}

/**
 * Migrador ROMPEDOR entre dos Versiones contiguas: eleva la Versión pero
 * DESCARTA todas las Partidas, incumpliendo la conservación de campos. El
 * dominio lo rechaza con `field-not-preserved`.
 */
function droppingMigrator(from: SaveVersion, to: SaveVersion): Migrator {
  return {
    from,
    to,
    apply: (input) => ({ id: input.id, saveVersion: to, games: [] }),
  };
}

// --- Origen: creación de Partidas iniciales en la generación activa ---------

async function seedActiveGames(
  adapter: IndexedDbStoreAdapter,
  seeds: readonly Readonly<{ id: GameId; seed: string }>[],
): Promise<ReadonlyMap<GameId, GameSnapshot>> {
  const createGame = new CreateGame({
    repository: repositoryFor(adapter),
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator("snap"),
  });
  const byId = new Map<GameId, GameSnapshot>();
  for (const { id, seed } of seeds) {
    const created = await createGame.execute(initialInput(id, seed));
    byId.set(id, created.snapshot);
  }
  return byId;
}

// --- Lectura del Almacenamiento ---------------------------------------------

type StoredGame = Readonly<{
  summary: GameRecordPayload | undefined;
  snapshot: GameSnapshot | undefined;
}>;

async function readGame(
  adapter: IndexedDbStoreAdapter,
  generationId: GenerationId,
  gameId: GameId,
): Promise<StoredGame> {
  const gameKey: GameKey = { generationId, gameId };
  const summary = await adapter.getGame<GameRecordPayload>(gameKey);
  if (summary === undefined) {
    return { summary: undefined, snapshot: undefined };
  }
  const snapshotKey: SnapshotKey = {
    generationId,
    gameId,
    snapshotId: summary.latestSnapshotId,
  };
  const snapshot = await adapter.getSnapshot<GameSnapshot>(snapshotKey);
  return { summary, snapshot };
}

describe("MigrateStorage — cadena de migradores con fallo intermedio y rollback (requisitos 22.10, 22.11)", () => {
  let adapter: IndexedDbStoreAdapter;

  beforeEach(async () => {
    adapter = await openAdapter(new IDBFactory());
  });

  it("cancela todo cuando un migrador INTERMEDIO de la cadena no conserva un campo", async () => {
    const initial = await seedActiveGames(adapter, [
      { id: makeGameId("g-1"), seed: "seed-1" },
      { id: makeGameId("g-2"), seed: "seed-2" },
    ]);

    // Cadena sv-1 → sv-2 → sv-3: el paso INTERMEDIO (sv-1 → sv-2) rompe la
    // conservación; el paso final (sv-2 → sv-3) sería conservador.
    const registry = createMigrationRegistry([
      droppingMigrator(V1, V2),
      conservativeMigrator(V2, V3),
    ]);
    const migrate = new MigrateStorage({
      registry,
      adapter,
      compatibility: { ...compatibility, saveVersion: V3 },
      backupIdGenerator: counterBackupIds(),
    });

    const outcome = await migrate.execute(V1, V3);

    // El fallo se detecta y todo el traslado se cancela (fail-closed).
    expect(outcome).toMatchObject({ ok: false, reason: "field-not-preserved" });

    // El puntero activo NO cambió: sigue apuntando a la generación anterior.
    const meta = await adapter.getMeta<ActiveGenerationMeta>(
      ACTIVE_GENERATION_META_KEY,
    );
    expect(meta).toBeUndefined();

    // La copia recuperable de la generación anterior está presente (22.7/22.9).
    const backup = await adapter.getMigrationBackup("backup-1");
    expect(backup).toBeDefined();

    // Cada Partida activa queda EXACTAMENTE como estaba y la generación migrada
    // no consolidó nada.
    for (const [gameId, before] of initial) {
      const active = await readGame(adapter, activeGeneration, gameId);
      expect(active.snapshot).toStrictEqual(before);
      expect(active.summary?.latestSnapshotId).toBe(before.id);

      const migrated = await readGame(adapter, migratedGeneration, gameId);
      expect(migrated.summary).toBeUndefined();
      expect(migrated.snapshot).toBeUndefined();
    }
  });

  it("migra y confirma atómicamente cuando toda la cadena conserva los campos", async () => {
    const initial = await seedActiveGames(adapter, [
      { id: makeGameId("g-1"), seed: "seed-1" },
    ]);

    // Cadena sv-1 → sv-2 → sv-3 completamente conservadora.
    const registry = createMigrationRegistry([
      conservativeMigrator(V1, V2),
      conservativeMigrator(V2, V3),
    ]);
    const migrate = new MigrateStorage({
      registry,
      adapter,
      compatibility: { ...compatibility, saveVersion: V3 },
      backupIdGenerator: counterBackupIds(),
    });

    const outcome = await migrate.execute(V1, V3);

    expect(outcome.ok).toBe(true);
    if (outcome.ok !== true) {
      throw new Error("se esperaba una migración encadenada satisfactoria");
    }
    expect(outcome.saveVersion).toBe(V3);

    // El puntero activo apunta a la generación migrada y la copia se conserva.
    const meta = await adapter.getMeta<ActiveGenerationMeta>(
      ACTIVE_GENERATION_META_KEY,
    );
    expect(meta?.activeGenerationId).toBe(migratedGeneration);
    const backup = await adapter.getMigrationBackup(outcome.backupId);
    expect(backup).toBeDefined();

    // Cada Instantánea migrada conserva Estado, ambos registros y Estado
    // aleatorio; solo cambia la Versión de guardado hasta el destino de cadena.
    for (const [gameId, before] of initial) {
      const migrated = await readGame(adapter, migratedGeneration, gameId);
      const expected = gameSnapshot({
        ...before,
        state: gameState({ ...before.state, saveVersion: V3 }),
      });
      expect(migrated.snapshot).toStrictEqual(expected);
      expect(migrated.snapshot?.simpleLog).toStrictEqual(before.simpleLog);
      expect(migrated.snapshot?.detailedLog).toStrictEqual(before.detailedLog);
      expect(migrated.snapshot?.randomState).toStrictEqual(before.randomState);
      expect(migrated.summary?.latestSnapshotId).toBe(before.id);
    }
  });
});
