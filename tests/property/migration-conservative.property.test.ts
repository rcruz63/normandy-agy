import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  type GameId,
  type SaveVersion,
} from "../../src/domain/identity/index.js";
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
  Migrator,
} from "../../src/domain/persistence/index.js";
import { createMigrationRegistry } from "../../src/domain/persistence/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import { gameSnapshot, gameState } from "../../src/domain/engine/state.js";
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
 * Propiedad 19 (Tarea 16.5): «Migración conservadora y recuperable».
 *
 * Una migración VÁLIDA conserva TODOS los campos, ambos registros y el Estado
 * aleatorio, supera las Invariantes/integridad y confirma de forma ATÓMICA la
 * nueva Versión de guardado cambiando `activeGenerationId` a la generación
 * migrada (requisitos 22.6, 22.8); antes de tocar el Almacenamiento deja una
 * copia recuperable (`migrationBackup`) de la generación anterior (22.7).
 *
 * Una migración que FALLA o no puede conservar un campo CANCELA todos los
 * cambios y mantiene la versión anterior recuperable: `activeGenerationId`
 * sigue apuntando a la generación ANTERIOR, la copia recuperable está presente
 * y las Partidas activas quedan intactas (fail-closed, requisito 22.9).
 *
 * Valida requisitos 22.6, 22.7, 22.8, 22.9.
 *
 * Los auxiliares y arbitrarios viven FUERA del `it`. La property es asíncrona
 * (`fc.asyncProperty`) porque cada réplica abre `fake-indexeddb`, crea las
 * Partidas en la generación activa, ejecuta la orquestación `MigrateStorage` y
 * comprueba el Almacenamiento por igualdad estructural.
 */

// --- Fixtures de compatibilidad (soporta origen «sv-1» y destino «sv-2») ----

const SOURCE_SAVE_VERSION: SaveVersion = saveVersion("sv-1");
const TARGET_SAVE_VERSION: SaveVersion = saveVersion("sv-2");

const compatibility: EnvelopeCompatibility = {
  saveVersion: SOURCE_SAVE_VERSION,
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: ALGORITHM_SPLITMIX64_V1,
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [SOURCE_SAVE_VERSION, TARGET_SAVE_VERSION],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: [ALGORITHM_SPLITMIX64_V1],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;
const migratedGeneration: GenerationId = MIGRATION_STAGING_GENERATION_ID;

// --- Escenario generado -----------------------------------------------------

/** Insumos de una Partida inicial: sufijo de `gameId` único y Semilla. */
type GameSeed = Readonly<{ suffix: string; seed: string }>;

/**
 * Insumos de una réplica: el conjunto de Partidas iniciales (de 1 a N, con
 * sufijos de `gameId` únicos) y un flag `conserve` que decide la rama:
 * `true` ejercita el migrador CONSERVADOR (éxito); `false` el ROMPEDOR (fallo).
 */
type Scenario = Readonly<{
  games: readonly GameSeed[];
  conserve: boolean;
}>;

/** Normaliza un fragmento a caracteres seguros para identificadores/Semillas. */
function sanitize(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length === 0 ? fallback : cleaned;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), {
    minLength: 1,
    maxLength: 4,
    selector: (raw) => sanitize(raw, ""),
  })
  // Descarta los conjuntos cuyos sufijos colapsan al mismo valor saneado: así
  // los `gameId` resultantes son ÚNICOS por réplica.
  .filter((raws) => {
    const suffixes = raws.map((raw, index) => sanitize(raw, `g${index}`));
    return new Set(suffixes).size === suffixes.length;
  })
  .chain((raws) => {
    const games: readonly GameSeed[] = raws.map((raw, index) => ({
      suffix: sanitize(raw, `g${index}`),
      seed: `seed-${sanitize(raw, `s${index}`)}-${index}`,
    }));
    return fc.boolean().map((conserve) => ({ games, conserve }) satisfies Scenario);
  });

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
    saveVersion: SOURCE_SAVE_VERSION,
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

// --- Migradores conservador y rompedor --------------------------------------

