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
  type RandomState,
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
  type GameCommand,
  type TransitionProposal,
} from "../../src/domain/engine/transition.js";
import {
  createRulesEngine,
  type CatalogRuleView,
  type RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import { randomStateAfterDecision } from "../../src/domain/engine/random-preservation.js";

/**
 * Propiedad 4 de corrección (Tarea 8.5). Para todo Estado aleatorio válido y
 * todo comando cuya decisión sea `rejected` (sin regla aplicable) o `blocked`
 * previo al azar (prioridad ausente o empate sin desempate, DP-002), el Motor
 * conserva EXACTAMENTE el Estado aleatorio recibido: misma `seed`, `position` y
 * `algorithmVersion`, sin avance ni consumo, y sin aplicar efecto alguno.
 */

const COMMAND_TYPE = "advance";
const NUM_RUNS = 100;

function baseState(): GameState {
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
  });
}

function snapshotWith(randomState: RandomState): GameSnapshot {
  const state = baseState();
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

function command(): GameCommand {
  return gameCommand({
    gameId: gameId("g-1"),
    expectedSnapshotId: snapshotId("s-1"),
    type: COMMAND_TYPE,
    payload: {},
  });
}

// Especificación de una regla: prioridad (número o pendiente) y aplicabilidad.
type RuleSpec = Readonly<{ priority: number | "pending"; matches: boolean }>;

const randomStateArb: fc.Arbitrary<RandomState> = fc.record({
  seed: fc.string({ minLength: 1, maxLength: 12 }),
  position: fc.nat({ max: 1_000_000 }),
  algorithmVersion: fc.string({ minLength: 1, maxLength: 8 }),
});

const ruleSpecArb: fc.Arbitrary<RuleSpec> = fc.record({
  priority: fc.oneof(
    fc.integer({ min: 0, max: 20 }),
    fc.constant<"pending">("pending"),
  ),
  matches: fc.boolean(),
});

function buildCatalog(
  specs: readonly RuleSpec[],
  applied: boolean[],
): RulesCatalogView {
  const rules: CatalogRuleView[] = specs.map((spec, i) =>
    Object.freeze({
      id: `rule-${i}`,
      kind: i % 2 === 0 ? "concrete" : "generic",
      priority:
        spec.priority === "pending" ? decisionRef(`DP-002-rule-${i}`) : spec.priority,
      commandType: COMMAND_TYPE,
      matches: () => spec.matches,
      apply: (snapshot): TransitionProposal => {
        applied[i] = true;
        const nextState = gameState({
          ...snapshot.state,
          turn: snapshot.state.turn + 1,
        });
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
      },
    } as CatalogRuleView),
  );
  return Object.freeze({ rules: Object.freeze(rules), actions: [] });
}

/** ¿Las especificaciones producen rechazo o bloqueo previo al azar? */
function isRejectOrPreRandomBlock(specs: readonly RuleSpec[]): boolean {
  const applicable = specs.filter((s) => s.matches);
  if (applicable.length === 0) {
    return true;
  }
  const anyPending = applicable.some((s) => s.priority === "pending");
  const numeric = applicable
    .filter((s): s is RuleSpec & { priority: number } => s.priority !== "pending")
    .map((s) => s.priority);
  const maxPriority = numeric.length > 0 ? Math.max(...numeric) : undefined;
  const tiedAtTop =
    maxPriority === undefined ? 0 : numeric.filter((p) => p === maxPriority).length;
  return anyPending || tiedAtTop > 1;
}

describe("Property 4: Conservación ante rechazo o bloqueo previo al azar", () => {
  it("rejected y bloqueos previos al azar devuelven exactamente el Estado aleatorio recibido, sin efecto", () => {
    const engine = createRulesEngine();
    // Feature: fields-of-normandy-pwa, Property 4: Conservación ante rechazo o bloqueo previo al azar
    fc.assert(
      fc.property(
        randomStateArb,
        fc.array(ruleSpecArb, { maxLength: 8 }).filter(isRejectOrPreRandomBlock),
        (randomState, specs) => {
          const applied = specs.map(() => false);
          const snapshot = snapshotWith(randomState);
          const decision = engine.decide(snapshot, command(), buildCatalog(specs, applied));

          expect(decision.kind === "rejected" || decision.kind === "blocked").toBe(true);
          expect(applied.some((x) => x)).toBe(false);

          const carried = randomStateAfterDecision(snapshot, decision);
          expect(carried).toBe(snapshot.randomState);
          expect(carried).toStrictEqual(randomState);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
