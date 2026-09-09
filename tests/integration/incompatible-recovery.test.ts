import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
  type GameId,
  type RulesVersion,
  type SaveVersion,
} from "../../src/domain/identity/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import {
  canonicalize,
  computeIntegrity,
  type BackupPackage,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
  type EnvelopeIncompatibilityReason,
  type GameAggregate,
} from "../../src/domain/persistence/index.js";
import { createBackupCodec } from "../../src/domain/persistence/backup-codec.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import {
  IndexedDbStoreAdapter,
  OBJECT_STORES,
  openDatabase,
  requestToPromise,
  runTransaction,
  type GenerationId,
  type SnapshotRecord,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  CorruptionRecoveryService,
  CreateGame,
  DEFAULT_GENERATION_ID,
  IMPORT_STAGING_GENERATION_ID,
  ImportBackup,
  ImportPreview,
  IndexedDbGameRepository,
  PendingDiagnosticRegistry,
  PREVIOUS_BACKUP_REQUIRED_MESSAGE_KEY,
  RecoveryExporter,
  previousBackupRequiredDiagnostic,
  toGameRecordPayload,
  type Clock,
  type GameIdentity,
  type IdGenerator,
  type InitialSnapshotInput,
  type QuarantineArchive,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: ALGORITHM_SPLITMIX64_V1,
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: [ALGORITHM_SPLITMIX64_V1],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;
const unsupportedEnvelopeVersion = 99;

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
    rulesVersion: compatibility.rulesVersion,
    saveVersion: compatibility.saveVersion,
    difficulty: { id: "normal" },
  };
}

function initialInput(id: GameId, seed: string): InitialSnapshotInput {
  return { missionSetup: missionSetup(), identity: identityFor(id), seed };
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

async function openAdapter(factory: IDBFactory): Promise<IndexedDbStoreAdapter> {
  const adapter = new IndexedDbStoreAdapter(factory, policy);
  await adapter.open();
  return adapter;
}

function repositoryFor(adapter: IndexedDbStoreAdapter): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId: activeGeneration,
  });
}

async function createGame(
  adapter: IndexedDbStoreAdapter,
  id: GameId,
  seed: string,
): Promise<GameSnapshot> {
  const result = await new CreateGame({
    repository: repositoryFor(adapter),
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator(`snap-${id}`),
  }).execute(initialInput(id, seed));
  return result.snapshot;
}

function recoveryService(
  repository: IndexedDbGameRepository,
  archive: QuarantineArchive,
  pendingDiagnostics = new PendingDiagnosticRegistry(),
): CorruptionRecoveryService {
  return new CorruptionRecoveryService({
    repository,
    archive,
    idGenerator: counterIdGenerator("diagnostic"),
    pendingDiagnostics,
  });
}

type DeclaredVersions = Readonly<{
  envelopeVersion: number;
  saveVersion: SaveVersion;
  rulesVersion: RulesVersion;
  algorithmVersion: string;
}>;

function supportedDeclaredVersions(): DeclaredVersions {
  return {
    envelopeVersion: 1,
    saveVersion: compatibility.saveVersion,
    rulesVersion: compatibility.rulesVersion,
    algorithmVersion: compatibility.algorithmVersion,
  };
}

type MalformedAggregateCase = Readonly<{
  label: string;
  build: (aggregate: GameAggregate) => unknown;
}>;

const malformedAggregateCases: readonly MalformedAggregateCase[] = [
  {
    label: "snapshot",
    build: (aggregate) => ({
      gameId: aggregate.gameId,
      saveVersion: aggregate.saveVersion,
    }),
  },
  {
    label: "state",
    build: (aggregate) => ({
      gameId: aggregate.gameId,
      saveVersion: aggregate.saveVersion,
      snapshot: {
        id: aggregate.snapshot.id,
        gameId: aggregate.snapshot.gameId,
        confirmedAt: aggregate.snapshot.confirmedAt,
        randomState: aggregate.snapshot.randomState,
        simpleLog: aggregate.snapshot.simpleLog,
        detailedLog: aggregate.snapshot.detailedLog,
        integrity: aggregate.snapshot.integrity,
      },
    }),
  },
  {
    label: "randomState",
    build: (aggregate) => ({
      gameId: aggregate.gameId,
      saveVersion: aggregate.saveVersion,
      snapshot: {
        id: aggregate.snapshot.id,
        gameId: aggregate.snapshot.gameId,
        confirmedAt: aggregate.snapshot.confirmedAt,
        state: aggregate.snapshot.state,
        simpleLog: aggregate.snapshot.simpleLog,
        detailedLog: aggregate.snapshot.detailedLog,
        integrity: aggregate.snapshot.integrity,
      },
    }),
  },
];