/**
 * Migrador CONSERVADOR (`sv-1` → `sv-2`): identidad salvo la Versión de guardado
 * de la generación y de cada Instantánea. No descarta Partidas ni toca los
 * registros ni el Estado aleatorio, por lo que la migración conserva todos los
 * campos y confirma de forma atómica (requisitos 22.6, 22.8).
 */
const conservativeMigrator: Migrator = {
  from: SOURCE_SAVE_VERSION,
  to: TARGET_SAVE_VERSION,
  apply: (input) => ({
    id: input.id,
    saveVersion: TARGET_SAVE_VERSION,
    games: input.games.map((snapshot) =>
      gameSnapshot({
        ...snapshot,
        state: gameState({ ...snapshot.state, saveVersion: TARGET_SAVE_VERSION }),
      }),
    ),
  }),
};

/**
 * Migrador ROMPEDOR (`sv-1` → `sv-2`): DESCARTA todas las Partidas, incumpliendo
 * la conservación de campos. El dominio lo rechaza con `field-not-preserved`, lo
 * que fuerza el rollback fail-closed (requisito 22.9).
 */
const breakingMigrator: Migrator = {
  from: SOURCE_SAVE_VERSION,
  to: TARGET_SAVE_VERSION,
  apply: (input) => ({
    id: input.id,
    saveVersion: TARGET_SAVE_VERSION,
    games: [],
  }),
};

// --- Origen: creación de Partidas iniciales en la generación activa ---------

/**
 * Crea todas las Partidas de la réplica en la generación activa del adaptador y
 * devuelve la Instantánea inicial confirmada de cada una (Estado, ambos
 * registros y Estado aleatorio íntegros), indexada por `gameId`.
 */
async function seedActiveGames(
  adapter: IndexedDbStoreAdapter,
  games: readonly GameSeed[],
): Promise<ReadonlyMap<GameId, GameSnapshot>> {
  const repository = repositoryFor(adapter);
  const createGame = new CreateGame({
    repository,
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator("snap"),
  });
  const byId = new Map<GameId, GameSnapshot>();
  for (const game of games) {
    const id = makeGameId(`g-${game.suffix}`);
    const created = await createGame.execute(initialInput(id, game.seed));
    byId.set(id, created.snapshot);
  }
  return byId;
}

// --- Lectura del Almacenamiento ---------------------------------------------

/**
 * Foto de una Partida en una generación: resumen (con puntero
 * `latestSnapshotId`) e Instantánea enlazada. Devuelve ambos `undefined` cuando
 * la Partida no existe en esa generación.
 */
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

// --- Ramas de la propiedad --------------------------------------------------

/**
 * Rama CONSERVADORA (22.6/22.7/22.8): la migración confirma de forma atómica.
 * Comprueba que existe la copia recuperable (22.7), que el puntero de generación
 * activa apunta a la generación migrada (22.8) y que cada Instantánea migrada
 * conserva Estado, ambos registros y Estado aleatorio, cambiando solo la Versión
 * de guardado que el migrador transforma intencionadamente (22.6).
 */
