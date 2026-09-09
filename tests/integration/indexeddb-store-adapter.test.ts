import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId,
  rulesVersion,
  saveVersion,
  snapshotId,
  type GameId,
} from "../../src/domain/identity/index.js";
import {
  EnvelopeValidationError,
  sealEnvelope,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";
import {
  ALL_OBJECT_STORES,
  IndexedDbStoreAdapter,
  OBJECT_STORES,
  openDatabase,
  type EnvelopeWrite,
  type QuarantineRecord,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";

// --- Fixtures reutilizables ---
const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: "rav-1",
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: ["rav-1"],
};

type SnapshotPayload = Readonly<{ turn: number; note: string }>;

function makeAdapter(factory: IDBFactory, override?: Partial<CompatibilityPolicy>): IndexedDbStoreAdapter {
  return new IndexedDbStoreAdapter(factory, { ...policy, ...override });
}

function snapshotWrite(id: GameId, payload: SnapshotPayload): EnvelopeWrite<SnapshotPayload> {
  return { compatibility, gameId: id, payload };
}

describe("IndexedDbStoreAdapter — esquema y round-trip", () => {
  let factory: IDBFactory;
  let adapter: IndexedDbStoreAdapter;

  beforeEach(async () => {
    factory = new IDBFactory();
    adapter = makeAdapter(factory);
    await adapter.open();
  });

  afterEach(() => {
    adapter.close();
  });

  it("crea los seis object stores versionados con sus claves", async () => {
    const database = await openDatabase(factory);
    for (const storeName of ALL_OBJECT_STORES) {
      expect(database.objectStoreNames.contains(storeName)).toBe(true);
    }
    expect(database.objectStoreNames.length).toBe(ALL_OBJECT_STORES.length);
    database.close();
  });

  it("hace round-trip de un sobre de Instantánea preservando el payload", async () => {
    const key: SnapshotKey = {
      generationId: "gen-1",
      gameId: gameId("g-1"),
      snapshotId: snapshotId("s-1"),
    };
    const payload: SnapshotPayload = { turn: 3, note: "revelado" };
    await adapter.putSnapshot(key, snapshotWrite(key.gameId, payload));

    const readBack = await adapter.getSnapshot<SnapshotPayload>(key);
    expect(readBack).toEqual(payload);
  });

  it("hace round-trip de resúmenes, metadatos y ajustes por clave", async () => {
    const gameKey = { generationId: "gen-1", gameId: gameId("g-9") };
    await adapter.putGame(gameKey, {
      compatibility,
      gameId: gameKey.gameId,
      payload: { latestSnapshotId: "s-42" },
    });
    await adapter.putMeta("active-generation", { compatibility, payload: { generationId: "gen-1" } });
    await adapter.putSetting("locale", { compatibility, payload: { value: "es-ES" } });

    expect(await adapter.getGame(gameKey)).toEqual({ latestSnapshotId: "s-42" });
    expect(await adapter.getMeta("active-generation")).toEqual({ generationId: "gen-1" });
    expect(await adapter.getSetting("locale")).toEqual({ value: "es-ES" });
  });

  it("devuelve undefined al leer una clave inexistente", async () => {
    const key: SnapshotKey = {
      generationId: "gen-1",
      gameId: gameId("g-missing"),
      snapshotId: snapshotId("s-missing"),
    };
    expect(await adapter.getSnapshot<SnapshotPayload>(key)).toBeUndefined();
  });
});

describe("IndexedDbStoreAdapter — validación fail-closed en cada lectura", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("rechaza una lectura con Versión de guardado incompatible", async () => {
    const writer = makeAdapter(factory);
    await writer.open();
    const key: SnapshotKey = {
      generationId: "gen-1",
      gameId: gameId("g-1"),
      snapshotId: snapshotId("s-1"),
    };
    await writer.putSnapshot(key, snapshotWrite(key.gameId, { turn: 1, note: "x" }));
    writer.close();

    const reader = makeAdapter(factory, { supportedSaveVersions: [saveVersion("sv-2")] });
    await reader.open();
    await expect(reader.getSnapshot<SnapshotPayload>(key)).rejects.toMatchObject({
      reason: "unsupported-save-version",
    });
    reader.close();
  });

  it("rechaza una lectura cuando el gameId interno no coincide con la clave", async () => {
    const adapter = makeAdapter(factory);
    await adapter.open();
    const key: SnapshotKey = {
      generationId: "gen-1",
      gameId: gameId("g-1"),
      snapshotId: snapshotId("s-1"),
    };
    // Sella el sobre con un gameId distinto del de la clave (corrupción/cruce).
    const envelope = sealEnvelope({
      compatibility,
      gameId: gameId("g-otro"),
      payload: { turn: 1, note: "x" } satisfies SnapshotPayload,
    });
    const database = await openDatabase(factory);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OBJECT_STORES.snapshots], "readwrite");
      transaction.oncomplete = (): void => resolve();
      transaction.onerror = (): void => reject(transaction.error);
      transaction.objectStore(OBJECT_STORES.snapshots).put({ ...key, envelope });
    });
    database.close();

    await expect(adapter.getSnapshot<SnapshotPayload>(key)).rejects.toBeInstanceOf(
      EnvelopeValidationError,
    );
    adapter.close();
  });

  it("rechaza una lectura cuando la integridad del sobre está alterada", async () => {
    const adapter = makeAdapter(factory);
    await adapter.open();
    const key: SnapshotKey = {
      generationId: "gen-1",
      gameId: gameId("g-1"),
      snapshotId: snapshotId("s-1"),
    };
    const sealed = sealEnvelope({
      compatibility,
      gameId: key.gameId,
      payload: { turn: 1, note: "original" } satisfies SnapshotPayload,
    });
    // Altera el payload dejando la suma antigua: la lectura debe detectarlo.
    const tampered = { ...sealed, payload: { turn: 99, note: "alterado" } };
    const database = await openDatabase(factory);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OBJECT_STORES.snapshots], "readwrite");
      transaction.oncomplete = (): void => resolve();
      transaction.onerror = (): void => reject(transaction.error);
      transaction.objectStore(OBJECT_STORES.snapshots).put({ ...key, envelope: tampered });
    });
    database.close();

    await expect(adapter.getSnapshot<SnapshotPayload>(key)).rejects.toMatchObject({
      reason: "integrity-mismatch",
    });
    adapter.close();
  });
});

describe("IndexedDbStoreAdapter — cuarentena reutilizable por 15.4", () => {
  it("aísla un sobre corrupto sin borrar bytes y lo recupera por su clave", async () => {
    const factory = new IDBFactory();
    const adapter = makeAdapter(factory);
    await adapter.open();

    const record: QuarantineRecord = {
      gameId: gameId("g-corrupt"),
      detectedAtId: "d-1",
      reasonKey: "persistencia.cuarentena.integridad",
      isolatedPayload: { envelope: { corrupt: true } },
    };
    await adapter.isolateCorrupt(record);

    const recovered = await adapter.getQuarantined(record.gameId, record.detectedAtId);
    expect(recovered).toEqual(record);
    adapter.close();
  });
});
