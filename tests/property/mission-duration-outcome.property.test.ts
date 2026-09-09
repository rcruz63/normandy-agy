import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  availableTurnsFor,
  prepareMission,
  type BritishForceView,
  type DurationChoice,
  type MissionObjective,
  type MissionSetupRequest,
} from "../../src/domain/rules/mission-setup.js";
import {
  ARTILLERY_KIND,
  evaluateOutcome,
  type OutcomePieceView,
  type OutcomeRequest,
  type OutcomeStateView,
} from "../../src/domain/rules/mission-outcome.js";
import { hexId } from "../../src/domain/geometry/index.js";
import type { HexId } from "../../src/domain/geometry/index.js";

/**
 * Propiedad 24 (Tarea 11.4): invariantes de duración, tablas y desenlace por
 * Misión que ATAN `availableTurnsFor`/`prepareMission` (`mission-setup.ts`) con
 * `evaluateOutcome` (`mission-outcome.ts`). Una única propiedad `fast-check`
 * con `numRuns: 100` que verifica, sobre `baseTurns` válidos generados y
 * objetivos tipados con estados de partida sintéticos:
 *
 * - DURACIÓN base∓1 (32.5, 32.8, 32.9, 32.10): las tres variantes producen
 *   EXACTAMENTE base−1/base/base+1, y `prepareMission` fija esa duración.
 * - VICTORIA SII objetivo cumplido (32.11): la victoria se declara si y solo si
 *   el objetivo tipado generado está cumplido, aplicando SOLO ese objetivo.
 * - DERROTA SOLO AL CONCLUIR (18.1, 32.6, 32.7): si el objetivo no se cumple,
 *   hay derrota SOLO cuando el último turno ha concluido; en otro caso
 *   `ongoing`.
 * - SUSPENSIÓN POR PRECEDENCIA NO RESUELTA (18.2): siempre suspende.
 *
 * Los auxiliares fuera del `it` construyen los objetivos, estados y
 * cumplimientos esperados sin lógica compleja dentro de la propiedad.
 *
 * **Validates: Requirements 17.2, 17.3, 17.4, 17.5, 18.1, 18.2, 32.4, 32.5,
 * 32.6, 32.7, 32.8, 32.9, 32.10, 32.11, 33.2**
 */

/** Las tres variantes de duración, en orden creciente de turnos. */
const CHOICES: readonly DurationChoice[] = ["shorter", "base", "longer"];

/** Delta de turnos esperado por variante (32.8/32.10/32.9). */
const EXPECTED_DELTA: Readonly<Record<DurationChoice, number>> = Object.freeze({
  shorter: -1,
  base: 0,
  longer: 1,
});

/** Los cuatro objetivos tipados del dominio (sin `churchHexId`, ese se añade aparte). */
type ObjectiveTag =
  | "eliminate-all-germans"
  | "eliminate-single-revealed-german"
  | "destroy-artillery"
  | "occupy-church-hex";

const OBJECTIVE_TAGS: readonly ObjectiveTag[] = [
  "eliminate-all-germans",
  "eliminate-single-revealed-german",
  "destroy-artillery",
  "occupy-church-hex",
];

/** Fuerza británica mínima para preparar una Misión (33.1). */
const BRITISH_FORCE: BritishForceView = Object.freeze({
  kind: "rifle-squad",
  squad: "A",
  labelEs: "Escuadra de fusileros A",
});

/** Hexágono de la iglesia resuelto para el objetivo `occupy-church-hex`. */
const CHURCH_HEX: HexId = hexId("hex-church");

/** Genera turnos base válidos de una Misión (32.4). */
const baseTurnsArbitrary = fc.integer({ min: 2, max: 12 });

/** Genera una pieza sintética del estado de desenlace. */
const pieceArbitrary: fc.Arbitrary<OutcomePieceView> = fc.record({
  side: fc.constantFrom<OutcomePieceView["side"]>("british", "german", "neutral"),
  visibility: fc.constantFrom<OutcomePieceView["visibility"]>("hidden", "revealed"),
  status: fc.constantFrom<OutcomePieceView["status"]>("active", "eliminated"),
  kind: fc.constantFrom<string>(ARTILLERY_KIND, "rifles", "hmg"),
  onChurch: fc.boolean(),
}).map((raw): OutcomePieceView => {
  const base = {
    side: raw.side,
    visibility: raw.visibility,
    status: raw.status,
    kind: raw.kind,
  };
  if (raw.side === "british" && raw.onChurch) {
    return { ...base, hexId: CHURCH_HEX };
  }
  return base;
});

