/**
 * Comprobaciones de las Invariantes intrínsecas de una Instantánea (Tarea 7.2).
 *
 * Agrupa las comprobaciones que dependen SOLO de una Instantánea (o del Estado
 * de partida que envuelve): integridad referencial, ocupación, estado de fichas,
 * continuidad de secuencia de registros y Estado aleatorio. Las Invariantes de
 * TRANSICIÓN (que comparan dos Instantáneas) viven en `./proposal-checks.js`.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. Todos los tipos son `Readonly`.
 */
import type {
  DetailedLogEntry,
  GameSnapshot,
  GameState,
  RandomState,
  SimpleLogEntry,
} from "../engine/state.js";
import {
  violation,
  type InvariantViolation,
} from "./invariant-violation.js";

/** Secuencia esperada de la primera entrada de un registro (base 1). */
const FIRST_LOG_SEQUENCE = 1;

/**
 * Comprueba la integridad referencial y de ocupación del Estado de partida.
 *
 * - La ficha activa (si existe) debe estar registrada en `pieces` (ocupación).
 * - Cada entrada de `pieces` debe referenciar su propia clave (estado de
 *   fichas): `pieces[k].pieceId === k`.
 */
export function checkStateReferences(
  state: GameState,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const activePieceId = state.activation.activePieceId;
  if (
    activePieceId !== undefined &&
    !Object.prototype.hasOwnProperty.call(state.pieces, activePieceId)
  ) {
    violations.push(
      violation(
        "occupancy",
        "state.activation.activePieceId",
        "invariant.reference.activePieceMissing",
        { pieceId: activePieceId },
      ),
    );
  }

  for (const [key, piece] of Object.entries(state.pieces)) {
    if (piece.pieceId !== key) {
      violations.push(
        violation(
          "piece-state",
          `state.pieces.${key}.pieceId`,
          "invariant.pieceState.keyMismatch",
          { key, pieceId: piece.pieceId },
        ),
      );
    }
  }

  return violations;
}

/**
 * Comprueba que una lista de entradas de registro tenga secuencia consecutiva
 * empezando en `FIRST_LOG_SEQUENCE`, sin huecos ni repeticiones (requisito
 * 20.x/21.1: registros ordenados por Partida). Devuelve las violaciones.
 */
export function checkLogSequence(
  entries: readonly (SimpleLogEntry | DetailedLogEntry)[],
  path: string,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  entries.forEach((entry, index) => {
    const expected = index + FIRST_LOG_SEQUENCE;
    if (entry.sequence !== expected) {
      violations.push(
        violation(
          "sequence",
          `${path}[${index}].sequence`,
          "invariant.sequence.nonConsecutive",
          { expected, actual: entry.sequence },
        ),
      );
    }
  });
  return violations;
}

/**
 * Comprueba las Invariantes del Estado aleatorio de una sola Instantánea:
 * posición entera no negativa y `algorithmVersion` no vacío (requisito 19.x).
 */
export function checkRandomState(
  random: RandomState,
  path: string,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  if (!Number.isInteger(random.position) || random.position < 0) {
    violations.push(
      violation(
        "randomness",
        `${path}.position`,
        "invariant.randomness.invalidPosition",
        { position: random.position },
      ),
    );
  }
  if (
    typeof random.algorithmVersion !== "string" ||
    random.algorithmVersion.trim().length === 0
  ) {
    violations.push(
      violation(
        "randomness",
        `${path}.algorithmVersion`,
        "invariant.randomness.missingAlgorithmVersion",
      ),
    );
  }
  return violations;
}

/** Comprueba una Instantánea completa (estado, registros y aleatoriedad). */
export function checkSnapshot(
  snapshot: GameSnapshot,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // Integridad referencial: el gameId de la Instantánea coincide con el estado.
  if (snapshot.gameId !== snapshot.state.gameId) {
    violations.push(
      violation(
        "reference",
        "snapshot.gameId",
        "invariant.reference.gameIdMismatch",
      ),
    );
  }

  violations.push(...checkStateReferences(snapshot.state));
  violations.push(...checkLogSequence(snapshot.simpleLog, "snapshot.simpleLog"));
  violations.push(
    ...checkLogSequence(snapshot.detailedLog, "snapshot.detailedLog"),
  );
  violations.push(
    ...checkRandomState(snapshot.randomState, "snapshot.randomState"),
  );

  return violations;
}
