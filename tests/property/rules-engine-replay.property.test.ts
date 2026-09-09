import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  gameId,
  missionId,
  rulesVersion,
  saveVersion,
  snapshotId,
  type GameId,
} from "../../src/domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
  type RandomState as SnapshotRandomState,
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
  type GameCommand,
  type TransitionDecision,
  type TransitionProposal,
} from "../../src/domain/engine/transition.js";
import {
  createRulesEngine,
  type CatalogRuleView,
  type RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import {
  ALGORITHM_SPLITMIX64_V1,
  initialRandomState,
  pureVersionedRandom,
} from "../../src/domain/random/versioned-random.js";
import type { RandomRequest, RandomState } from "../../src/domain/random/model.js";
import {
  appendDetailedEntry,
  appendSimpleEntry,
  type DetailedLogEntry,
  type SimpleLogEntry,
} from "../../src/domain/logging/log-entries.js";

/**
 * Propiedad 15 de corrección (Tarea 14.1): determinismo del replay del Motor.
 *
 * El requisito 19.6 exige que, dados la misma Instantánea inicial, el mismo
 * Estado aleatorio inicial (misma Semilla, posición y Versión de algoritmo) y
 * la misma secuencia de comandos, reproducir (replay) el Motor produzca
 * EXACTAMENTE el mismo resultado: la misma secuencia de decisiones, el mismo
 * Estado de partida final, el mismo Estado aleatorio final y los mismos
 * registros simple y detallado (20.1-20.4), preservando las invariantes (21.1).
 *
 * El replay es una función pura y determinista: aplica cada comando mediante
 * `engine.decide`; cuando la decisión es `accepted` avanza a `proposal.next`,
 * consume aleatoriedad de forma determinista con `pureVersionedRandom.next` y
 * añade una entrada al Registro simple y otra al Registro detallado con la
 * Referencia de Consumo aleatorio. Las decisiones `rejected`/`blocked`
 * conservan el Estado aleatorio y los registros (conservación previa al azar).
 *
 * La propiedad ejecuta el replay DOS veces con la misma entrada y comprueba la
 * igualdad estructural profunda de decisiones, Estado final, Estado aleatorio
 * final y ambos registros. El catálogo sintético está diseñado para que una
 * fracción de comandos sea aceptada de forma determinista, de modo que el
 * replay no sea trivialmente vacío.
 */

/** Identificador de Partida fijo del escenario de replay. */
const GAME_ID: GameId = gameId("g-replay");

/** Semilla base del escenario; el generador la varía para explorar el espacio. */
const INITIAL_SNAPSHOT_ID = snapshotId("s-initial");

/** Tipos de comando reconocidos por el catálogo sintético. */
const ADVANCE_COMMAND = "advance";
const NOOP_COMMAND = "noop";

/** Dominio aleatorio determinista consumido por una transición aceptada (2d6). */
const REPLAY_RANDOM_DOMAIN = Object.freeze({
  kind: "dice" as const,
  sides: 6,
  count: 2,
});

/**
 * Resultado de un replay completo: la secuencia de decisiones y el estado
 * acumulado (Estado de partida, Estado aleatorio y ambos registros) al final.
 */
type ReplayResult = Readonly<{
  decisions: readonly TransitionDecision[];
  finalState: GameState;
  finalRandomState: SnapshotRandomState;
  simpleLog: readonly SimpleLogEntry[];
  detailedLog: readonly DetailedLogEntry[];
}>;

/** Especificación generada de un comando: su tipo determina si será aceptado. */
type CommandSpec = Readonly<{ type: string }>;

const commandSpecArbitrary: fc.Arbitrary<CommandSpec> = fc.record({
  type: fc.constantFrom(ADVANCE_COMMAND, NOOP_COMMAND),
});

/** Construye el Estado de partida inicial del escenario de replay. */
function buildInitialState(): GameState {
  return gameState({
    gameId: GAME_ID,
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

/** Construye la Instantánea inicial a partir del Estado y el Estado aleatorio. */
function buildInitialSnapshot(random: SnapshotRandomState): GameSnapshot {
  const state = buildInitialState();
  return gameSnapshot({
    id: INITIAL_SNAPSHOT_ID,
    gameId: GAME_ID,
    confirmedAt: "2024-01-01T00:00:00.000Z",
    state,
    randomState: random,
    simpleLog: [],
    detailedLog: [],
    integrity: { algorithm: "sha-256", value: "deadbeef" },
  });
}

/**
 * Catálogo sintético determinista: una única regla concreta resuelve el comando
 * `advance` avanzando el turno; el comando `noop` no tiene regla aplicable y es
 * `rejected`. El `apply` es puro y solo construye la Instantánea siguiente sin
 * consumir aleatoriedad (el replay resuelve el azar aparte, como la capa de
 * aplicación real).
 */
function buildCatalog(): RulesCatalogView {
  const advanceRule: CatalogRuleView = Object.freeze({
    id: "rule-advance",
    kind: "concrete",
    priority: 10,
    commandType: ADVANCE_COMMAND,
    matches: () => true,
    apply: (snapshot: GameSnapshot): TransitionProposal => {
      const nextState = gameState({
        ...snapshot.state,
        turn: snapshot.state.turn + 1,
      });
      const next = gameSnapshot({
        ...snapshot,
        id: snapshotId(`s-${snapshot.state.turn + 1}`),
        previousSnapshotId: snapshot.id,
        state: nextState,
      });
      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        next,
        mode: "complete",
      });
    },
  });
  return Object.freeze({ rules: Object.freeze([advanceRule]), actions: [] });
}

/** Petición aleatoria determinista asociada a una transición aceptada. */
function buildRandomRequest(position: number): RandomRequest {
  return Object.freeze({
    gameId: GAME_ID,
    domain: REPLAY_RANDOM_DOMAIN,
    context: Object.freeze({
      label: "replay.advance",
      detail: Object.freeze({ position: String(position) }),
    }),
  });
}

/** Convierte el Estado aleatorio del modelo al alias de la Instantánea. */
function toSnapshotRandom(state: RandomState): SnapshotRandomState {
  return Object.freeze({
    seed: state.seed,
    position: state.position,
    algorithmVersion: state.algorithmVersion as string,
  });
}

/** Estado mutable acumulado durante un replay (encapsulado en la función). */
type ReplayAccumulator = {
  snapshot: GameSnapshot;
  random: RandomState;
  decisions: TransitionDecision[];
  simpleLog: readonly SimpleLogEntry[];
  detailedLog: readonly DetailedLogEntry[];
};

/** Aplica un único comando al acumulador, avanzando de forma determinista. */
function applyCommand(
  accumulator: ReplayAccumulator,
  spec: CommandSpec,
  engine: ReturnType<typeof createRulesEngine>,
  catalog: RulesCatalogView,
): void {
  const command: GameCommand = gameCommand({
    gameId: GAME_ID,
    expectedSnapshotId: accumulator.snapshot.id,
    type: spec.type,
    payload: {},
  });
  const decision = engine.decide(accumulator.snapshot, command, catalog);
  accumulator.decisions.push(decision);

  if (decision.kind !== "accepted") {
    // Conservación previa al azar (21.2): el Estado aleatorio y los registros
    // se mantienen intactos ante `rejected`/`blocked`.
    return;
  }

  const step = pureVersionedRandom.next(
    accumulator.random,
    buildRandomRequest(accumulator.random.position),
  );
  accumulator.random = step.state;
  accumulator.simpleLog = appendSimpleEntry(GAME_ID, accumulator.simpleLog, {
    turn: decision.proposal.next.state.turn,
    phase: decision.proposal.next.state.phase,
    actor: "engine",
    action: command.type,
    result: "accepted",
    messageKey: "replay.simple.accepted",
  });
  accumulator.detailedLog = appendDetailedEntry(
    GAME_ID,
    accumulator.detailedLog,
    {
      deterministic: {
        inputs: [command.type],
        rules: ["rule-advance"],
        priorities: ["10"],
        computations: [String(step.consumption.interpretedResult)],
      },
      consumptions: [
        {
          position: step.consumption.position,
          algorithmVersion: step.state.algorithmVersion as string,
        },
      ],
      messageKey: "replay.detailed.accepted",
    },
  );
  accumulator.snapshot = gameSnapshot({
    ...decision.proposal.next,
    randomState: toSnapshotRandom(step.state),
    simpleLog: accumulator.simpleLog,
    detailedLog: accumulator.detailedLog,
  });
}

/**
 * Reproduce el Motor de forma pura y determinista: parte de la Instantánea
 * inicial y del Estado aleatorio inicial, aplica la secuencia de comandos y
 * devuelve las decisiones, el Estado final, el Estado aleatorio final y ambos
 * registros.
 */
function replay(
  initialRandom: RandomState,
  specs: readonly CommandSpec[],
): ReplayResult {
  const engine = createRulesEngine();
  const catalog = buildCatalog();
  const accumulator: ReplayAccumulator = {
    snapshot: buildInitialSnapshot(toSnapshotRandom(initialRandom)),
    random: initialRandom,
    decisions: [],
    simpleLog: [],
    detailedLog: [],
  };
  for (const spec of specs) {
    applyCommand(accumulator, spec, engine, catalog);
  }
  return {
    decisions: accumulator.decisions,
    finalState: accumulator.snapshot.state,
    finalRandomState: accumulator.snapshot.randomState,
    simpleLog: accumulator.simpleLog,
    detailedLog: accumulator.detailedLog,
  };
}

/** Genera una Semilla opaca no vacía para el Estado aleatorio inicial. */
const seedArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 16 })
  .filter((value) => value.trim().length > 0);