describe("propiedades de duración, tablas y desenlace por Misión", () => {
  // Feature: fields-of-normandy-pwa, Property 24: Duración, tablas y desenlace por Misión
  it("duración base∓1 exacta, victoria sii objetivo cumplido, derrota solo al concluir y suspensión por precedencia", () => {
    fc.assert(
      fc.property(
        baseTurnsArbitrary,
        fc.constantFrom<DurationChoice>(...CHOICES),
        fc.constantFrom<ObjectiveTag>(...OBJECTIVE_TAGS),
        fc.array(pieceArbitrary, { minLength: 0, maxLength: 6 }),
        fc.integer({ min: 1, max: 14 }),
        fc.boolean(),
        (baseTurns, choice, objectiveTag, pieces, currentTurn, concluded) => {
          const objective = buildObjective(objectiveTag);

          // (1) Duración base∓1 EXACTA por variante (32.5/32.8/32.9/32.10).
          const expected = baseTurns + EXPECTED_DELTA[choice];
          expect(availableTurnsFor({ baseTurns }, choice)).toBe(expected);

          // La preparación fija esa misma duración disponible (32.4).
          const setup = prepareMission(buildSetupRequest(baseTurns, choice, objective));
          expect(setup.availableTurns).toBe(expected);

          // (2) Desenlace aplicando SOLO el objetivo generado (32.11).
          const state = buildState(pieces, currentTurn, expected, concluded);
          const outcome = evaluateOutcome(buildOutcomeRequest(objective, state, false));

          const met = isObjectiveMetExpected(objective, pieces);
          if (met) {
            // (18.1, 32.6) Victoria SII el objetivo está cumplido.
            expect(outcome.kind).toBe("victory");
          } else if (concluded && currentTurn >= expected) {
            // (32.7) Derrota SOLO cuando el último turno ha concluido.
            expect(outcome.kind).toBe("defeat");
          } else {
            // En otro caso, la Partida sigue en curso.
            expect(outcome.kind).toBe("ongoing");
          }

          // (3) Precedencia no resuelta: siempre suspende (18.2).
          const suspended = evaluateOutcome(buildOutcomeRequest(objective, state, true));
          expect(suspended.kind).toBe("suspended");

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Construye el objetivo tipado del dominio a partir de su etiqueta. */
function buildObjective(tag: ObjectiveTag): MissionObjective {
  if (tag === "occupy-church-hex") {
    return { kind: "occupy-church-hex", churchHexId: CHURCH_HEX };
  }
  return { kind: tag };
}

/** Construye la petición de preparación mínima con la duración indicada. */
function buildSetupRequest(
  baseTurns: number,
  choice: DurationChoice,
  objective: MissionObjective,
): MissionSetupRequest {
  return {
    missionNumber: 1,
    duration: { baseTurns },
    durationChoice: choice,
    britishForces: [BRITISH_FORCE],
    fixedGermanUnits: { present: false },
    objective,
    revealTable: { missionRef: "FON-ML-2022-M01" },
  };
}

/** Construye la vista de estado del desenlace. */
function buildState(
  pieces: readonly OutcomePieceView[],
  currentTurn: number,
  lastAvailableTurn: number,
  currentTurnConcluded: boolean,
): OutcomeStateView {
  return { pieces, currentTurn, lastAvailableTurn, currentTurnConcluded };
}

/** Construye la petición de evaluación del desenlace. */
function buildOutcomeRequest(
  objective: MissionObjective,
  state: OutcomeStateView,
  unresolvedPrecedence: boolean,
): OutcomeRequest {
  return { objective, state, unresolvedPrecedence };
}

/**
 * Cumplimiento esperado del objetivo, calculado de forma independiente a la
 * implementación (espejo estructural de los predicados de `mission-outcome.ts`).
 */
function isObjectiveMetExpected(
  objective: MissionObjective,
  pieces: readonly OutcomePieceView[],
): boolean {
  const activeGerman = (p: OutcomePieceView): boolean =>
    p.side === "german" && p.status === "active";
  if (objective.kind === "eliminate-all-germans") {
    return !pieces.some(activeGerman);
  }
  if (objective.kind === "eliminate-single-revealed-german") {
    return !pieces.some((p) => activeGerman(p) && p.visibility === "revealed");
  }
  if (objective.kind === "destroy-artillery") {
    return !pieces.some((p) => activeGerman(p) && p.kind === ARTILLERY_KIND);
  }
  return pieces.some(
    (p) => p.side === "british" && p.status === "active" && p.hexId === objective.churchHexId,
  );
}
