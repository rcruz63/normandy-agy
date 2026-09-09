import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  type GameId,
} from "../../src/domain/identity/index.js";
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import {
  IndexedDbStoreAdapter,
  type GenerationId,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  CreateGame,
  DEFAULT_GENERATION_ID,
  IndexedDbGameRepository,
  ResumeGame,
  RestartGame,
  RESTART_STAGING_GENERATION_ID,
  type Clock,
  type GameIdentity,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

// --- Fixtures de compatibilidad --------------------------------------------

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: "splitmix64-v1",
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: ["splitmix64-v1"],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;
const stagingGeneration: GenerationId = RESTART_STAGING_GENERATION_ID;

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
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
  };
}

function initialInput(id: GameId, seed = "seed-A"): InitialSnapshotInput {
  return { missionSetup: missionSetup(), identity: identityFor(id), seed };
}

// --- Infraestructura de prueba ---------------------------------------------

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

function repositoryFor(
  adapter: IndexedDbStoreAdapter,
  generationId: GenerationId,
): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId,
  });
}

// --- Creación ---------------------------------------------------------------

describe("CreateGame — Instantánea inicial única", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("confirma exactamente una Instantánea inicial que loadLatest devuelve idéntica", async () => {
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter, activeGeneration);
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-01T00:00:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const gameId = makeGameId("g-create");

    const created = await createGame.execute(initialInput(gameId));

    expect(created.snapshot.previousSnapshotId).toBeUndefined();
    expect(created.receipt.latestSnapshotId).toBe(created.snapshot.id);

    const latest = await repository.loadLatest(gameId);
    expect(latest.id).toBe(created.snapshot.id);
    expect(latest.state.turn).toBe(1);
    expect(latest.state.phase).toBe("british");
    expect(latest.state.duration.turns).toBe(4);
    expect(latest.randomState.position).toBe(0);
    expect(latest.randomState.seed).toBe("seed-A");
    expect(latest.simpleLog).toEqual([]);
    expect(latest.detailedLog).toEqual([]);
    // Solo hay una Partida en la generación activa.
    const summaries = await repository.list();
    expect(summaries.map((s) => s.gameId)).toEqual([gameId]);
  });

  it("un fallo de commit no deja datos parciales (cancelación atómica)", async () => {
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter, activeGeneration);
    const failing = {
      loadLatest: (id: GameId) => repository.loadLatest(id),
      commit: () => Promise.reject(new Error("commit-abortado")),
      list: () => repository.list(),
      isolateCorrupt: (id: GameId, reason: never) =>
        repository.isolateCorrupt(id, reason),
    };
    const createGame = new CreateGame({
      repository: failing,
      clock: fixedClock("2024-06-01T00:00:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const gameId = makeGameId("g-fail");

    await expect(createGame.execute(initialInput(gameId))).rejects.toThrow(
      "commit-abortado",
    );
    const summaries = await repository.list();
    expect(summaries).toEqual([]);
  });
});

// --- Reanudación ------------------------------------------------------------

describe("ResumeGame — restaura todo sin perder posición aleatoria", () => {
  it("devuelve la última Instantánea confirmada íntegra y su resumen", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter, activeGeneration);
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-01T09:30:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const gameId = makeGameId("g-resume");
    const created = await createGame.execute(initialInput(gameId, "seed-R"));

    const resumeGame = new ResumeGame({ repository });
    const resumed = await resumeGame.execute(gameId);

    expect(resumed.snapshot.id).toBe(created.snapshot.id);
    expect(resumed.snapshot.randomState.seed).toBe("seed-R");
    expect(resumed.snapshot.randomState.position).toBe(0);
    expect(resumed.summary.missionId).toBe(makeMissionId("FON-ML-2022-M01"));
    expect(resumed.summary.confirmedAt).toBe("2024-06-01T09:30:00.000Z");
    expect(resumed.summary.latestSnapshotId).toBe(created.snapshot.id);
  });
});

// --- Reinicio ---------------------------------------------------------------

