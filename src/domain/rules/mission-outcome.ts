/**
 * `MissionOutcome`: evaluación del desenlace de una Misión (Tarea 11.2,
 * requisitos 18.1, 18.2, 18.3, 18.4, 32.6, 32.7, 32.11).
 *
 * Alcance verificado:
 *
 * - VICTORIA HASTA EL ÚLTIMO TURNO INCLUSIVE (18.1, 32.6): la victoria se
 *   declara SOLO si el objetivo de la Misión seleccionada se cumple hasta la
 *   conclusión del último turno disponible INCLUSIVE. Mientras el objetivo se
 *   cumpla en cualquier momento no posterior al último turno, hay victoria.
 *
 * - DERROTA AL CONCLUIR SIN CUMPLIR (32.7): si concluye el último turno
 *   disponible sin que el objetivo se haya cumplido, se declara la derrota.
 *
 * - PARTIDA EN CURSO: mientras no haya concluido el último turno y el objetivo
 *   no esté cumplido, la Partida sigue en curso (`ongoing`): ni victoria ni
 *   derrota todavía.
 *
 * - SOLO EL OBJETIVO DE LA MISIÓN SELECCIONADA (32.11): la evaluación aplica
 *   ÚNICAMENTE el objetivo tipado asociado con la Misión seleccionada
 *   (`MissionObjective` de `mission-setup.ts`). No se evalúan objetivos de otras
 *   Misiones.
 *
 * - SUSPENSIÓN POR PRECEDENCIA NO RESUELTA (18.2, 18.4): si varias condiciones
 *   finales se cumplen simultáneamente y la precedencia canónica NO está
 *   resuelta, se SUSPENDE el cierre sin modificar el resultado de la Partida ni
 *   consumir azar. Este módulo NUNCA llama a `VersionedRandom`; toda la
 *   evaluación es pura. El registro de la entrada DP-002 asociada (18.5) lo
 *   realiza la capa superior con la señal de suspensión que este módulo emite.
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). Recibe una VISTA ESTRUCTURAL del estado
 * (Fichas, turno, último turno, conclusión) que la capa de aplicación adapta
 * desde `GameState`. La regla de precedencia canónica se recibe como entrada
 * (`unresolvedPrecedence`) desde los Datos canónicos; no se inventa aquí.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos.
 */
import type { HexId } from "../geometry/identifiers.js";
import type { MissionObjective } from "./mission-setup.js";

// ---------------------------------------------------------------------------
// Vista estructural del estado para evaluar el desenlace
// ---------------------------------------------------------------------------

/**
 * Vista mínima de una Ficha para evaluar el objetivo (18.1). Espeja los campos
 * de `PieceState` que intervienen en las condiciones de victoria: bando,
 * visibilidad, estado, tipo canónico y Hexágono ocupado. La capa de aplicación
 * la adapta desde `PieceState`; el dominio del desenlace no depende del modelo
 * de mapa completo.
 */
export type OutcomePieceView = Readonly<{
  side: "british" | "german" | "neutral";
  visibility: "hidden" | "revealed";
  status: "active" | "eliminated";
  /** Tipo canónico de la Unidad (p. ej. «artillery»); usado por objetivos concretos. */
  kind?: string;
  /** Hexágono ocupado, si la Ficha está en el tablero. */
  hexId?: HexId;
}>;

/**
 * Vista estructural del estado de partida para evaluar el desenlace.
 *
 * `currentTurn` es el turno en curso; `lastAvailableTurn` es la duración
 * disponible (32.4/32.6). `currentTurnConcluded` indica si el turno en curso ya
 * ha concluido: solo entonces puede declararse la derrota del último turno
 * (32.7).
 */
export type OutcomeStateView = Readonly<{
  pieces: readonly OutcomePieceView[];
  currentTurn: number;
  lastAvailableTurn: number;
  currentTurnConcluded: boolean;
}>;

