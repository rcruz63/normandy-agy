import { describe, expect, it } from "vitest";
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
  OBJECT_STORES,
  openDatabase,
  requestToPromise,
  runTransaction,
  type GenerationId,
  type QuarantineRecord,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  CorruptionRecoveryService,
  CreateGame,
  DEFAULT_GENERATION_ID,
  IndexedDbGameRepository,
  PendingDiagnosticRegistry,
  CORRUPT_SNAPSHOT_MESSAGE_KEY,
  QUARANTINE_WRITE_FAILURE_MESSAGE_KEY,
  type Clock,
  type GameIdentity,
  type IdGenerator,
  type InitialSnapshotInput,
  type QuarantineArchive,
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

function repositoryFor(adapter: IndexedDbStoreAdapter): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId: activeGeneration,
  });
}

/**
 * Corrompe la Instantánea de una Partida alterando el `payload` del sobre
 * almacenado sin recalcular su integridad, de modo que `openEnvelope` falle por
 * `integrity-mismatch` en la siguiente lectura. Accede al store directamente,
 * como haría una corrupción externa; no borra bytes.
 */
async function corruptSnapshot(
  factory: IDBFactory,
  gameId: GameId,
  snapshotId: string,
): Promise<void> {
  const database = await openDatabase(factory);
  await runTransaction(
    database,
    [OBJECT_STORES.snapshots],
    "readwrite",
    async (transaction) => {
      const store = transaction.objectStore(OBJECT_STORES.snapshots);
      const key = [activeGeneration, gameId, snapshotId];
      const raw = (await requestToPromise(store.get(key))) as {
        envelope: { payload: { state: { turn: number } } };
      };
      raw.envelope.payload.state = {
        ...raw.envelope.payload.state,
        turn: raw.envelope.payload.state.turn + 999,
      };
      await requestToPromise(store.put(raw));
    },
  );
  database.close();
}

// --- Pruebas ----------------------------------------------------------------

describe("CorruptionRecoveryService — aislamiento de sobre corrupto (21.6)", () => {
  it("aísla la Partida corrupta, la excluye de la reanudación y conserva las demás", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-01T00:00:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const corrupt = makeGameId("g-corrupt");
    const healthy = makeGameId("g-healthy");
    const corruptCreated = await createGame.execute(initialInput(corrupt, "seed-C"));
    await createGame.execute(initialInput(healthy, "seed-H"));

    await corruptSnapshot(factory, corrupt, corruptCreated.snapshot.id);

    const service = new CorruptionRecoveryService({
      repository,
      archive: adapter,
      idGenerator: counterIdGenerator("detected"),
      pendingDiagnostics: new PendingDiagnosticRegistry(),
    });

    const result = await service.resume(corrupt);
    expect(result.kind).toBe("quarantined");
    if (result.kind !== "quarantined") {
      throw new Error("se esperaba cuarentena");
    }
    expect(result.isolated).toBe(true);
    expect(result.reasonKey).toBe(CORRUPT_SNAPSHOT_MESSAGE_KEY);

    // Los bytes originales se conservan y son recuperables por su clave.
    const archived = await adapter.getQuarantined(corrupt, result.detectedAtId);
    expect(archived).toBeDefined();
    const record = archived as QuarantineRecord;
    expect(record.gameId).toBe(corrupt);

    // La Partida corrupta queda excluida de la reanudación; la sana permanece.
    const resumable = await service.listResumable();
    expect(resumable.map((s) => s.gameId)).toEqual([healthy]);

    // La Partida sana sigue reanudable e intacta.
    const healthyResult = await service.resume(healthy);
    expect(healthyResult.kind).toBe("restored");
    if (healthyResult.kind !== "restored") {
      throw new Error("se esperaba restaurada");
    }
    expect(healthyResult.snapshot.randomState.seed).toBe("seed-H");
  });
});

describe("CorruptionRecoveryService — aviso de Instantánea restaurada (21.7/21.8)", () => {
  it("devuelve la fecha y el id de la Instantánea confirmada al reanudar", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-02T08:15:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const gameId = makeGameId("g-restore");
    const created = await createGame.execute(initialInput(gameId, "seed-R"));

    const service = new CorruptionRecoveryService({
      repository,
      archive: adapter,
      idGenerator: counterIdGenerator("detected"),
      pendingDiagnostics: new PendingDiagnosticRegistry(),
    });

    const result = await service.resume(gameId);
    expect(result.kind).toBe("restored");
    if (result.kind !== "restored") {
      throw new Error("se esperaba restaurada");
    }
    expect(result.notice.snapshotId).toBe(created.snapshot.id);
    expect(result.notice.confirmedAt).toBe("2024-06-02T08:15:00.000Z");
  });
});

describe("CorruptionRecoveryService — PendingDiagnostic en memoria (19.9/19.10)", () => {
  it("conserva el diagnóstico cuando la escritura de cuarentena falla", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = new CreateGame({
      repository,
      clock: fixedClock("2024-06-03T00:00:00.000Z"),
      idGenerator: counterIdGenerator("snap"),
    });
    const gameId = makeGameId("g-nowrite");
    const created = await createGame.execute(initialInput(gameId, "seed-N"));
    await corruptSnapshot(factory, gameId, created.snapshot.id);

    // Almacén que rechaza toda escritura de cuarentena (IndexedDB no acepta escritura).
    const rejectingArchive: QuarantineArchive = {
      isolateCorrupt: () => Promise.reject(new Error("cuota-agotada")),
      getQuarantined: (id, detectedAtId) => adapter.getQuarantined(id, detectedAtId),
    };
    const pendingDiagnostics = new PendingDiagnosticRegistry();
    const service = new CorruptionRecoveryService({
      repository,
      archive: rejectingArchive,
      idGenerator: counterIdGenerator("detected"),
      pendingDiagnostics,
    });

    const result = await service.resume(gameId);
    expect(result.kind).toBe("quarantined");
    if (result.kind !== "quarantined") {
      throw new Error("se esperaba cuarentena");
    }
    expect(result.isolated).toBe(false);

    // El diagnóstico no se pierde ni se silencia: queda consultable en memoria.
    expect(pendingDiagnostics.hasPending).toBe(true);
    const pending = pendingDiagnostics.list();
    expect(pending).toHaveLength(1);
    const entry = pending[0];
    if (entry === undefined) {
      throw new Error("se esperaba un diagnóstico pendiente");
    }
    expect(entry.gameId).toBe(gameId);
    expect(entry.diagnostic.category).toBe("persistence-failure");
    expect(entry.diagnostic.message.messageKey).toBe(
      QUARANTINE_WRITE_FAILURE_MESSAGE_KEY,
    );

    // Aun sin persistir, la Partida queda excluida de la reanudación.
    const resumable = await service.listResumable();
    expect(resumable).toEqual([]);
  });
});