function encodeMalformedBackup(
  pkg: BackupPackage,
  games: readonly unknown[],
): Uint8Array {
  const body = {
    format: pkg.format,
    canonicalizationVersion: pkg.canonicalizationVersion,
    integrityAlgorithm: pkg.integrityAlgorithm,
    saveVersion: pkg.saveVersion,
    exportedGameIds: pkg.exportedGameIds,
    games,
  };
  const document = { ...body, integrity: computeIntegrity(body) };
  return new TextEncoder().encode(canonicalize(document));
}

async function installLatestSnapshot(
  factory: IDBFactory,
  adapter: IndexedDbStoreAdapter,
  initial: GameSnapshot,
  versions: DeclaredVersions,
): Promise<GameSnapshot> {
  const nextState = {
    ...initial.state,
    saveVersion: versions.saveVersion,
    rulesVersion: versions.rulesVersion,
  };
  const nextRandomState = {
    ...initial.randomState,
    algorithmVersion: versions.algorithmVersion,
  };
  const next: GameSnapshot = {
    ...initial,
    id: makeSnapshotId(`incompatible-${initial.gameId}`),
    previousSnapshotId: initial.id,
    confirmedAt: "2024-06-02T00:00:00.000Z",
    state: nextState,
    randomState: nextRandomState,
    integrity: computeIntegrity({ state: nextState, randomState: nextRandomState }),
  };
  const declaredCompatibility: EnvelopeCompatibility = {
    saveVersion: versions.saveVersion,
    rulesVersion: versions.rulesVersion,
    algorithmVersion: versions.algorithmVersion,
  };
  await adapter.putSnapshot(
    {
      generationId: activeGeneration,
      gameId: initial.gameId,
      snapshotId: next.id,
    },
    { compatibility: declaredCompatibility, gameId: initial.gameId, payload: next },
  );
  await adapter.putGame(
    { generationId: activeGeneration, gameId: initial.gameId },
    {
      compatibility,
      gameId: initial.gameId,
      payload: toGameRecordPayload(next),
    },
  );
  if (versions.envelopeVersion !== 1) {
    await replaceEnvelopeVersion(factory, next, versions.envelopeVersion);
  }
  return next;
}

type StoredSnapshotEnvelope = SnapshotRecord<GameSnapshot>["envelope"];

async function rewriteSnapshotEnvelope(
  factory: IDBFactory,
  snapshot: GameSnapshot,
  transform: (envelope: StoredSnapshotEnvelope) => unknown,
): Promise<void> {
  const database = await openDatabase(factory);
  try {
    await runTransaction(
      database,
      [OBJECT_STORES.snapshots],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(OBJECT_STORES.snapshots);
        const key = [activeGeneration, snapshot.gameId, snapshot.id];
        const record = (await requestToPromise(store.get(key))) as
          | SnapshotRecord<GameSnapshot>
          | undefined;
        if (record === undefined) {
          throw new Error("No existe la Instantánea cuyo sobre debe modificarse.");
        }
        await requestToPromise(
          store.put({
            ...record,
            envelope: transform(record.envelope),
          }),
        );
      },
    );
  } finally {
    database.close();
  }
}

async function replaceEnvelopeVersion(
  factory: IDBFactory,
  snapshot: GameSnapshot,
  envelopeVersion: number,
): Promise<void> {
  await rewriteSnapshotEnvelope(factory, snapshot, (envelope) => ({
    ...envelope,
    envelopeVersion,
  }));
}