/** Tipo canónico de la Artillería alemana para el objetivo de la Misión 11. */
export const ARTILLERY_KIND: string = "artillery";

// ---------------------------------------------------------------------------
// Resultado de la evaluación (18.1, 18.4, 32.6, 32.7)
// ---------------------------------------------------------------------------

/**
 * Motivo por el que no puede evaluarse el objetivo `occupy-church-hex`: la
 * ubicación del Hexágono de la iglesia depende de DP-001 y permanece en Estado
 * no publicable (33.8). Sin `churchHexId` resuelto, la ocupación no es
 * evaluable y la Partida no puede cerrarse por este objetivo.
 */
export type UnevaluableReason = "church-hex-unresolved";

/**
 * Resultado de evaluar el desenlace de una Misión (18.1).
 *
 * - `victory`: el objetivo de la Misión seleccionada está cumplido hasta el
 *   último turno inclusive (18.1, 32.6).
 * - `defeat`: concluyó el último turno disponible sin cumplirse el objetivo
 *   (32.7).
 * - `ongoing`: el objetivo no está cumplido pero aún no ha concluido el último
 *   turno; la Partida continúa.
 * - `suspended`: varias condiciones finales se cumplen simultáneamente y la
 *   precedencia no está resuelta; el cierre se suspende sin modificar el
 *   resultado (18.4). También cubre un objetivo no evaluable por DP-001
 *   pendiente (`reason`), que impide cerrar sin inventar reglas.
 */
export type OutcomeEvaluation =
  | Readonly<{ kind: "victory" }>
  | Readonly<{ kind: "defeat" }>
  | Readonly<{ kind: "ongoing" }>
  | Readonly<{ kind: "suspended"; reason: UnevaluableReason | "unresolved-precedence" }>;

// ---------------------------------------------------------------------------
// Petición de evaluación
// ---------------------------------------------------------------------------

/**
 * Petición de evaluación del desenlace. Aplica ÚNICAMENTE `objective` (32.11).
 *
 * `unresolvedPrecedence` señala, desde los Datos canónicos, que varias
 * condiciones finales se cumplen simultáneamente sin precedencia resuelta
 * (18.2, 18.4); cuando es `true`, el cierre se suspende. Es responsabilidad de
 * la capa de aplicación aportar esta señal a partir del catálogo; el dominio no
 * la deduce.
 */
export type OutcomeRequest = Readonly<{
  objective: MissionObjective;
  state: OutcomeStateView;
  /** Precedencia canónica sin resolver ante condiciones finales simultáneas (18.4). */
  unresolvedPrecedence?: boolean;
}>;

// ---------------------------------------------------------------------------
// Predicados de cumplimiento del objetivo (32.11)
// ---------------------------------------------------------------------------

/** ¿Es una Unidad alemana (revelada u oculta) en el tablero? */
function isGermanUnit(piece: OutcomePieceView): boolean {
  return piece.side === "german";
}

/** ¿Sigue activa (no eliminada) la Ficha? */
function isActive(piece: OutcomePieceView): boolean {
  return piece.status === "active";
}

/**
 * Objetivo `eliminate-all-germans` (mayoría de Misiones): se cumple cuando no
 * queda ninguna Unidad alemana activa (revelada o aún oculta) en el tablero.
 */
function allGermansEliminated(pieces: readonly OutcomePieceView[]): boolean {
  return !pieces.some((piece) => isGermanUnit(piece) && isActive(piece));
}

/**
 * Objetivo `eliminate-single-revealed-german` (Misión 1): se cumple cuando la
 * única Unidad alemana revelada ha sido eliminada, es decir, no queda ninguna
 * Unidad alemana revelada activa.
 */
function singleRevealedGermanEliminated(pieces: readonly OutcomePieceView[]): boolean {
  return !pieces.some(
    (piece) => isGermanUnit(piece) && piece.visibility === "revealed" && isActive(piece),
  );
}

/**
 * Objetivo `destroy-artillery` (Misión 11): se cumple cuando ninguna Artillería
 * alemana permanece activa.
 */
