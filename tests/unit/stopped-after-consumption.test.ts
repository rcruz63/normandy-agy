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
  type RandomState,
} from "../../src/domain/engine/state.js";
import type { DomainMessage } from "../../src/domain/engine/transition.js";
import {
  buildStoppedAfterConsumption,
  InvalidStoppedConsumptionError,
} from "../../src/domain/engine/stopped-after-consumption.js";
import { validateProposal } from "../../src/domain/invariants/invariant-validator.js";

// --- Fixtures reutilizables ---
const RANDOM_STATE: RandomState = Object.freeze({
  seed: "seed-1",
  position: 7,
  algorithmVersion: "rav-1",
});

const DIAGNOSTIC: DomainMessage = Object.freeze({
  messageKey: "reveal.stopped.pendingTiebreak",
  params: Object.freeze({ decisionRef: "DP-002-m07-orientation" }),
});

function makeState(): GameState {
  return gameState({
    gameId: gameId("g-1"),
    missionId: missionId("FON-ML-2022-M07"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
    duration: { turns: 8 },
    turn: 3,
    phase: "reveal",
    activation: {},
    pieces: {},
    unknowns: { "hex-4-2": { hidden: true } },
    objectives: {},
    effects: [],
    outcome: "in-progress",
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
    simpleLog: [{ sequence: 1, messageKey: "turn.start" }],
    detailedLog: [{ sequence: 1, messageKey: "turn.start.detail" }],
    integrity: { algorithm: "sha-256", value: "deadbeef" },
  });
}

/** Estado aleatorio que avanza `before` en la cantidad indicada. */
function advancedBy(before: RandomState, delta: number): RandomState {
  return Object.freeze({ ...before, position: before.position + delta });
}

describe("buildStoppedAfterConsumption — construcción válida", () => {
  it("avanza exactamente una posición conservando seed y algorithmVersion", () => {
    const snapshot = makeSnapshot();
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(proposal.mode).toBe("stopped-after-consumption");
    expect(proposal.next.randomState.position).toBe(8);
    expect(proposal.next.randomState.seed).toBe("seed-1");
    expect(proposal.next.randomState.algorithmVersion).toBe("rav-1");
  });

  it("registra el diagnóstico como nueva entrada consecutiva del Registro simple", () => {
    const snapshot = makeSnapshot();
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(proposal.next.simpleLog).toHaveLength(2);
    expect(proposal.next.simpleLog[1]).toStrictEqual({
      sequence: 2,
      messageKey: "reveal.stopped.pendingTiebreak",
    });
  });

  it("no aplica el efecto incompleto: el Estado de partida queda intacto", () => {
    const snapshot = makeSnapshot();
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(proposal.next.state).toBe(snapshot.state);
    expect(proposal.next.state.unknowns["hex-4-2"]).toStrictEqual({ hidden: true });
  });

  it("enlaza la Instantánea resultante con la recibida", () => {
    const snapshot = makeSnapshot();
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(proposal.expectedSnapshotId).toBe(snapshot.id);
    expect(proposal.next.previousSnapshotId).toBe(snapshot.id);
  });

  it("añade el diagnóstico detallado cuando se aporta", () => {
    const snapshot = makeSnapshot();
    const detailed: DomainMessage = { messageKey: "reveal.stopped.detail" };
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      detailedDiagnostic: detailed,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(proposal.next.detailedLog).toHaveLength(2);
    expect(proposal.next.detailedLog[1]).toStrictEqual({
      sequence: 2,
      messageKey: "reveal.stopped.detail",
    });
  });

  it("produce una propuesta que satisface validateProposal (avance +1)", () => {
    const snapshot = makeSnapshot();
    const proposal = buildStoppedAfterConsumption({
      received: snapshot,
      consumedRandomState: advancedBy(snapshot.randomState, 1),
      nextSnapshotId: snapshotId("s-2"),
      diagnostic: DIAGNOSTIC,
      confirmedAt: "2024-01-01T00:01:00.000Z",
    });

    expect(validateProposal(proposal, snapshot).kind).toBe("valid");
  });
});

describe("buildStoppedAfterConsumption — rechazo de datos inválidos", () => {
  it("rechaza un avance nulo del Estado aleatorio (sin consumo)", () => {
    const snapshot = makeSnapshot();
    expect(() =>
      buildStoppedAfterConsumption({
        received: snapshot,
        consumedRandomState: advancedBy(snapshot.randomState, 0),
        nextSnapshotId: snapshotId("s-2"),
        diagnostic: DIAGNOSTIC,
        confirmedAt: "2024-01-01T00:01:00.000Z",
      }),
    ).toThrow(InvalidStoppedConsumptionError);
  });

  it("rechaza un avance de dos posiciones (más de un consumo)", () => {
    const snapshot = makeSnapshot();
    expect(() =>
      buildStoppedAfterConsumption({
        received: snapshot,
        consumedRandomState: advancedBy(snapshot.randomState, 2),
        nextSnapshotId: snapshotId("s-2"),
        diagnostic: DIAGNOSTIC,
        confirmedAt: "2024-01-01T00:01:00.000Z",
      }),
    ).toThrow(InvalidStoppedConsumptionError);
  });

  it("rechaza un cambio de seed durante el consumo", () => {
    const snapshot = makeSnapshot();
    const tampered: RandomState = {
      seed: "otra-semilla",
      position: snapshot.randomState.position + 1,
      algorithmVersion: snapshot.randomState.algorithmVersion,
    };
    expect(() =>
      buildStoppedAfterConsumption({
        received: snapshot,
        consumedRandomState: tampered,
        nextSnapshotId: snapshotId("s-2"),
        diagnostic: DIAGNOSTIC,
        confirmedAt: "2024-01-01T00:01:00.000Z",
      }),
    ).toThrow(InvalidStoppedConsumptionError);
  });

  it("rechaza un cambio de algorithmVersion durante el consumo", () => {
    const snapshot = makeSnapshot();
    const tampered: RandomState = {
      seed: snapshot.randomState.seed,
      position: snapshot.randomState.position + 1,
      algorithmVersion: "rav-2",
    };
    expect(() =>
      buildStoppedAfterConsumption({
        received: snapshot,
        consumedRandomState: tampered,
        nextSnapshotId: snapshotId("s-2"),
        diagnostic: DIAGNOSTIC,
        confirmedAt: "2024-01-01T00:01:00.000Z",
      }),
    ).toThrow(InvalidStoppedConsumptionError);
  });
});