async function assertResumeBlocked(
  reason: EnvelopeIncompatibilityReason,
  versions: DeclaredVersions,
): Promise<void> {
  const factory = new IDBFactory();
  const adapter = await openAdapter(factory);
  const repository = repositoryFor(adapter);
  const affectedId = makeGameId(`g-${reason}`);
  const healthyId = makeGameId(`g-healthy-${reason}`);
  const compatible = await createGame(adapter, affectedId, "seed-compatible");
  await createGame(adapter, healthyId, "seed-healthy");
  const incompatible = await installLatestSnapshot(
    factory,
    adapter,
    compatible,
    versions,
  );
  const service = recoveryService(repository, adapter);

  const result = await service.resume(affectedId);

  expect(result.kind).toBe("incompatible");
  if (result.kind !== "incompatible") {
    throw new Error("se esperaba un bloqueo por incompatibilidad");
  }
  expect(result.diagnostic.reason).toBe(reason);
  expect(result.diagnostic.snapshotId).toBe(incompatible.id);
  expect(result.recoveryExport.artifact?.snapshotId).toBe(incompatible.id);
  expect(result.recoveryExport.artifact?.envelope.payload).toStrictEqual(
    incompatible,
  );
  expect(service.quarantine.isQuarantined(affectedId)).toBe(false);

  const preserved = await adapter.getSnapshot<GameSnapshot>({
    generationId: activeGeneration,
    gameId: affectedId,
    snapshotId: compatible.id,
  });
  expect(preserved).toStrictEqual(compatible);
  const healthy = await service.resume(healthyId);
  expect(healthy.kind).toBe("restored");
  adapter.close();
}

async function assertResumeQuarantined(
  expectedReason: "malformed-envelope" | "integrity-mismatch",
  versions: DeclaredVersions,
  transform: (envelope: StoredSnapshotEnvelope) => unknown,
): Promise<void> {
  const factory = new IDBFactory();
  const adapter = await openAdapter(factory);
  try {
    const repository = repositoryFor(adapter);
    const affectedId = makeGameId(`g-corrupt-${expectedReason}`);
    const healthyId = makeGameId(`g-healthy-${expectedReason}`);
    const compatible = await createGame(adapter, affectedId, "seed-compatible");
    await createGame(adapter, healthyId, "seed-healthy");
    const latest = await installLatestSnapshot(
      factory,
      adapter,
      compatible,
      versions,
    );
    await rewriteSnapshotEnvelope(factory, latest, transform);
    const service = recoveryService(repository, adapter);

    const result = await service.resume(affectedId);

    expect(result.kind).toBe("quarantined");
    if (result.kind !== "quarantined") {
      throw new Error("se esperaba cuarentena por corrupción del sobre");
    }
    expect(service.quarantine.isQuarantined(affectedId)).toBe(true);
    const isolated = await adapter.getQuarantined(
      affectedId,
      result.detectedAtId,
    );
    expect(isolated).toMatchObject({
      isolatedPayload: { reason: expectedReason },
    });
    expect(
      await adapter.getSnapshot<GameSnapshot>({
        generationId: activeGeneration,
        gameId: affectedId,
        snapshotId: compatible.id,
      }),
    ).toStrictEqual(compatible);
    expect((await service.resume(healthyId)).kind).toBe("restored");
  } finally {
    adapter.close();
  }
}

async function corruptSnapshot(
  factory: IDBFactory,
  snapshot: GameSnapshot,
): Promise<void> {
  const database = await openDatabase(factory);
  try {
    await runTransaction(
      database,
      [OBJECT_STORES.snapshots],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(OBJECT_STORES.snapshots);
        const key = [activeGeneration, snapshot.gameId, snapshot.id];
        const record = (await requestToPromise(store.get(key))) as
          | SnapshotRecord<GameSnapshot>
          | undefined;
        if (record === undefined) {
          throw new Error("No existe la Instantánea que debe corromperse.");
        }
        const corrupted = {
          ...record.envelope.payload,
          confirmedAt: "contenido-alterado-sin-recalcular-suma",
        };
        await requestToPromise(
          store.put({
            ...record,
            envelope: { ...record.envelope, payload: corrupted },
          }),
        );
      },
    );
  } finally {
    database.close();
  }
}

async function deleteSnapshot(
  factory: IDBFactory,
  snapshot: GameSnapshot,
): Promise<void> {
  const database = await openDatabase(factory);
  try {
    await runTransaction(
      database,
      [OBJECT_STORES.snapshots],
      "readwrite",
      async (transaction) => {
        const key = [activeGeneration, snapshot.gameId, snapshot.id];
        await requestToPromise(
          transaction.objectStore(OBJECT_STORES.snapshots).delete(key),
        );
      },
    );
  } finally {
    database.close();
  }
}

