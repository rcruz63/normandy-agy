/**
 * `InvariantValidator`: validación pura de las Invariantes funcionales del
 * dominio (Tarea 7.2, requisitos 21.1, 21.2, 21.4).
 *
 * El Motor de reglas solo debe aceptar acciones que mantengan las Invariantes
 * declaradas por los Datos canónicos (21.1). Este módulo comprueba una
 * Instantánea o una propuesta de transición y produce un resultado
 * estructurado: cuando una propuesta rompe una Invariante, el resultado es
 * `invalid-proposal` (taxonomía del diseño § Error Handling), de modo que la
 * capa de aplicación descarte la propuesta y restaure la última Instantánea
 * confirmada (21.4). El vocabulario se alinea con las decisiones de transición
 * (`rejected` / `blocked` / `stopped-after-consumption`) donde procede.
 *
 * Comprobaciones (diseño § Motor de reglas, submódulo `InvariantValidator`):
 * - Integridad referencial: los identificadores citados por el estado existen.
 * - Ocupación: la ficha activa está registrada; sin fichas duplicadas.
 * - Estado de fichas: cada `PieceState` referencia su propia clave.
 * - Secuencias: registros con secuencia consecutiva y sin huecos.
 * - Registros: coherencia entre Registro simple y detallado.
 * - Aleatoriedad: posición no negativa, `algorithmVersion` presente y, entre
 *   Instantánea previa y siguiente, avance monótono acotado por el modo.
 * - Desenlace: coherencia entre `outcome` y desenlace terminal.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. Todos los tipos son `Readonly`. Los mensajes visibles se transportan por
 * `messageKey` (`es-ES`), nunca como texto interpolado en el dominio.
 */
import type {
  GameSnapshot,
  GameState,
  RandomState,
  SimpleLogEntry,
  DetailedLogEntry,
} from "../engine/state.js";
import type {
  DomainMessage,
  TransitionProposal,
} from "../engine/transition.js";

/**
 * Categoría de la Invariante comprobada. Permite agrupar diagnósticos por área
 * (diseño: «referencias, ocupación, estado de fichas, secuencias, registros,
 * aleatoriedad y demás invariantes»).
 */
export type InvariantCategory =
  | "reference"
  | "occupancy"
  | "piece-state"
  | "sequence"
  | "log"
  | "randomness"
  | "outcome"
  | "rules-version";

/**
 * Violación concreta de una Invariante. `path` localiza el campo afectado (p.
 * ej. `state.activation.activePieceId`); `messageKey` identifica la explicación
 * `es-ES` (21.3) y `params` transporta datos para interpolar sin acoplar el
 * dominio al idioma.
 */
