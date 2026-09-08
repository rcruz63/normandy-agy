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
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
} from "../../src/domain/engine/state.js";
import {
  accepted,
  blocked,
  rejected,
  transitionProposal,
  type DomainMessage,
  type TransitionProposal,
} from "../../src/domain/engine/transition.js";
import {
  validateProposal,
  validateSnapshot,
  type InvariantResult,
} from "../../src/domain/invariants/index.js";

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

function expectValid(result: InvariantResult): void {
  expect(result.kind).toBe("valid");
}

function expectInvalid(
  result: InvariantResult,
  path: string,
): void {
  expect(result.kind).toBe("invalid-proposal");
  if (result.kind === "invalid-proposal") {
    expect(result.diagnostic.messageKey).toBe("invariant.invalidProposal");
    expect(result.violations.some((v) => v.path === path)).toBe(true);
  }
}

describe("validateSnapshot", () => {
  it("acepta una Instantánea inicial coherente", () => {
    expectValid(validateSnapshot(makeSnapshot()));
  });

  it("detecta gameId incoherente como referencia rota", () => {
    // Se construye una Instantánea coherente y luego se altera su gameId para
    // simular una propuesta imposible del Motor (no pasa por el constructor).
    const snap = makeSnapshot();
    const broken = { ...snap, gameId: gameId("otro") } as GameSnapshot;
    expectInvalid(validateSnapshot(broken), "snapshot.gameId");
  });

  it("detecta ficha activa no registrada (ocupación)", () => {
    const state = makeState({
      activation: { activePieceId: "p-fantasma" },
    });
    const snap = makeSnapshot({ state });
    const result = validateSnapshot(snap);
    expectInvalid(result, "state.activation.activePieceId");
    if (result.kind === "invalid-proposal") {
      expect(result.violations[0]?.category).toBe("occupancy");
    }
  });

  it("acepta ficha activa que sí está registrada", () => {
    const state = makeState({
      activation: { activePieceId: "p-1" },
      pieces: { "p-1": { pieceId: "p-1" } },
    });
    expectValid(validateSnapshot(makeSnapshot({ state })));
  });

  it("detecta clave de ficha que no coincide con su pieceId (estado de fichas)", () => {
    const state = makeState({
      pieces: { "p-1": { pieceId: "p-2" } },
    });
    expectInvalid(validateSnapshot(makeSnapshot({ state })), "state.pieces.p-1.pieceId");
  });

  it("detecta secuencia de Registro simple no consecutiva", () => {
    const snap = makeSnapshot({
      simpleLog: [
        { sequence: 1, messageKey: "a" },
        { sequence: 3, messageKey: "b" },
      ],
    });
    expectInvalid(validateSnapshot(snap), "snapshot.simpleLog[1].sequence");
  });

  it("detecta secuencia de Registro detallado con hueco inicial", () => {
    const snap = makeSnapshot({
      detailedLog: [{ sequence: 0, messageKey: "a" }],
    });
    expectInvalid(validateSnapshot(snap), "snapshot.detailedLog[0].sequence");
  });

  it("detecta posición aleatoria negativa", () => {
    const snap = makeSnapshot({
      randomState: { seed: "abc", position: -1, algorithmVersion: "rav-1" },
    });
    expectInvalid(validateSnapshot(snap), "snapshot.randomState.position");
  });

  it("detecta algorithmVersion vacío", () => {
    const snap = makeSnapshot({
      randomState: { seed: "abc", position: 0, algorithmVersion: "  " },
    });
    expectInvalid(validateSnapshot(snap), "snapshot.randomState.algorithmVersion");
  });
});

describe("validateProposal — modo complete", () => {
  const previous = makeSnapshot();

  function makeNext(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
    return makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
      ...overrides,
    });
  }

  function proposal(
    next: GameSnapshot,
    mode: TransitionProposal["mode"] = "complete",
  ): TransitionProposal {
    return transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode,
    });
  }

  it("acepta una transición completa coherente", () => {
    expectValid(validateProposal(proposal(makeNext()), previous));
  });

  it("acepta que el Estado aleatorio avance en modo complete", () => {
    const next = makeNext({
      randomState: { seed: "abc", position: 3, algorithmVersion: "rav-1" },
    });
    expectValid(validateProposal(proposal(next), previous));
  });

  it("rechaza retroceso del Estado aleatorio como invalid-proposal", () => {
    const before = makeSnapshot({
      randomState: { seed: "abc", position: 5, algorithmVersion: "rav-1" },
    });
    const next = makeNext({
      randomState: { seed: "abc", position: 2, algorithmVersion: "rav-1" },
    });
    expectInvalid(
      validateProposal(proposal(next), before),
      "proposal.next.randomState.position",
    );
  });

  it("rechaza expectedSnapshotId que no corresponde a la Instantánea previa", () => {
    const otherPrevious = makeSnapshot({ id: snapshotId("s-99") });
    const next = makeNext();
    expectInvalid(
      validateProposal(proposal(next), otherPrevious),
      "proposal.expectedSnapshotId",
    );
  });

  it("rechaza avanzar tras un desenlace terminal (victory)", () => {
    const terminal = makeSnapshot({
      state: makeState({ outcome: "victory" }),
    });
    const next = makeNext();
    expectInvalid(
      validateProposal(proposal(next), terminal),
      "previous.state.outcome",
    );
  });

  it("rechaza avanzar tras un desenlace terminal (defeat)", () => {
    const terminal = makeSnapshot({
      state: makeState({ outcome: "defeat" }),
    });
    expectInvalid(
      validateProposal(proposal(makeNext()), terminal),
      "previous.state.outcome",
    );
  });

  it("rechaza cadena rota (previousSnapshotId de next ≠ id previo)", () => {
    const next = makeNext({ previousSnapshotId: snapshotId("s-desconocida") });
    expectInvalid(
      validateProposal(proposal(next), previous),
      "proposal.next.previousSnapshotId",
    );
  });

  it("rechaza acortamiento del Registro simple", () => {
    const richPrevious = makeSnapshot({
      simpleLog: [
        { sequence: 1, messageKey: "a" },
        { sequence: 2, messageKey: "b" },
      ],
    });
    const next = makeNext({ simpleLog: [{ sequence: 1, messageKey: "a" }] });
    expectInvalid(
      validateProposal(proposal(next), richPrevious),
      "proposal.next.simpleLog",
    );
  });

  it("rechaza acortamiento del Registro detallado", () => {
    const richPrevious = makeSnapshot({
      detailedLog: [
        { sequence: 1, messageKey: "a" },
        { sequence: 2, messageKey: "b" },
      ],
    });
    const next = makeNext({ detailedLog: [{ sequence: 1, messageKey: "a" }] });
    expectInvalid(
      validateProposal(proposal(next), richPrevious),
      "proposal.next.detailedLog",
    );
  });
});