describe("Reanudación fail-closed de versiones incompatibles", () => {
  it("bloquea saveVersion no soportada sin sustituir la compatible", async () => {
    await assertResumeBlocked("unsupported-save-version", {
      ...supportedDeclaredVersions(),
      saveVersion: saveVersion("sv-unsupported"),
    });
  });

  it("bloquea rulesVersion no soportada sin sustituir la compatible", async () => {
    await assertResumeBlocked("unsupported-rules-version", {
      ...supportedDeclaredVersions(),
      rulesVersion: rulesVersion("rv-unsupported"),
    });
  });

  it("bloquea algorithmVersion no soportada y exporta la Instantánea afectada", async () => {
    await assertResumeBlocked("unsupported-algorithm-version", {
      ...supportedDeclaredVersions(),
      algorithmVersion: "random-unsupported",
    });
  });

  it("bloquea envelopeVersion no soportada sin enviarla a cuarentena", async () => {
    await assertResumeBlocked("unsupported-envelope-version", {
      ...supportedDeclaredVersions(),
      envelopeVersion: unsupportedEnvelopeVersion,
    });
  });
});

describe("Clasificación de corrupción antes de compatibilidad", () => {
  it("envía compatibility incompleta a cuarentena como sobre malformado", async () => {
    await assertResumeQuarantined(
      "malformed-envelope",
      supportedDeclaredVersions(),
      (envelope) => ({ ...envelope, compatibility: {} }),
    );
  });

  it.each([
    {
      label: "saveVersion",
      versions: {
        ...supportedDeclaredVersions(),
        saveVersion: saveVersion("sv-corrupt-unsupported"),
      },
    },
    {
      label: "rulesVersion",
      versions: {
        ...supportedDeclaredVersions(),
        rulesVersion: rulesVersion("rv-corrupt-unsupported"),
      },
    },
    {
      label: "algorithmVersion",
      versions: {
        ...supportedDeclaredVersions(),
        algorithmVersion: "random-corrupt-unsupported",
      },
    },
  ])(
    "envía payload alterado con $label no soportada a cuarentena por integridad",
    async ({ versions }) => {
      await assertResumeQuarantined(
        "integrity-mismatch",
        versions,
        (envelope) => ({
          ...envelope,
          payload: {
            ...envelope.payload,
            confirmedAt: "contenido-alterado-sin-recalcular-suma",
          },
        }),
      );
    },
  );
});

describe("Importación incompatible antes de staging", () => {
  it("no escribe staging y conserva íntegra una Partida compatible preexistente", async () => {
    const origin = await openAdapter(new IDBFactory());
    const destination = await openAdapter(new IDBFactory());
    const existingId = makeGameId("g-existing-compatible");
    const importedId = makeGameId("g-import-unsupported");
    const existing = await createGame(destination, existingId, "seed-existing");
    const source = await createGame(origin, importedId, "seed-imported");
    const unsupportedSaveVersion = saveVersion("sv-import-unsupported");
    const incompatibleSnapshot: GameSnapshot = {
      ...source,
      state: { ...source.state, saveVersion: unsupportedSaveVersion },
    };
    const aggregate: GameAggregate = {
      gameId: importedId,
      saveVersion: unsupportedSaveVersion,
      snapshot: incompatibleSnapshot,
    };
    const codec = createBackupCodec();
    const pkg = await codec.encode([aggregate]);
    const importer = new ImportBackup({
      codec,
      adapter: destination,
      compatibility,
      compatibilityPolicy: policy,
    });

    const outcome = await importer.execute(pkg.bytes);

    expect(outcome).not.toBeInstanceOf(ImportPreview);
    if (outcome instanceof ImportPreview || !("category" in outcome)) {
      throw new Error("se esperaba un rechazo de compatibilidad");
    }
    expect(outcome.category).toBe("incompatible-version");
    expect(outcome.reason).toBe("unsupported-save-version");
    const staged = await destination.getGame({
      generationId: IMPORT_STAGING_GENERATION_ID,
      gameId: importedId,
    });
    expect(staged).toBeUndefined();
    expect(await repositoryFor(destination).loadLatest(existingId)).toStrictEqual(
      existing,
    );
    expect(
      await destination.getMeta(ACTIVE_GENERATION_META_KEY),
    ).toBeUndefined();
    origin.close();
    destination.close();
  });

  it.each(malformedAggregateCases)(
    "rechaza agregado sin $label con suma válida antes de cualquier escritura",
    async ({ build }) => {
      const origin = await openAdapter(new IDBFactory());
      const destination = await openAdapter(new IDBFactory());
      try {
        const existingId = makeGameId("g-existing-before-malformed-import");
        const importedId = makeGameId("g-malformed-import");
        const existing = await createGame(
          destination,
          existingId,
          "seed-existing-malformed",
        );
        const source = await createGame(
          origin,
          importedId,
          "seed-source-malformed",
        );
        const aggregate: GameAggregate = {
          gameId: importedId,
          saveVersion: source.state.saveVersion,
          snapshot: source,
        };
        const codec = createBackupCodec();
        const pkg = await codec.encode([aggregate]);
        const bytes = encodeMalformedBackup(pkg, [build(aggregate)]);
        const putSnapshot = vi.spyOn(destination, "putSnapshot");
        const putGame = vi.spyOn(destination, "putGame");
        const commitImport = vi.spyOn(destination, "commitImport");
        const importer = new ImportBackup({
          codec,
          adapter: destination,
          compatibility,
          compatibilityPolicy: policy,
        });

        const outcome = await importer.execute(bytes);

        expect(outcome).not.toBeInstanceOf(ImportPreview);
        expect(outcome).toMatchObject({
          ok: false,
          reason: "malformed-package",
        });
        expect(putSnapshot).not.toHaveBeenCalled();
        expect(putGame).not.toHaveBeenCalled();
        expect(commitImport).not.toHaveBeenCalled();
        expect(
          await destination.getGame({
            generationId: IMPORT_STAGING_GENERATION_ID,
            gameId: importedId,
          }),
        ).toBeUndefined();
        expect(
          await repositoryFor(destination).loadLatest(existingId),
        ).toStrictEqual(existing);
        expect(
          await destination.getMeta(ACTIVE_GENERATION_META_KEY),
        ).toBeUndefined();
      } finally {
        vi.restoreAllMocks();
        origin.close();
        destination.close();
      }
    },
  );
});

