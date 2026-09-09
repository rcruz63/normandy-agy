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
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
  type GameCommand,
  type TransitionProposal,
} from "../../src/domain/engine/transition.js";
import {
  createRulesEngine,
  resolvePrecedence,
  MISSING_PRIORITY_DECISION_REF,
  type CatalogActionView,
  type CatalogRuleView,
  type RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";

// --- Fixtures reutilizables ---
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

function makeSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const state = overrides.state ?? makeState();
  return gameSnapshot({
    id: snapshotId("s-1"),
    gameId: state.gameId,
    confirmedAt: "2024-01-01T00:00:00.000Z",
    state,
    randomState: { seed: "abc", position: 0, algorithmVersion: "rav-1" },
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: "sha-256", value: "deadbeef" },
    ...overrides,
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

/**
 * Construye una propuesta de transición «completa» trivial que solo avanza el
 * turno. Sirve para que un `apply` gane la precedencia sin consumir azar.
 */
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

/** Regla concreta/genérica con prioridad y `matches` configurable. */
function makeRule(
  overrides: Partial<CatalogRuleView> & Pick<CatalogRuleView, "id" | "kind" | "priority">,
): CatalogRuleView {
  return Object.freeze({
    commandType: "advance",
    matches: () => true,
    apply: (snapshot) => makeProposal(snapshot),
    ...overrides,
  });
}

function makeCatalog(rules: readonly CatalogRuleView[], actions: readonly CatalogActionView[] = []): RulesCatalogView {
  return Object.freeze({ rules, actions });
}

describe("createRulesEngine.decide — precedencia canónica", () => {
  it("una regla concreta prevalece sobre una genérica cuando su prioridad es mayor", () => {
    const engine = createRulesEngine();
    let genericApplied = false;
    const concrete = makeRule({
      id: "concrete-advance",
      kind: "concrete",
      priority: 100,
      apply: (snap) => makeProposal(snap),
    });
    const generic = makeRule({
      id: "generic-advance",
      kind: "generic",
      priority: 1,
      apply: (snap) => {
        genericApplied = true;
        return makeProposal(snap);
      },
    });
    // Orden invertido para asegurar que el orden de lista no decide.
    const catalog = makeCatalog([generic, concrete]);

    const decision = engine.decide(makeSnapshot(), makeCommand(), catalog);

    expect(decision.kind).toBe("accepted");
    expect(genericApplied).toBe(false);
  });

  it("devuelve blocked + DecisionRef (DP-002) cuando falta una prioridad y no aplica default", () => {
    const engine = createRulesEngine();
    const pendingRef = decisionRef("DP-002-m07-orientation");
    let applied = false;
    const withPending = makeRule({
      id: "pending-rule",
      kind: "concrete",
      priority: pendingRef, // prioridad NO definida => precedencia sin resolver
      apply: (snap) => {
        applied = true;
        return makeProposal(snap);
      },
    });
    const other = makeRule({
      id: "other-rule",
      kind: "generic",
      priority: 5,
      apply: (snap) => {
        applied = true;
        return makeProposal(snap);
      },
    });
    const catalog = makeCatalog([withPending, other]);

    const decision = engine.decide(makeSnapshot(), makeCommand(), catalog);

    expect(decision.kind).toBe("blocked");
    if (decision.kind === "blocked") {
      expect(decision.decisionRef).toBe(pendingRef);
      expect(decision.reason.messageKey).toBe("rules.precedence.unresolved");
    }
    expect(applied).toBe(false); // no se aplica efecto
  });

  it("devuelve blocked (DP-002) ante empate de prioridad sin desempate registrado", () => {
    const engine = createRulesEngine();
    const a = makeRule({ id: "a", kind: "generic", priority: 10 });
    const b = makeRule({ id: "b", kind: "concrete", priority: 10 });
    const catalog = makeCatalog([a, b]);

    const decision = engine.decide(makeSnapshot(), makeCommand(), catalog);

    expect(decision.kind).toBe("blocked");
    if (decision.kind === "blocked") {
      expect(decision.decisionRef).toBe(MISSING_PRIORITY_DECISION_REF);
    }
  });

  it("rechaza (rejected) un comando sin regla aplicable, sin inventar default", () => {
    const engine = createRulesEngine();
    const rule = makeRule({ id: "only-advance", kind: "generic", priority: 1, matches: () => false });
    const catalog = makeCatalog([rule]);

    const decision = engine.decide(makeSnapshot(), makeCommand("unknown"), catalog);

    expect(decision.kind).toBe("rejected");
    if (decision.kind === "rejected") {
      expect(decision.reason.messageKey).toBe("rules.command.notApplicable");
    }
  });

  it("acepta y usa el `apply` de la regla ganadora", () => {
    const engine = createRulesEngine();
    const rule = makeRule({ id: "winner", kind: "concrete", priority: 3 });
    const catalog = makeCatalog([rule]);
    const snap = makeSnapshot();

    const decision = engine.decide(snap, makeCommand(), catalog);

    expect(decision.kind).toBe("accepted");
    if (decision.kind === "accepted") {
      expect(decision.proposal.mode).toBe("complete");
      expect(decision.proposal.next.state.turn).toBe(snap.state.turn + 1);
    }
  });

  it("no muta sus argumentos (snapshot ni command)", () => {
    const engine = createRulesEngine();
    const rule = makeRule({ id: "winner", kind: "concrete", priority: 3 });
    const catalog = makeCatalog([rule]);
    const snap = makeSnapshot();
    const command = makeCommand();
    const snapCopy = JSON.parse(JSON.stringify(snap)) as unknown;
    const commandCopy = JSON.parse(JSON.stringify(command)) as unknown;

    engine.decide(snap, command, catalog);

    expect(JSON.parse(JSON.stringify(snap))).toStrictEqual(snapCopy);
    expect(JSON.parse(JSON.stringify(command))).toStrictEqual(commandCopy);
  });
});

describe("createRulesEngine.availableActions", () => {
  it("enumera solo las Acciones habilitadas por el catálogo, sin ad hoc", () => {
    const engine = createRulesEngine();
    const actions: readonly CatalogActionView[] = [
      { commandType: "advance", labelKey: "action.advance", enabled: () => true },
      { commandType: "fire", labelKey: "action.fire", enabled: () => false },
      {
        commandType: "grenade",
        labelKey: "action.grenade",
        enabled: () => true,
        params: { range: 1 },
      },
    ];
    const catalog = makeCatalog([], actions);

    const result = engine.availableActions(makeState(), catalog);

    expect(result.map((a) => a.commandType)).toStrictEqual(["advance", "grenade"]);
    expect(result[1]?.params).toStrictEqual({ range: 1 });
  });

  it("devuelve lista vacía cuando ninguna Acción está habilitada", () => {
    const engine = createRulesEngine();
    const actions: readonly CatalogActionView[] = [
      { commandType: "advance", labelKey: "action.advance", enabled: () => false },
    ];
    const result = engine.availableActions(makeState(), makeCatalog([], actions));
    expect(result).toStrictEqual([]);
  });
});

describe("resolvePrecedence", () => {
  it("devuelve `none` cuando no hay reglas aplicables", () => {
    expect(resolvePrecedence([]).kind).toBe("none");
  });

  it("elige la de mayor prioridad numérica", () => {
    const low = makeRule({ id: "low", kind: "generic", priority: 1 });
    const high = makeRule({ id: "high", kind: "concrete", priority: 9 });
    const res = resolvePrecedence([low, high]);
    expect(res.kind).toBe("winner");
    if (res.kind === "winner") {
      expect(res.rule.id).toBe("high");
    }
  });
});