export type InvariantViolation = Readonly<{
  category: InvariantCategory;
  path: string;
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Resultado de validación de una Instantánea o de una propuesta.
 *
 * - `valid`: la Instantánea/propuesta mantiene todas las Invariantes.
 * - `invalid-proposal`: una propuesta del Motor rompe una Invariante; la capa
 *   de aplicación debe descartarla y restaurar la última Instantánea
 *   confirmada (diseño § Error Handling, 21.4). Incluye un diagnóstico
 *   `es-ES` y la lista de violaciones.
 */
export type InvariantResult =
  | Readonly<{ kind: "valid" }>
  | Readonly<{
      kind: "invalid-proposal";
      diagnostic: DomainMessage;
      violations: readonly InvariantViolation[];
    }>;

/** Desenlaces terminales: un estado terminal no debe seguir avanzando. */
const TERMINAL_OUTCOMES: readonly GameState["outcome"][] = [
  "victory",
  "defeat",
];

function violation(
  category: InvariantCategory,
  path: string,
  messageKey: string,
  params?: Readonly<Record<string, string | number>>,
): InvariantViolation {
  return Object.freeze(
    params === undefined
      ? { category, path, messageKey }
      : { category, path, messageKey, params },
  );
}

/**
 * Comprueba la integridad referencial y de ocupación del Estado de partida.
 *
 * - La ficha activa (si existe) debe estar registrada en `pieces` (ocupación).
 * - Cada entrada de `pieces` debe referenciar su propia clave (estado de
 *   fichas): `pieces[k].pieceId === k`.
 */
function checkStateReferences(
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
 * empezando en `1`, sin huecos ni repeticiones (requisito 20.x/21.1: registros
 * ordenados por Partida). Devuelve las violaciones detectadas.
 */
function checkLogSequence(
  entries: readonly (SimpleLogEntry | DetailedLogEntry)[],
  path: string,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  entries.forEach((entry, index) => {
    const expected = index + 1;
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
function checkRandomState(
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
function checkSnapshot(
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
  violations.push(...checkRandomState(snapshot.randomState, "snapshot.randomState"));

  return violations;
}

/**
 * Valida las Invariantes de una única Instantánea (p. ej. la inicial de una
 * Partida o una recién importada).
 */
export function validateSnapshot(snapshot: GameSnapshot): InvariantResult {
  const violations = checkSnapshot(snapshot);
  return toResult(violations);
}

/**
 * Valida una {@link TransitionProposal} respecto de la Instantánea previa.
 *
 * Además de las Invariantes intrínsecas de la Instantánea resultante, comprueba
 * las Invariantes de transición que dependen del modo (diseño § Motor de
 * reglas y tabla de decisiones):
 *
 * - `previous` debe ser la Instantánea sobre la que se calculó la propuesta:
 *   `previous.id === proposal.expectedSnapshotId`.
 * - El desenlace de `previous` no puede ser terminal (una Partida resuelta no
 *   avanza).
 * - Avance del Estado aleatorio:
 *   - `complete`: la posición no puede retroceder respecto de `previous`.
 *   - `stopped-after-consumption`: debe avanzar EXACTAMENTE una posición
 *     (13.7, 17.6: se conserva el Consumo efectuado y no se aplica efecto
 *     incompleto).
 * - Continuidad de secuencia: los registros de `next` extienden (o igualan) la
 *   longitud de los de `previous`, nunca la reducen.
 *
 * Si alguna Invariante se rompe, el resultado es `invalid-proposal`.
 */
export function validateProposal(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): InvariantResult {
  const violations: InvariantViolation[] = [];

  // Coherencia con la Instantánea esperada.
  if (previous.id !== proposal.expectedSnapshotId) {
    violations.push(
      violation(
        "reference",
        "proposal.expectedSnapshotId",
        "invariant.reference.expectedSnapshotMismatch",
        { expected: proposal.expectedSnapshotId, actual: previous.id },
      ),
    );
  }

  // Una Partida resuelta no puede volver a avanzar.
  if (TERMINAL_OUTCOMES.includes(previous.state.outcome)) {
    violations.push(
      violation(
        "outcome",
        "previous.state.outcome",
        "invariant.outcome.advanceAfterTerminal",
        { outcome: previous.state.outcome },
      ),
    );
  }

  // La Instantánea resultante debe enlazar hacia la previa.
  if (
    proposal.next.previousSnapshotId !== undefined &&
    proposal.next.previousSnapshotId !== previous.id
  ) {
    violations.push(
      violation(
        "reference",
        "proposal.next.previousSnapshotId",
        "invariant.reference.brokenChain",
        {
          expected: previous.id,
          actual: proposal.next.previousSnapshotId,
        },
      ),
    );
  }

  // Invariantes intrínsecas de la Instantánea resultante.
  violations.push(...checkSnapshot(proposal.next));

  // Avance del Estado aleatorio según el modo.
  const before = previous.randomState.position;
  const after = proposal.next.randomState.position;
  if (Number.isInteger(before) && Number.isInteger(after)) {
    if (proposal.mode === "stopped-after-consumption") {
      if (after !== before + 1) {
        violations.push(
          violation(
            "randomness",
            "proposal.next.randomState.position",
            "invariant.randomness.stoppedConsumptionStep",
            { before, after },
          ),
        );
      }
    } else if (after < before) {
      // `complete`: nunca retrocede el Estado aleatorio.
      violations.push(
        violation(
          "randomness",
          "proposal.next.randomState.position",
          "invariant.randomness.positionRegressed",
          { before, after },
        ),
      );
    }
  }

  // Continuidad de secuencia: los registros no se acortan.
  if (proposal.next.simpleLog.length < previous.simpleLog.length) {
    violations.push(
      violation(
        "log",
        "proposal.next.simpleLog",
        "invariant.log.simpleLogShrank",
        {
          before: previous.simpleLog.length,
          after: proposal.next.simpleLog.length,
        },
      ),
    );
  }
  if (proposal.next.detailedLog.length < previous.detailedLog.length) {
    violations.push(
      violation(
        "log",
        "proposal.next.detailedLog",
        "invariant.log.detailedLogShrank",
        {
          before: previous.detailedLog.length,
          after: proposal.next.detailedLog.length,
        },
      ),
    );
  }

  return toResult(violations);
}

/** Convierte una lista de violaciones en el resultado estructurado. */
function toResult(
  violations: readonly InvariantViolation[],
): InvariantResult {
  if (violations.length === 0) {
    return Object.freeze({ kind: "valid" });
  }
  const diagnostic: DomainMessage = Object.freeze({
    messageKey: "invariant.invalidProposal",
    params: Object.freeze({ count: violations.length }),
  });
  return Object.freeze({
    kind: "invalid-proposal",
    diagnostic,
    violations: Object.freeze([...violations]),
  });
}