describe("validateProposal — modo stopped-after-consumption", () => {
  // Requisitos 13.7 / 17.6: se conserva exactamente un Consumo aleatorio y no
  // se aplica efecto incompleto. La posición debe avanzar EXACTAMENTE una vez.
  const previous = makeSnapshot({
    randomState: { seed: "abc", position: 4, algorithmVersion: "rav-1" },
  });

  function makeStoppedNext(position: number): GameSnapshot {
    return makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
      randomState: { seed: "abc", position, algorithmVersion: "rav-1" },
    });
  }

  function stoppedProposal(next: GameSnapshot): TransitionProposal {
    return transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode: "stopped-after-consumption",
    });
  }

  it("acepta un único avance del Estado aleatorio (+1)", () => {
    expectValid(validateProposal(stoppedProposal(makeStoppedNext(5)), previous));
  });

  it("rechaza no avanzar el Estado aleatorio (0 consumos)", () => {
    expectInvalid(
      validateProposal(stoppedProposal(makeStoppedNext(4)), previous),
      "proposal.next.randomState.position",
    );
  });

  it("rechaza avanzar más de un consumo (+2)", () => {
    expectInvalid(
      validateProposal(stoppedProposal(makeStoppedNext(6)), previous),
      "proposal.next.randomState.position",
    );
  });
});

// --- Alineación con el vocabulario de decisiones de transición ---
// El validador cubre `invalid-proposal` y `stopped-after-consumption`. Las
// decisiones `rejected`/`blocked` son responsabilidad del Motor (Tarea 8.x);
// aquí verificamos únicamente que su vocabulario y contrato están disponibles y
// son coherentes con la conservación exigida (21.2): identidad, sin consumo.
describe("vocabulario de decisiones (rejected / blocked / accepted)", () => {
  const reason: DomainMessage = { messageKey: "engine.rejected.notAllowed" };

  it("rejected preserva identidad: no altera la Instantánea (sigue válida)", () => {
    const snap = makeSnapshot();
    const decision = rejected(reason);
    expect(decision.kind).toBe("rejected");
    // Conservación 21.2: la Instantánea previa permanece válida tras un rechazo.
    expectValid(validateSnapshot(snap));
  });

  it("blocked enlaza una DecisionRef y preserva la Instantánea previa", () => {
    const snap = makeSnapshot();
    const decision = blocked(reason, decisionRef("DP-002"));
    expect(decision.kind).toBe("blocked");
    if (decision.kind === "blocked") {
      expect(decision.decisionRef).toBe("DP-002");
    }
    expectValid(validateSnapshot(snap));
  });

  it("una propuesta accepted válida pasa la validación de invariantes", () => {
    const next = makeSnapshot({
      id: snapshotId("s-2"),
      previousSnapshotId: snapshotId("s-1"),
    });
    const proposal = transitionProposal({
      expectedSnapshotId: snapshotId("s-1"),
      next,
      mode: "complete",
    });
    const decision = accepted(proposal);
    expect(decision.kind).toBe("accepted");
    if (decision.kind === "accepted") {
      expectValid(validateProposal(decision.proposal, makeSnapshot()));
    }
  });
});

// --- Prueba de propiedad opcional (fast-check) ---
// Feature: fields-of-normandy-pwa — propiedad auxiliar de la Tarea 7.3 (no es
// una de las 25 propiedades numeradas del diseño): una Instantánea inicial con
// registros de secuencia consecutiva y Estado aleatorio bien formado siempre
// es válida, con independencia de la longitud de los registros y la posición
// aleatoria no negativa.
describe("propiedad opcional: instantáneas bien formadas siempre válidas", () => {
  it("valida instantáneas con registros consecutivos y aleatoriedad correcta", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.nat({ max: 1_000 }),
        (logLength, position) => {
          const simpleLog = Array.from({ length: logLength }, (_v, i) => ({
            sequence: i + 1,
            messageKey: `s.${i}`,
          }));
          const detailedLog = Array.from({ length: logLength }, (_v, i) => ({
            sequence: i + 1,
            messageKey: `d.${i}`,
          }));
          const snap = makeSnapshot({
            simpleLog,
            detailedLog,
            randomState: { seed: "abc", position, algorithmVersion: "rav-1" },
          });
          expect(validateSnapshot(snap).kind).toBe("valid");
        },
      ),
      { numRuns: 100 },
    );
  });
});