describe("Property 15: Determinismo del replay del Motor", () => {
  it("dos replays de la misma Instantánea, Estado aleatorio y comandos son idénticos", () => {
    // Feature: fields-of-normandy-pwa, Property 15: Determinismo del replay del Motor
    fc.assert(
      fc.property(
        seedArbitrary,
        fc.array(commandSpecArbitrary, { minLength: 1, maxLength: 12 }),
        (seed, specs) => {
          const initialRandom = initialRandomState(seed, ALGORITHM_SPLITMIX64_V1);
          const first = replay(initialRandom, specs);
          const second = replay(initialRandom, specs);

          expect(second.decisions).toStrictEqual(first.decisions);
          expect(second.finalState).toStrictEqual(first.finalState);
          expect(second.finalRandomState).toStrictEqual(first.finalRandomState);
          expect(second.simpleLog).toStrictEqual(first.simpleLog);
          expect(second.detailedLog).toStrictEqual(first.detailedLog);

          // Al menos una transición aceptada ocurre cuando hay algún `advance`,
          // garantizando que el replay no es trivialmente vacío.
          const acceptedCount = first.decisions.filter(
            (decision) => decision.kind === "accepted",
          ).length;
          const advanceCount = specs.filter(
            (spec) => spec.type === ADVANCE_COMMAND,
          ).length;
          expect(acceptedCount).toBe(advanceCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