describe("Diagnóstico pendiente y clasificación de recuperación", () => {
  it("mantiene un único pendiente exportable si la cuarentena no puede escribirse", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const id = makeGameId("g-write-failure");
    const snapshot = await createGame(adapter, id, "seed-write-failure");
    await corruptSnapshot(factory, snapshot);
    const rejectingArchive: QuarantineArchive = {
      isolateCorrupt: () => Promise.reject(new Error("escritura rechazada")),
      getQuarantined: (gameId, detectedAtId) =>
        adapter.getQuarantined(gameId, detectedAtId),
    };
    const pendingDiagnostics = new PendingDiagnosticRegistry();
    const service = recoveryService(
      repository,
      rejectingArchive,
      pendingDiagnostics,
    );

    const first = await service.resume(id);
    const repeated = await service.resume(id);

    expect(first.kind).toBe("quarantined");
    expect(repeated.kind).toBe("quarantined");
    expect(first.kind).not.toBe("incompatible");
    expect(pendingDiagnostics.size).toBe(1);
    const exporter = new RecoveryExporter({ pendingDiagnostics });
    const pkg = exporter.export({
      diagnostic: previousBackupRequiredDiagnostic("diag-export", id),
    });
    expect(pkg.pendingDiagnostics).toHaveLength(1);
    expect(pkg.pendingDiagnostics[0]?.lastConfirmedSnapshotId).toBe(snapshot.id);
    adapter.close();
  });

  it("proyecta copia previa requerida tras eliminación sin afectar otra Partida", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const missingId = makeGameId("g-storage-removed");
    const healthyId = makeGameId("g-storage-kept");
    const missing = await createGame(adapter, missingId, "seed-missing");
    await createGame(adapter, healthyId, "seed-kept");
    await deleteSnapshot(factory, missing);
    const service = recoveryService(repository, adapter);

    const result = await service.resume(missingId);

    expect(result.kind).toBe("backup-required");
    if (result.kind !== "backup-required") {
      throw new Error("se esperaba el requisito de copia previa");
    }
    expect(result.diagnostic.message.messageKey).toBe(
      PREVIOUS_BACKUP_REQUIRED_MESSAGE_KEY,
    );
    expect(result.diagnostic.message.params?.["recovery"]).toBe(
      "previously-exported-backup",
    );
    expect(service.quarantine.isQuarantined(missingId)).toBe(false);
    expect((await service.resume(healthyId)).kind).toBe("restored");
    adapter.close();
  });
});
