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

/**
 * Propiedad 3 de corrección (Tarea 8.4). Verifica que el Motor resuelve toda
 * transición mediante políticas de prioridad del catálogo SIN reglas
 * implícitas: la regla de mayor prioridad definida gana; una prioridad ausente
 * (DecisionRef) o un empate en la prioridad máxima produce `blocked` con
 * DecisionRef y NUNCA aplica un `default`; un comando sin regla aplicable es
 * `rejected`. En ningún caso un bloqueo/rechazo aplica un efecto.
 */

const COMMAND_TYPE = "advance";

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

function baseSnapshot(): GameSnapshot {
  const state = baseState();
  return gameSnapshot({
    id: snapshotId("s-1"),
    gameId: state.gameId,
    confirmedAt: "2024-01-01T00:00:00.000Z",
    state,
    randomState: { seed: "abc", position: 0, algorithmVersion: "rav-1" },
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

// Especificación de una regla generada: prioridad (número o pendiente) y si
// resulta aplicable al comando.
type RuleSpec = Readonly<{ priority: number | "pending"; matches: boolean }>;

const ruleSpecArb: fc.Arbitrary<RuleSpec> = fc.record({
  priority: fc.oneof(
    fc.integer({ min: 0, max: 20 }),
    fc.constant<"pending">("pending"),
  ),
  matches: fc.boolean(),
});

/**
 * Construye la vista de catálogo a partir de las especificaciones. `apply`
 * marca `applied[i]=true` si se invoca, para comprobar que los bloqueos/
 * rechazos no aplican efecto.
 */
function buildCatalog(
  specs: readonly RuleSpec[],
  applied: boolean[],
): RulesCatalogView {
  const rules: CatalogRuleView[] = specs.map((spec, i) =>
    Object.freeze({
      id: `rule-${i}`,
      kind: i % 2 === 0 ? "concrete" : "generic",
      priority:
        spec.priority === "pending"
          ? decisionRef(`DP-002-rule-${i}`)
          : spec.priority,
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

describe("Property 3: Precedencia canónica sin reglas implícitas", () => {
  it("resuelve por prioridad del catálogo sin default; ausencia/empate => blocked; sin regla => rejected", () => {
    const engine = createRulesEngine();
    // Feature: fields-of-normandy-pwa, Property 3: Precedencia canónica sin reglas implícitas
    fc.assert(
      fc.property(fc.array(ruleSpecArb, { maxLength: 8 }), (specs) => {
        const applied = specs.map(() => false);
        const catalog = buildCatalog(specs, applied);
        const decision = engine.decide(baseSnapshot(), command(), catalog);

        const applicable = specs.filter((s) => s.matches);
        const anyPending = applicable.some((s) => s.priority === "pending");

        // Prioridad máxima entre las aplicables con prioridad numérica.
        const numericPriorities = applicable
          .filter((s): s is RuleSpec & { priority: number } => s.priority !== "pending")
          .map((s) => s.priority);
        const maxPriority =
          numericPriorities.length > 0 ? Math.max(...numericPriorities) : undefined;
        const tiedAtTop =
          maxPriority === undefined
            ? 0
            : numericPriorities.filter((p) => p === maxPriority).length;

        if (applicable.length === 0) {
          // Sin regla aplicable => rejected, nunca default aceptado.
          expect(decision.kind).toBe("rejected");
          expect(applied.some((x) => x)).toBe(false);
          return;
        }

        if (anyPending || tiedAtTop > 1) {
          // Precedencia no resuelta => blocked con DecisionRef; sin efecto.
          expect(decision.kind).toBe("blocked");
          if (decision.kind === "blocked") {
            expect(typeof decision.decisionRef).toBe("string");
            expect(String(decision.decisionRef).length).toBeGreaterThan(0);
          }
          expect(applied.some((x) => x)).toBe(false);
          return;
        }

        // Prioridad definida y máximo único => acepta y aplica exactamente esa
        // regla ganadora (la de mayor prioridad).
        expect(decision.kind).toBe("accepted");
        const appliedCount = applied.filter((x) => x).length;
        expect(appliedCount).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
