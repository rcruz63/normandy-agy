import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  gameId,
  missionId,
  rulesVersion,
  saveVersion,
  snapshotId,
  decisionRef,
} from "../../src/domain/identity/index.js";
import {
  InvalidGameStateError,
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
} from "../../src/domain/engine/state.js";
import {
  InvalidTransitionError,
  accepted,
  blocked,
  gameCommand,
  rejected,
  transitionProposal,
  type DomainMessage,
} from "../../src/domain/engine/transition.js";

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

describe("gameState", () => {
  it("construye un estado válido inmutable", () => {
    const state = makeState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(state.outcome).toBe("in-progress");
    expect(state.turn).toBe(0);
  });

  it("no contiene ninguna clave de estado de vista", () => {
    const state = makeState();
    const viewKeys = [
      "zoom",
      "pan",
      "orientation",
      "selection",
      "readingPosition",
      "size",
      "view",
      "viewState",
    ];
    for (const key of viewKeys) {
      expect(Object.prototype.hasOwnProperty.call(state, key)).toBe(false);
    }
  });

  it("rechaza turno negativo o no entero", () => {
    expect(() => makeState({ turn: -1 })).toThrow(InvalidGameStateError);
    expect(() => makeState({ turn: 1.5 })).toThrow(InvalidGameStateError);
  });

  it("rechaza fase vacía", () => {
    expect(() => makeState({ phase: "  " })).toThrow(InvalidGameStateError);
  });

  it("acepta los cuatro desenlaces y rechaza uno desconocido", () => {
    for (const outcome of ["in-progress", "victory", "defeat", "suspended"] as const) {
      expect(makeState({ outcome }).outcome).toBe(outcome);
    }
    expect(() =>
      makeState({ outcome: "unknown" as GameState["outcome"] }),
    ).toThrow(InvalidGameStateError);
  });
});

describe("gameSnapshot", () => {
  it("construye una Instantánea inicial sin previousSnapshotId", () => {
    const snap = makeSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(snap, "previousSnapshotId")).toBe(
      false,
    );
  });

  it("conserva previousSnapshotId cuando se aporta", () => {
    const snap = makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
    });
    expect(snap.previousSnapshotId).toBe("s-1");
  });

  it("rechaza gameId incoherente con el estado envuelto", () => {
    expect(() =>
      makeSnapshot({ gameId: gameId("otro") }),
    ).toThrow(InvalidGameStateError);
  });

  it("rechaza previousSnapshotId igual al id de la Instantánea", () => {
    expect(() =>
      makeSnapshot({ id: snapshotId("s-1"), previousSnapshotId: snapshotId("s-1") }),
    ).toThrow(InvalidGameStateError);
  });

  it("rechaza confirmedAt vacío", () => {
    expect(() => makeSnapshot({ confirmedAt: "" })).toThrow(InvalidGameStateError);
  });
});

describe("gameCommand", () => {
  it("construye un comando inmutable con payload congelado", () => {
    const cmd = gameCommand({
      gameId: gameId("g-1"),
      expectedSnapshotId: snapshotId("s-1"),
      type: "advance",
      payload: { pieceId: "p-1" },
    });
    expect(Object.isFrozen(cmd)).toBe(true);
    expect(Object.isFrozen(cmd.payload)).toBe(true);
    expect(cmd.type).toBe("advance");
  });

  it("no expone la modalidad de entrada (source)", () => {
    const cmd = gameCommand({
      gameId: gameId("g-1"),
      expectedSnapshotId: snapshotId("s-1"),
      type: "advance",
    });
    expect(Object.prototype.hasOwnProperty.call(cmd, "source")).toBe(false);
    expect(cmd.payload).toEqual({});
  });

  it("rechaza type vacío", () => {
    expect(() =>
      gameCommand({
        gameId: gameId("g-1"),
        expectedSnapshotId: snapshotId("s-1"),
        type: "   ",
      }),
    ).toThrow(InvalidTransitionError);
  });
});

describe("transitionProposal", () => {
  it("construye una propuesta en modo complete", () => {
    const next = makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
    });
    const proposal = transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode: "complete",
    });
    expect(proposal.mode).toBe("complete");
    expect(Object.isFrozen(proposal)).toBe(true);
  });

  it("construye una propuesta en modo stopped-after-consumption", () => {
    const next = makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
      randomState: { seed: "abc", position: 1, algorithmVersion: "rav-1" },
    });
    const proposal = transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode: "stopped-after-consumption",
    });
    expect(proposal.mode).toBe("stopped-after-consumption");
    // El Estado aleatorio avanzó exactamente una posición (consumo conservado).
    expect(proposal.next.randomState.position).toBe(1);
  });

  it("rechaza un modo desconocido", () => {
    const next = makeSnapshot({ id: snapshotId("s-2") });
    expect(() =>
      transitionProposal({
        expectedSnapshotId: snapshotId("s-1"),
        next,
        mode: "partial" as "complete",
      }),
    ).toThrow(InvalidTransitionError);
  });

  it("rechaza reutilizar expectedSnapshotId como id de la Instantánea resultante", () => {
    const next = makeSnapshot({ id: snapshotId("s-1") });
    expect(() =>
      transitionProposal({
        expectedSnapshotId: snapshotId("s-1"),
        next,
        mode: "complete",
      }),
    ).toThrow(InvalidTransitionError);
  });
});

describe("decisiones de transición", () => {
  const reason: DomainMessage = { messageKey: "engine.rejected.notAllowed" };

  it("accepted envuelve una propuesta", () => {
    const next = makeSnapshot({ id: snapshotId("s-2") });
    const proposal = transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode: "complete",
    });
    const decision = accepted(proposal);
    expect(decision.kind).toBe("accepted");
    if (decision.kind === "accepted") {
      expect(decision.proposal).toBe(proposal);
    }
  });

  it("rejected transporta un motivo es-ES sin referencia de decisión", () => {
    const decision = rejected(reason);
    expect(decision.kind).toBe("rejected");
    if (decision.kind === "rejected") {
      expect(decision.reason.messageKey).toBe("engine.rejected.notAllowed");
    }
    expect(Object.prototype.hasOwnProperty.call(decision, "decisionRef")).toBe(
      false,
    );
  });

  it("blocked incluye motivo y DecisionRef", () => {
    const decision = blocked(reason, decisionRef("DP-002"));
    expect(decision.kind).toBe("blocked");
    if (decision.kind === "blocked") {
      expect(decision.decisionRef).toBe("DP-002");
    }
  });
});

describe("propiedades básicas de las decisiones", () => {
  it("toda decisión tiene exactamente uno de los tres kinds válidos", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("accepted", "rejected", "blocked"),
        (kind) => {
          const reason: DomainMessage = { messageKey: "k" };
          const next = makeSnapshot({ id: snapshotId("s-2") });
          const decision =
            kind === "accepted"
              ? accepted(
                  transitionProposal({
                    expectedSnapshotId: snapshotId("s-1"),
                    next,
                    mode: "complete",
                  }),
                )
              : kind === "rejected"
                ? rejected(reason)
                : blocked(reason, decisionRef("DP-001"));
          expect(["accepted", "rejected", "blocked"]).toContain(decision.kind);
          expect(decision.kind).toBe(kind);
        },
      ),
      { numRuns: 100 },
    );
  });
});