describe("RestartGame — staging + confirmación cancelable", () => {
  async function seedTwoGames(
    repository: IndexedDbGameRepository,
  ): Promise<{ target: GameId; other: GameId; targetSnapshotId: string }> {
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-01T00:00:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const target = makeGameId("g-target");
    const other = makeGameId("g-other");
    const targetCreated = await createGame.execute(initialInput(target, "seed-T"));
    await createGame.execute(initialInput(other, "seed-O"));
    return { target, other, targetSnapshotId: targetCreated.snapshot.id };
  }

  it("confirmar reemplaza solo la Partida objetivo y conserva las demás", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const activeRepository = repositoryFor(adapter, activeGeneration);
    const stagingRepository = repositoryFor(adapter, stagingGeneration);
    const seeded = await seedTwoGames(activeRepository);

    const otherBefore = await activeRepository.loadLatest(seeded.other);

    const restartGame = new RestartGame({
      activeRepository,
      stagingRepository,
      clock: fixedClock("2024-06-02T00:00:00.000Z"),
      idGenerator: counterIdGenerator("restart"),
    });
    const confirmation = await restartGame.execute(
      initialInput(seeded.target, "seed-NEW"),
    );

    // Antes de confirmar, la Partida objetivo sigue en su Instantánea original.
    expect(confirmation.previousSnapshotId).toBe(seeded.targetSnapshotId);
    const targetStillOriginal = await activeRepository.loadLatest(seeded.target);
    expect(targetStillOriginal.id).toBe(seeded.targetSnapshotId);

    const receipt = await confirmation.confirm();
    expect(receipt.latestSnapshotId).toBe(confirmation.preparedSnapshot.id);

    // La Partida objetivo quedó reemplazada por la preparación nueva.
    const targetAfter = await activeRepository.loadLatest(seeded.target);
    expect(targetAfter.id).toBe(confirmation.preparedSnapshot.id);
    expect(targetAfter.randomState.seed).toBe("seed-NEW");
    // La otra Partida permanece intacta.
    const otherAfter = await activeRepository.loadLatest(seeded.other);
    expect(otherAfter.id).toBe(otherBefore.id);
    expect(otherAfter.randomState.seed).toBe("seed-O");
  });

  it("cancelar conserva la Partida objetivo y las demás sin modificación", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const activeRepository = repositoryFor(adapter, activeGeneration);
    const stagingRepository = repositoryFor(adapter, stagingGeneration);
    const seeded = await seedTwoGames(activeRepository);

    const restartGame = new RestartGame({
      activeRepository,
      stagingRepository,
      clock: fixedClock("2024-06-02T00:00:00.000Z"),
      idGenerator: counterIdGenerator("restart"),
    });
    const confirmation = await restartGame.execute(
      initialInput(seeded.target, "seed-NEW"),
    );

    confirmation.cancel();
    expect(confirmation.isPending).toBe(false);

    // La Partida objetivo conserva su Instantánea original tras cancelar.
    const targetAfter = await activeRepository.loadLatest(seeded.target);
    expect(targetAfter.id).toBe(seeded.targetSnapshotId);
    expect(targetAfter.randomState.seed).toBe("seed-T");
    // La otra Partida permanece intacta.
    const otherAfter = await activeRepository.loadLatest(seeded.other);
    expect(otherAfter.randomState.seed).toBe("seed-O");
  });

  it("un fallo de promoción conserva la última Instantánea válida de la Partida", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const activeRepository = repositoryFor(adapter, activeGeneration);
    const stagingRepository = repositoryFor(adapter, stagingGeneration);
    const seeded = await seedTwoGames(activeRepository);

    // Repositorio activo que carga con normalidad pero falla al promover.
    const failingActive = {
      loadLatest: (id: GameId) => activeRepository.loadLatest(id),
      commit: () => Promise.reject(new Error("promocion-abortada")),
      list: () => activeRepository.list(),
      isolateCorrupt: (id: GameId, reason: never) =>
        activeRepository.isolateCorrupt(id, reason),
    };
    const restartGame = new RestartGame({
      activeRepository: failingActive,
      stagingRepository,
      clock: fixedClock("2024-06-02T00:00:00.000Z"),
      idGenerator: counterIdGenerator("restart"),
    });
    const confirmation = await restartGame.execute(
      initialInput(seeded.target, "seed-NEW"),
    );

    await expect(confirmation.confirm()).rejects.toThrow("promocion-abortada");
    // La Partida objetivo conserva su Instantánea original (nada a medias).
    const targetAfter = await activeRepository.loadLatest(seeded.target);
    expect(targetAfter.id).toBe(seeded.targetSnapshotId);
  });

  it("confirmar o cancelar dos veces falla-rápido", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const activeRepository = repositoryFor(adapter, activeGeneration);
    const stagingRepository = repositoryFor(adapter, stagingGeneration);
    const seeded = await seedTwoGames(activeRepository);

    const restartGame = new RestartGame({
      activeRepository,
      stagingRepository,
      clock: fixedClock("2024-06-02T00:00:00.000Z"),
      idGenerator: counterIdGenerator("restart"),
    });
    const confirmation = await restartGame.execute(
      initialInput(seeded.target, "seed-NEW"),
    );

    await confirmation.confirm();
    await expect(confirmation.confirm()).rejects.toThrow(/ya estaba/);
    expect(() => confirmation.cancel()).toThrow(/ya estaba/);
  });
});
