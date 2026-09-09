import { describe, expect, it } from "vitest";
import fc from "fast-check";
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
import { buildStoppedAfterConsumption } from "../../src/domain/engine/stopped-after-consumption.js";
import { validateProposal } from "../../src/domain/invariants/invariant-validator.js";

/**
 * Propiedad 5 de corrección (Tarea 8.6). Para toda resolución de Revelado o
 * tabla que detecte una carencia DESPUÉS de efectuar un Consumo aleatorio que
 * los requisitos obligan a conservar, la transición `stopped-after-consumption`
 * avanza EXACTAMENTE una vez el Estado aleatorio y registra el consumo y la
 * causa, pero NO aplica contenido revelado, resultado de tabla ni otro efecto
 * parcial (13.5-13.8, 17.5-17.7). El Estado de partida queda intacto.
 */

const NUM_RUNS = 100;
const SINGLE_STEP = 1;

// Identificadores no vacíos ni en blanco: el Estado aleatorio válido exige
// `seed` y `algorithmVersion` con contenido (Invariante de aleatoriedad).
const nonBlankArb = (maxLength: number): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength })
    .filter((value) => value.trim().length > 0);

const randomStateArb: fc.Arbitrary<RandomState> = fc.record({
  seed: nonBlankArb(12),
  position: fc.nat({ max: 1_000_000 }),
  algorithmVersion: nonBlankArb(8),
});

const diagnosticArb: fc.Arbitrary<DomainMessage> = fc.record({
  messageKey: fc.constantFrom(
    "reveal.stopped.pendingTiebreak",
    "table.stopped.uncovered",
    "reveal.stopped.missingData",
  ),
});

function makeState(randomSeed: string): GameState {
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
    unknowns: { [`hex-${randomSeed.length}`]: { hidden: true } },
    objectives: {},
    effects: [],
    outcome: "in-progress",
  });
}

function makeSnapshot(randomState: RandomState): GameSnapshot {
  const state = makeState(randomState.seed);
  return gameSnapshot({
    id: snapshotId("s-1"),
    gameId: state.gameId,
    confirmedAt: "2024-01-01T00:00:00.000Z",
    state,
    randomState,
    simpleLog: [{ sequence: 1, messageKey: "turn.start" }],
    detailedLog: [],
    integrity: { algorithm: "sha-256", value: "deadbeef" },
  });
}

describe("Property 5: Detención posterior a un consumo sin efecto incompleto", () => {
  it("avanza exactamente una vez el azar, registra la causa y no aplica efecto incompleto", () => {
    // Feature: fields-of-normandy-pwa, Property 5: Detención posterior a un consumo sin efecto incompleto
    fc.assert(
      fc.property(randomStateArb, diagnosticArb, (randomState, diagnostic) => {
        const snapshot = makeSnapshot(randomState);
        const consumed: RandomState = {
          ...randomState,
          position: randomState.position + SINGLE_STEP,
        };

        const proposal = buildStoppedAfterConsumption({
          received: snapshot,
          consumedRandomState: consumed,
          nextSnapshotId: snapshotId("s-2"),
          diagnostic,
          confirmedAt: "2024-01-01T00:01:00.000Z",
        });

        expect(proposal.mode).toBe("stopped-after-consumption");
        expect(proposal.next.randomState.position).toBe(
          randomState.position + SINGLE_STEP,
        );
        expect(proposal.next.randomState.seed).toBe(randomState.seed);
        expect(proposal.next.randomState.algorithmVersion).toBe(
          randomState.algorithmVersion,
        );
        expect(proposal.next.simpleLog).toHaveLength(snapshot.simpleLog.length + 1);
        expect(proposal.next.simpleLog[proposal.next.simpleLog.length - 1]).toStrictEqual(
          { sequence: snapshot.simpleLog.length + 1, messageKey: diagnostic.messageKey },
        );
        expect(proposal.next.state).toBe(snapshot.state);
        expect(validateProposal(proposal, snapshot).kind).toBe("valid");
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
