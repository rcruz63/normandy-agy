/**
 * Comprobaciones de las Invariantes de TRANSICIÓN de una propuesta (Tarea 7.2).
 *
 * A diferencia de `./snapshot-checks.js` (Invariantes intrínsecas de una sola
 * Instantánea), este submódulo compara la propuesta con la Instantánea PREVIA:
 * coherencia con la Instantánea esperada, no avanzar tras un desenlace terminal,
 * encadenamiento correcto, avance del Estado aleatorio según el modo y no
 * acortar los registros. Cada comprobación es una función pura y atómica que
 * devuelve las violaciones detectadas, para que el validador las componga.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. Todos los tipos son `Readonly`.
 */
import type { GameSnapshot, GameState } from "../engine/state.js";
import type { TransitionProposal } from "../engine/transition.js";
import {
  violation,
  type InvariantViolation,
} from "./invariant-violation.js";

/** Desenlaces terminales: un estado terminal no debe seguir avanzando. */
const TERMINAL_OUTCOMES: readonly GameState["outcome"][] = [
  "victory",
  "defeat",
];

/** Avance de posición aleatoria exigido a una detención tras consumo (13.7, 17.6). */
const STOPPED_CONSUMPTION_STEP = 1;

/**
 * Coherencia con la Instantánea esperada: `previous` debe ser aquella sobre la
 * que se calculó la propuesta (`previous.id === proposal.expectedSnapshotId`).
 */
export function checkExpectedSnapshot(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): readonly InvariantViolation[] {
  if (previous.id === proposal.expectedSnapshotId) return [];
  return [
    violation(
      "reference",
      "proposal.expectedSnapshotId",
      "invariant.reference.expectedSnapshotMismatch",
      { expected: proposal.expectedSnapshotId, actual: previous.id },
    ),
  ];
}

/** Una Partida con desenlace terminal no puede volver a avanzar. */
export function checkNotTerminal(
  previous: GameSnapshot,
): readonly InvariantViolation[] {
  if (!TERMINAL_OUTCOMES.includes(previous.state.outcome)) return [];
  return [
    violation(
      "outcome",
      "previous.state.outcome",
      "invariant.outcome.advanceAfterTerminal",
      { outcome: previous.state.outcome },
    ),
  ];
}

/**
 * La Instantánea resultante debe encadenar hacia la previa: si declara
 * `previousSnapshotId`, ha de ser el id de `previous`.
 */
export function checkChainLink(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): readonly InvariantViolation[] {
  const link = proposal.next.previousSnapshotId;
  if (link === undefined || link === previous.id) return [];
  return [
    violation(
      "reference",
      "proposal.next.previousSnapshotId",
      "invariant.reference.brokenChain",
      { expected: previous.id, actual: link },
    ),
  ];
}

/**
 * Avance del Estado aleatorio según el modo (diseño § Motor de reglas):
 * - `stopped-after-consumption`: debe avanzar EXACTAMENTE una posición.
 * - `complete`: la posición no puede retroceder.
 *
 * Solo se comprueba cuando ambas posiciones son enteras; las posiciones no
 * enteras las detecta `checkRandomState` sobre la Instantánea resultante.
 */
export function checkRandomAdvance(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): readonly InvariantViolation[] {
  const before = previous.randomState.position;
  const after = proposal.next.randomState.position;
  if (!Number.isInteger(before) || !Number.isInteger(after)) return [];

  if (proposal.mode === "stopped-after-consumption") {
    if (after === before + STOPPED_CONSUMPTION_STEP) return [];
    return [
      violation(
        "randomness",
        "proposal.next.randomState.position",
        "invariant.randomness.stoppedConsumptionStep",
        { before, after },
      ),
    ];
  }

  if (after >= before) return [];
  return [
    violation(
      "randomness",
      "proposal.next.randomState.position",
      "invariant.randomness.positionRegressed",
      { before, after },
    ),
  ];
}

/** Continuidad de secuencia: los registros de `next` no se acortan respecto de `previous`. */
export function checkLogsNotShrunk(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  if (proposal.next.simpleLog.length < previous.simpleLog.length) {
    violations.push(
      violation("log", "proposal.next.simpleLog", "invariant.log.simpleLogShrank", {
        before: previous.simpleLog.length,
        after: proposal.next.simpleLog.length,
      }),
    );
  }
  if (proposal.next.detailedLog.length < previous.detailedLog.length) {
    violations.push(
      violation("log", "proposal.next.detailedLog", "invariant.log.detailedLogShrank", {
        before: previous.detailedLog.length,
        after: proposal.next.detailedLog.length,
      }),
    );
  }
  return violations;
}
