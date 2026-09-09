import { describe, expect, it } from "vitest";
import {
  gameId,
  missionId,
  rulesVersion,
  saveVersion,
  snapshotId,
  decisionRef,
} from "../../src/domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
  type RandomState,
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
  accepted,
  blocked,
  rejected,
  type GameCommand,
  type TransitionProposal,
} from "../../src/domain/engine/transition.js";
import {
  createRulesEngine,
  type CatalogRuleView,
  type RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import {
  preservedRandomState,
  preservesRandomState,
  isSameRandomState,
  randomStateAfterDecision,
} from "../../src/domain/engine/random-preservation.js";

// --- Fixtures reutilizables ---
const RANDOM_STATE: RandomState = Object.freeze({
  seed: "abc",
  position: 7,
  algorithmVersion: "rav-1",
});

function makeState(overrides: Partial<GameState> = {}): GameState {
  return gameState({
    gameId: gameId("g-1"),
    missionId: missionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
    duration: { turns: 8 },
    turn: 0,
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

function makeSnapshot(randomState: RandomState = RANDOM_STATE): GameSnapshot {
  const state = makeState();
  return gameSnapshot({
    id: snapshotId("s-1"),
    gameId: state.gameId,
    confirmedAt: "2024-01-01T00:00:00.000Z",
    state,
    randomState,
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: "sha-256", value: "deadbeef" },
  });
}

function makeCommand(type = "advance"): GameCommand {
  return gameCommand({
    gameId: gameId("g-1"),
    expectedSnapshotId: snapshotId("s-1"),
    type,
    payload: {},
  });
}

function makeProposal(snapshot: GameSnapshot): TransitionProposal {
  const nextState = gameState({ ...snapshot.state, turn: snapshot.state.turn + 1 });
  const next = gameSnapshot({
    ...snapshot,
    id: snapshotId("s-2"),
    previousSnapshotId: snapshot.id,
    state: nextState,
  });
  return transitionProposal({
    expectedSnapshotId: snapshot.id,
    next,
    mode: "complete",
  });
}

function makeRule(
  overrides: Partial<CatalogRuleView> &
    Pick<CatalogRuleView, "id" | "kind" | "priority">,
): CatalogRuleView {
  return Object.freeze({
    commandType: "advance",
    matches: () => true,
    apply: (snapshot) => makeProposal(snapshot),
    ...overrides,
  });
}

function makeCatalog(rules: readonly CatalogRuleView[]): RulesCatalogView {
  return Object.freeze({ rules, actions: [] });
}

describe("conservación del Estado aleatorio en decide — rejected", () => {
  it("conserva exactamente el Estado aleatorio recibido cuando no hay regla aplicable", () => {
    const engine = createRulesEngine();
    const rule = makeRule({ id: "solo", kind: "generic", priority: 1, matches: () => false });
    const snapshot = makeSnapshot();

    const decision = engine.decide(snapshot, makeCommand("unknown"), makeCatalog([rule]));

    expect(decision.kind).toBe("rejected");
    const carried = randomStateAfterDecision(snapshot, decision);
    expect(carried).toBe(snapshot.randomState);
    expect(carried).toStrictEqual({ seed: "abc", position: 7, algorithmVersion: "rav-1" });
  });

  it("no altera seed, position ni algorithmVersion ante catálogo vacío (caso límite)", () => {
    const engine = createRulesEngine();
    const snapshot = makeSnapshot();

    const decision = engine.decide(snapshot, makeCommand(), makeCatalog([]));

    expect(decision.kind).toBe("rejected");
    expect(randomStateAfterDecision(snapshot, decision)).toStrictEqual(snapshot.randomState);
  });
});

describe("conservación del Estado aleatorio en decide — blocked previo al azar", () => {
  it("conserva el Estado aleatorio cuando falta una prioridad (DP-002)", () => {
    const engine = createRulesEngine();
    const pendingRef = decisionRef("DP-002-m07-orientation");
    const pending = makeRule({ id: "pending", kind: "concrete", priority: pendingRef });
    const other = makeRule({ id: "other", kind: "generic", priority: 5 });
    const snapshot = makeSnapshot();

    const decision = engine.decide(snapshot, makeCommand(), makeCatalog([pending, other]));

    expect(decision.kind).toBe("blocked");
    const carried = randomStateAfterDecision(snapshot, decision);
    expect(carried).toBe(snapshot.randomState);
    expect(carried).toStrictEqual(snapshot.randomState);
  });

  it("conserva el Estado aleatorio ante empate de prioridad sin desempate", () => {
    const engine = createRulesEngine();
    const a = makeRule({ id: "a", kind: "generic", priority: 10 });
    const b = makeRule({ id: "b", kind: "concrete", priority: 10 });
    const snapshot = makeSnapshot();

    const decision = engine.decide(snapshot, makeCommand(), makeCatalog([a, b]));

    expect(decision.kind).toBe("blocked");
    expect(randomStateAfterDecision(snapshot, decision)).toBe(snapshot.randomState);
  });
});

describe("preservedRandomState", () => {
  it("devuelve la misma referencia del Estado aleatorio recibido", () => {
    const snapshot = makeSnapshot();
    expect(preservedRandomState(snapshot)).toBe(snapshot.randomState);
  });
});

describe("preservesRandomState", () => {
  it("es verdadero para rejected", () => {
    expect(preservesRandomState(rejected({ messageKey: "x" }))).toBe(true);
  });

  it("es verdadero para blocked", () => {
    expect(
      preservesRandomState(blocked({ messageKey: "x" }, decisionRef("DP-002-x"))),
    ).toBe(true);
  });

  it("es falso para accepted (la propuesta puede haber avanzado el azar)", () => {
    const decision = accepted(makeProposal(makeSnapshot()));
    expect(preservesRandomState(decision)).toBe(false);
  });
});

describe("randomStateAfterDecision — accepted", () => {
  it("devuelve undefined en accepted: el Estado aleatorio lo fija la propuesta", () => {
    const snapshot = makeSnapshot();
    const decision = accepted(makeProposal(snapshot));
    expect(randomStateAfterDecision(snapshot, decision)).toBeUndefined();
  });
});

describe("isSameRandomState", () => {
  it("es verdadero para Estados aleatorios estructuralmente idénticos", () => {
    expect(
      isSameRandomState(
        { seed: "abc", position: 7, algorithmVersion: "rav-1" },
        { seed: "abc", position: 7, algorithmVersion: "rav-1" },
      ),
    ).toBe(true);
  });

  it("es falso cuando la posición avanzó (consumo aleatorio)", () => {
    expect(
      isSameRandomState(
        { seed: "abc", position: 7, algorithmVersion: "rav-1" },
        { seed: "abc", position: 8, algorithmVersion: "rav-1" },
      ),
    ).toBe(false);
  });
});