async function assertConservativeSuccess(
  adapter: IndexedDbStoreAdapter,
  initial: ReadonlyMap<GameId, GameSnapshot>,
): Promise<void> {
  const migrate = new MigrateStorage({
    registry: createMigrationRegistry([conservativeMigrator]),
    adapter,
    compatibility: { ...compatibility, saveVersion: TARGET_SAVE_VERSION },
    backupIdGenerator: counterBackupIds(),
  });

  const outcome = await migrate.execute(SOURCE_SAVE_VERSION, TARGET_SAVE_VERSION);

  expect(outcome.ok).toBe(true);
  if (outcome.ok !== true) {
    throw new Error("se esperaba una migración conservadora satisfactoria");
  }
  expect(outcome.saveVersion).toBe(TARGET_SAVE_VERSION);

  // 22.7: la copia recuperable de la generación anterior está presente.
  const backup = await adapter.getMigrationBackup(outcome.backupId);
  expect(backup).toBeDefined();

  // 22.8: el puntero de generación activa refleja la generación migrada.
  const activeMeta = await adapter.getMeta<ActiveGenerationMeta>(
    ACTIVE_GENERATION_META_KEY,
  );
  expect(activeMeta?.activeGenerationId).toBe(migratedGeneration);

  // 22.6: cada Instantánea migrada conserva Estado, ambos registros y Estado
  // aleatorio; solo cambia la Versión de guardado que el migrador transforma.
  for (const [gameId, before] of initial) {
    const migrated = await readGame(adapter, migratedGeneration, gameId);
    const expected = gameSnapshot({
      ...before,
      state: gameState({ ...before.state, saveVersion: TARGET_SAVE_VERSION }),
    });
    expect(migrated.snapshot).toStrictEqual(expected);
    expect(migrated.snapshot?.simpleLog).toStrictEqual(before.simpleLog);
    expect(migrated.snapshot?.detailedLog).toStrictEqual(before.detailedLog);
    expect(migrated.snapshot?.randomState).toStrictEqual(before.randomState);
    expect(migrated.summary?.latestSnapshotId).toBe(before.id);
  }
}

/**
 * Rama ROMPEDORA (22.9): la migración falla-cerrado con `field-not-preserved`,
 * cancela todos los cambios y mantiene la versión anterior recuperable. El
 * puntero de generación activa sigue SIN escribirse (apunta a la anterior), la
 * copia recuperable está presente y cada Partida activa queda intacta respecto
 * de su Instantánea inicial.
 */
async function assertBreakingRollback(
  adapter: IndexedDbStoreAdapter,
  initial: ReadonlyMap<GameId, GameSnapshot>,
): Promise<void> {
  const migrate = new MigrateStorage({
    registry: createMigrationRegistry([breakingMigrator]),
    adapter,
    compatibility: { ...compatibility, saveVersion: TARGET_SAVE_VERSION },
    backupIdGenerator: counterBackupIds(),
  });

  const outcome = await migrate.execute(SOURCE_SAVE_VERSION, TARGET_SAVE_VERSION);

  expect(outcome).toMatchObject({ ok: false, reason: "field-not-preserved" });

  // 22.7/22.9: la copia recuperable se crea ANTES de tocar el Almacenamiento y
  // se conserva pese al fallo.
  const backup = await adapter.getMigrationBackup("backup-1");
  expect(backup).toBeDefined();

  // 22.9: el puntero de generación activa NO cambió; sigue apuntando a la
  // generación anterior (no hay metadato de cambio de generación).
  const activeMeta = await adapter.getMeta<ActiveGenerationMeta>(
    ACTIVE_GENERATION_META_KEY,
  );
  expect(activeMeta).toBeUndefined();

  // 22.9 (rollback): cada Partida activa permanece EXACTAMENTE como estaba, y la
  // generación migrada no consolidó ninguna Instantánea.
  for (const [gameId, before] of initial) {
    const active = await readGame(adapter, activeGeneration, gameId);
    expect(active.snapshot).toStrictEqual(before);
    expect(active.summary?.latestSnapshotId).toBe(before.id);

    const migrated = await readGame(adapter, migratedGeneration, gameId);
    expect(migrated.summary).toBeUndefined();
    expect(migrated.snapshot).toBeUndefined();
  }
}

// --- Propiedad --------------------------------------------------------------

describe("Property 19: Migración conservadora y recuperable", () => {
  it("conserva y confirma atómicamente, o cancela y mantiene recuperable la anterior", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Feature: fields-of-normandy-pwa, Property 19: Migración conservadora y recuperable
        const adapter = await openAdapter(new IDBFactory());
        try {
          const initial = await seedActiveGames(adapter, scenario.games);
          if (scenario.conserve) {
            await assertConservativeSuccess(adapter, initial);
            return;
          }
          await assertBreakingRollback(adapter, initial);
        } finally {
          adapter.close();
        }
      }),
      { numRuns: 100 },
    );
  });
});
