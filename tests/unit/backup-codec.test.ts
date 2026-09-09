import { describe, expect, it } from "vitest";
import {
  gameId,
  missionId,
  rulesVersion,
  saveVersion,
  snapshotId,
} from "../../src/domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
} from "../../src/domain/engine/state.js";
import {
  BACKUP_FORMAT,
  CURRENT_CANONICALIZATION_VERSION,
  INTEGRITY_ALGORITHM,
  createBackupCodec,
  type GameAggregate,
} from "../../src/domain/persistence/index.js";

// --- Fixtures reutilizables ---

function makeState(overrides: Partial<GameState> = {}): GameState {
  return gameState({
    gameId: gameId("g-1"),
    missionId: missionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
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
    ...overrides,
  });
}

function makeSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const state = overrides.state ?? makeState();
  return gameSnapshot({
    id: snapshotId("s-1"),
    gameId: state.gameId,
    confirmedAt: "2024-01-01T00:03:00.000Z",
    state,
    randomState: { seed: "abc", position: 5, algorithmVersion: "rav-1" },
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: INTEGRITY_ALGORITHM, value: "00000000" },
    ...overrides,
  });
}

function makeAggregate(id = "g-1"): GameAggregate {
  const state = makeState({ gameId: gameId(id) });
  const snapshot = makeSnapshot({ state, gameId: gameId(id) });
  return { gameId: gameId(id), saveVersion: saveVersion("sv-1"), snapshot };
}

const codec = createBackupCodec();

describe("BackupCodec — encode (requisito 22.2)", () => {
  it("produce un paquete con envoltorio versionado, identificadores e integridad", async () => {
    const pkg = await codec.encode([makeAggregate("g-1"), makeAggregate("g-2")]);
    expect(pkg.format).toBe(BACKUP_FORMAT);
    expect(pkg.canonicalizationVersion).toBe(CURRENT_CANONICALIZATION_VERSION);
    expect(pkg.integrityAlgorithm).toBe(INTEGRITY_ALGORITHM);
    expect(pkg.saveVersion).toBe(saveVersion("sv-1"));
    expect(pkg.exportedGameIds).toEqual([gameId("g-1"), gameId("g-2")]);
    expect(pkg.integrity.algorithm).toBe(INTEGRITY_ALGORITHM);
    expect(pkg.integrity.value).toMatch(/^[0-9a-f]{8}$/u);
    expect(pkg.bytes).toBeInstanceOf(Uint8Array);
    expect(pkg.bytes.length).toBeGreaterThan(0);
  });

  it("es determinista: mismos agregados producen los mismos bytes", async () => {
    const first = await codec.encode([makeAggregate("g-1")]);
    const second = await codec.encode([makeAggregate("g-1")]);
    expect(second.integrity.value).toBe(first.integrity.value);
    expect(Array.from(second.bytes)).toEqual(Array.from(first.bytes));
  });

  it("exporta un paquete vacío coherente sin agregados", async () => {
    const pkg = await codec.encode([]);
    expect(pkg.exportedGameIds).toEqual([]);
    expect(pkg.games).toEqual([]);
    const result = await codec.validate(pkg.bytes);
    expect(result.ok).toBe(true);
  });
});

describe("BackupCodec — round-trip por equivalencia estructural (requisito 22.11)", () => {
  it("validate(encode(games).bytes) recupera agregados estructuralmente equivalentes", async () => {
    const games = [makeAggregate("g-1"), makeAggregate("g-2")];
    const pkg = await codec.encode(games);
    const result = await codec.validate(pkg.bytes);
    if (!result.ok) {
      throw new Error(`la validación debería tener éxito, fue ${result.reason}`);
    }
    expect(result.games).toEqual(games);
    expect(result.exportedGameIds).toEqual([gameId("g-1"), gameId("g-2")]);
    expect(result.integrity).toEqual(pkg.integrity);
  });
});

describe("BackupCodec — validate fail-fast (requisito 22.3)", () => {
  it("rechaza bytes que no son UTF-8 válido", async () => {
    const invalid = new Uint8Array([0xff, 0xfe, 0xfd]);
    const result = await codec.validate(invalid);
    expect(result).toMatchObject({ ok: false, reason: "malformed-package" });
  });

  it("rechaza un documento JSON sin la forma de paquete", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    const result = await codec.validate(bytes);
    expect(result).toMatchObject({ ok: false, reason: "malformed-package" });
  });

  it("rechaza un formato desconocido", async () => {
    const pkg = await codec.encode([makeAggregate("g-1")]);
    const document = JSON.parse(new TextDecoder().decode(pkg.bytes)) as Record<string, unknown>;
    document["format"] = "otro-formato";
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const result = await codec.validate(bytes);
    expect(result).toMatchObject({ ok: false, reason: "unsupported-format" });
  });

  it("rechaza una versión de canonicalización no soportada", async () => {
    const pkg = await codec.encode([makeAggregate("g-1")]);
    const document = JSON.parse(new TextDecoder().decode(pkg.bytes)) as Record<string, unknown>;
    document["canonicalizationVersion"] = "999";
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const result = await codec.validate(bytes);
    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-canonicalization-version",
    });
  });

  it("rechaza un algoritmo de integridad no soportado", async () => {
    const pkg = await codec.encode([makeAggregate("g-1")]);
    const document = JSON.parse(new TextDecoder().decode(pkg.bytes)) as Record<string, unknown>;
    document["integrityAlgorithm"] = "sha-256";
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const result = await codec.validate(bytes);
    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported-integrity-algorithm",
    });
  });

  it("detecta alteración accidental del contenido (suma no coincide)", async () => {
    const pkg = await codec.encode([makeAggregate("g-1")]);
    const document = JSON.parse(new TextDecoder().decode(pkg.bytes)) as Record<string, unknown>;
    const games = document["games"] as Array<Record<string, unknown>>;
    const first = games[0];
    if (first === undefined) {
      throw new Error("el paquete debería tener al menos un agregado");
    }
    first["saveVersion"] = "sv-alterada";
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const result = await codec.validate(bytes);
    expect(result).toMatchObject({ ok: false, reason: "integrity-mismatch" });
  });
});