function artilleryDestroyed(pieces: readonly OutcomePieceView[]): boolean {
  return !pieces.some(
    (piece) => isGermanUnit(piece) && piece.kind === ARTILLERY_KIND && isActive(piece),
  );
}

/**
 * Objetivo `occupy-church-hex` (Misiones 8 y 14): se cumple cuando alguna
 * Unidad británica activa ocupa el Hexágono de la iglesia. Requiere
 * `churchHexId` resuelto; sin él la ocupación no es evaluable.
 */
function churchHexOccupied(
  pieces: readonly OutcomePieceView[],
  churchHexId: HexId,
): boolean {
  return pieces.some(
    (piece) => piece.side === "british" && isActive(piece) && piece.hexId === churchHexId,
  );
}

/**
 * Evalúa el cumplimiento del objetivo de la Misión seleccionada (32.11).
 *
 * Devuelve `true`/`false` cuando el objetivo es evaluable, o
 * `"church-hex-unresolved"` cuando `occupy-church-hex` no puede evaluarse por
 * DP-001 pendiente (Estado no publicable, 33.8).
 */
function isObjectiveMet(
  objective: MissionObjective,
  pieces: readonly OutcomePieceView[],
): boolean | UnevaluableReason {
  if (objective.kind === "eliminate-all-germans") {
    return allGermansEliminated(pieces);
  }
  if (objective.kind === "eliminate-single-revealed-german") {
    return singleRevealedGermanEliminated(pieces);
  }
  if (objective.kind === "destroy-artillery") {
    return artilleryDestroyed(pieces);
  }
  if (objective.churchHexId === undefined) {
    return "church-hex-unresolved";
  }
  return churchHexOccupied(pieces, objective.churchHexId);
}

// ---------------------------------------------------------------------------
// Evaluación del desenlace (18.1, 18.4, 32.6, 32.7, 32.11)
// ---------------------------------------------------------------------------

/**
 * ¿Ha concluido el último turno disponible? (32.7). Solo entonces puede
 * declararse la derrota. El último turno se considera concluido cuando el turno
 * en curso alcanza o supera la duración disponible y ese turno ya ha concluido.
 */
function lastTurnConcluded(state: OutcomeStateView): boolean {
  return state.currentTurnConcluded && state.currentTurn >= state.lastAvailableTurn;
}

/**
 * Evalúa el desenlace de una Misión aplicando ÚNICAMENTE el objetivo de la
 * Misión seleccionada (32.11):
 *
 * 1. Si la precedencia canónica no está resuelta ante condiciones finales
 *    simultáneas, SUSPENDE el cierre sin tocar el resultado ni consumir azar
 *    (18.2, 18.4).
 * 2. Si el objetivo no es evaluable por DP-001 pendiente, SUSPENDE el cierre
 *    (Estado no publicable, 33.8).
 * 3. Si el objetivo está cumplido (hasta el último turno inclusive), declara la
 *    VICTORIA (18.1, 32.6).
 * 4. Si concluyó el último turno disponible sin cumplirse, declara la DERROTA
 *    (32.7).
 * 5. En otro caso, la Partida sigue en curso (`ongoing`).
 *
 * Función pura: no muta la petición y no consume azar (18.4).
 */
export function evaluateOutcome(request: OutcomeRequest): OutcomeEvaluation {
  if (request.unresolvedPrecedence === true) {
    return Object.freeze({ kind: "suspended", reason: "unresolved-precedence" });
  }
  const met = isObjectiveMet(request.objective, request.state.pieces);
  if (met === "church-hex-unresolved") {
    return Object.freeze({ kind: "suspended", reason: "church-hex-unresolved" });
  }
  if (met) {
    return Object.freeze({ kind: "victory" });
  }
  if (lastTurnConcluded(request.state)) {
    return Object.freeze({ kind: "defeat" });
  }
  return Object.freeze({ kind: "ongoing" });
}
