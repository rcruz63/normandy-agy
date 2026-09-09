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
  createMigrationRegistry,
  type Migrator,
  type StorageGeneration,
} from "../../src/domain/persistence/index.js";

// --- Fixtures reutilizables -------------------------------------------------

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

function makeSnapshot(id: string, save: string): GameSnapshot {
  const state = makeState({
    gameId: gameId(id),
    saveVersion: saveVersion(save),
  });
  return gameSnapshot({
    id: snapshotId(`s-${id}`),
    gameId: gameId(id),
    confirmedAt: "2024-01-01T00:03:00.000Z",
    state,
    randomState: { seed: "abc", position: 5, algorithmVersion: "rav-1" },
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: "fnv1a-32", value: "00000000" },
  });
}

function generation(save: string, snapshots: readonly GameSnapshot[]): StorageGeneration {
  return {
    id: "active" as StorageGeneration["id"],
    saveVersion: saveVersion(save),
    games: snapshots,
  };
}

/** Migrador identidad salvo la Versión de guardado de las Instantáneas y la generación. */
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

describe("MigrationRegistry.plan — composición explícita (requisito 22.6)", () => {
  it("compone una cadena contigua de dos pasos", () => {
    const registry = createMigrationRegistry([
      bumpSaveVersion("sv-1", "sv-2"),
      bumpSaveVersion("sv-2", "sv-3"),
    ]);
    const plan = registry.plan(saveVersion("sv-1"), saveVersion("sv-3"));
    expect(plan?.steps).toHaveLength(2);
    expect(plan?.from).toBe(saveVersion("sv-1"));
    expect(plan?.to).toBe(saveVersion("sv-3"));
  });

  it("devuelve un plan vacío para from === to", () => {
    const registry = createMigrationRegistry([]);
    const plan = registry.plan(saveVersion("sv-1"), saveVersion("sv-1"));
    expect(plan?.steps).toHaveLength(0);
  });

  it("devuelve undefined cuando no hay ruta (sin default silencioso)", () => {
    const registry = createMigrationRegistry([bumpSaveVersion("sv-1", "sv-2")]);
    expect(registry.plan(saveVersion("sv-1"), saveVersion("sv-9"))).toBeUndefined();
  });
});

describe("MigrationRegistry.migrate — éxito conservador (requisitos 22.6, 22.8)", () => {
  it("migra conservando Partidas, registros y Estado aleatorio", () => {
    const registry = createMigrationRegistry([bumpSaveVersion("sv-1", "sv-2")]);
    const plan = registry.plan(saveVersion("sv-1"), saveVersion("sv-2"));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    const input = generation("sv-1", [
      makeSnapshot("g-1", "sv-1"),
      makeSnapshot("g-2", "sv-1"),
    ]);
    const result = registry.migrate(input, plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generation.saveVersion).toBe(saveVersion("sv-2"));
      expect(result.generation.games).toHaveLength(2);
    }
  });
});

describe("MigrationRegistry.migrate — fallos tipados fail-fast (requisito 22.9)", () => {
  const registry = createMigrationRegistry([bumpSaveVersion("sv-1", "sv-2")]);

  function planOrThrow(from: string, to: string) {
    const plan = registry.plan(saveVersion(from), saveVersion(to));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    return plan;
  }

  it("rechaza cuando la Versión de la entrada no coincide con el origen del plan", () => {
    const result = registry.migrate(
      generation("sv-9", [makeSnapshot("g-1", "sv-9")]),
      planOrThrow("sv-1", "sv-2"),
    );
    expect(result).toMatchObject({ ok: false, reason: "plan-version-mismatch" });
  });

  it("rechaza cuando un migrador descarta una Partida (field-not-preserved)", () => {
    const dropper: Migrator = {
      from: saveVersion("sv-1"),
      to: saveVersion("sv-2"),
      apply: (input) => ({
        id: input.id,
        saveVersion: saveVersion("sv-2"),
        games: [],
      }),
    };
    const dropRegistry = createMigrationRegistry([dropper]);
    const plan = dropRegistry.plan(saveVersion("sv-1"), saveVersion("sv-2"));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    const result = dropRegistry.migrate(
      generation("sv-1", [makeSnapshot("g-1", "sv-1")]),
      plan,
    );
    expect(result).toMatchObject({ ok: false, reason: "field-not-preserved" });
  });

  it("rechaza cuando la Versión resultante no coincide con el destino (integrity-mismatch)", () => {
    const wrongTarget: Migrator = {
      from: saveVersion("sv-1"),
      to: saveVersion("sv-2"),
      // Devuelve una Versión distinta de la declarada como destino.
      apply: (input) => ({ ...input, saveVersion: saveVersion("sv-otra") }),
    };
    const badRegistry = createMigrationRegistry([wrongTarget]);
    const plan = badRegistry.plan(saveVersion("sv-1"), saveVersion("sv-2"));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    const result = badRegistry.migrate(
      generation("sv-1", [makeSnapshot("g-1", "sv-1")]),
      plan,
    );
    expect(result).toMatchObject({ ok: false, reason: "integrity-mismatch" });
  });

  it("rechaza cuando el Estado aleatorio retrocede (field-not-preserved)", () => {
    const regressor: Migrator = {
      from: saveVersion("sv-1"),
      to: saveVersion("sv-2"),
      apply: (input) => ({
        id: input.id,
        saveVersion: saveVersion("sv-2"),
        games: input.games.map((snapshot) =>
          gameSnapshot({
            ...snapshot,
            state: gameState({ ...snapshot.state, saveVersion: saveVersion("sv-2") }),
            randomState: { ...snapshot.randomState, position: 0 },
          }),
        ),
      }),
    };
    const regRegistry = createMigrationRegistry([regressor]);
    const plan = regRegistry.plan(saveVersion("sv-1"), saveVersion("sv-2"));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    const result = regRegistry.migrate(
      generation("sv-1", [makeSnapshot("g-1", "sv-1")]),
      plan,
    );
    expect(result).toMatchObject({ ok: false, reason: "field-not-preserved" });
  });
});

describe("MigrationRegistry — determinismo puro", () => {
  it("no muta la generación de entrada", () => {
    const registry = createMigrationRegistry([bumpSaveVersion("sv-1", "sv-2")]);
    const plan = registry.plan(saveVersion("sv-1"), saveVersion("sv-2"));
    if (plan === undefined) {
      throw new Error("el plan debería existir");
    }
    const original = makeSnapshot("g-1", "sv-1");
    const input = generation("sv-1", [original]);
    registry.migrate(input, plan);
    expect(input.saveVersion).toBe(saveVersion("sv-1"));
    expect(input.games[0]?.state.saveVersion).toBe(saveVersion("sv-1"));
  });
});
