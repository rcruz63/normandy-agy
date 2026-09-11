/**
 * Modelos de Estado de partida e Instantánea del dominio (Tarea 7.1).
 *
 * Este módulo fija las formas concretas de `GameState` y `GameSnapshot` según
 * el diseño (§ «Estado de partida y transición»). Son tipos `Readonly` puros:
 * no importan DOM, IndexedDB, red, reloj ni SDK de AWS.
 *
 * INVARIANTE CRÍTICA (requisitos 5.6, 21.1): `GameState` NUNCA contiene estado
 * de vista (zoom, paneo, Orientación de cámara, tamaño, posición de lectura,
 * selección de UI…). El estado de vista vive en la capa de interfaz
 * (`ViewState`, Tarea 20) y no participa en resultados de juego. Este archivo
 * modela exclusivamente estado de dominio.
 *
 * Frontera de tareas: varios campos de `GameState`/`GameSnapshot` se tipan aquí
 * con formas mínimas y estables del dominio del Motor (`DifficultySelection`,
 * `DurationSelection`, `PhaseId`, `ActivationState`, `PieceState`,
 * `UnknownState`, `ObjectiveState`, `ActiveEffect`). Son deliberadamente
 * opacas: el Estado de partida solo necesita referenciar estos conceptos, no
 * conocer su estructura interna, que modelan submódulos especializados
 * (geometría/ficha, aleatoriedad, reglas de Revelado/Misión). Mantenerlas aquí,
 * desacopladas de esos submódulos, preserva la jerarquía unidireccional del
 * dominio (`state` no depende de `rules`, `random` ni `geometry`) y evita
 * dependencias circulares. Los registros (`SimpleLogEntry`, `DetailedLogEntry`)
 * ya los aporta el submódulo `../logging`: se importan y reexportan desde aquí
 * para que `GameSnapshot` use los tipos reales sin cambiar su forma pública.
 *
 * Trazabilidad: el cableado de estas formas con los tipos concretos de otros
 * submódulos, si en el futuro conviene unificarlos, corresponde a las tareas de
 * cada dominio (5.x geometría/ficha, 6.x aleatoriedad, 11.x Revelado/Misión) y
 * debe hacerse preservando la forma pública de este módulo.
 */
import type {
  GameId,
  MissionId,
  RulesVersion,
  SaveVersion,
  SnapshotId,
} from "../identity/index.js";
import type {
  DetailedLogEntry,
  SimpleLogEntry,
} from "../logging/index.js";

// Reexporta los tipos reales de registro para consumidores de `state.js` que
// los importaban desde aquí (13.1: sustituye los antiguos alias mínimos).
export type { SimpleLogEntry, DetailedLogEntry } from "../logging/index.js";

// --- Formas de dominio referenciadas por el Estado de partida ---
// El Estado de partida referencia estos conceptos por su forma pública mínima;
// los submódulos especializados los modelan en detalle sin acoplar `state`.

/** Dificultad elegida para la Partida (su estructura la fija el catálogo/Motor). */
export type DifficultySelection = Readonly<{ id: string }>;
/** Duración elegida (variante base−1/base/base+1) expresada en turnos totales. */
export type DurationSelection = Readonly<{ turns: number }>;
/** Identificador de la Fase vigente del turno (p. ej. británica/alemana). */
export type PhaseId = string;
/** Estado de activación: la Ficha activa del jugador en curso, si la hay. */
export type ActivationState = Readonly<{ activePieceId?: string }>;
/**
 * Identificador de Ficha usado por el Estado del Motor.
 *
 * Es intencionadamente una cadena opaca local a este submódulo. El modelo de
 * geometría define su propio `PieceId` marcado ({@link module:geometry}); el
 * Motor no necesita esa marca para indexar fichas por clave, y mantenerlos
 * independientes evita que `state` dependa de `geometry`.
 */
export type PieceId = string;
/**
 * Vista mínima del estado de una Ficha desde el Estado del Motor: basta con que
 * cada Ficha se identifique por su clave. El modelo funcional completo de la
 * Ficha (bando, Hexágono, Orientación, Moral, Cobertura…) vive en
 * {@link module:geometry} y no lo necesita el contrato de `GameState`.
 */
export type PieceState = Readonly<{ pieceId: PieceId }>;
/** Estado de un elemento oculto pendiente de Revelado (visible u oculto). */
export type UnknownState = Readonly<{ hidden: boolean }>;
/** Estado de un objetivo de Misión: cumplido o no. */
export type ObjectiveState = Readonly<{ met: boolean }>;
/** Efecto activo en la Partida, discriminado por su `kind` canónico. */
export type ActiveEffect = Readonly<{ kind: string }>;

/**
 * Desenlace del Estado de partida.
 *
 * `in-progress` mientras la Partida avanza; `victory`/`defeat` al resolver la
 * Misión; `suspended` cuando un desempate pendiente (p. ej. DP-002) impide
 * continuar sin inventar reglas (requisitos 17.x, 18.x, 13.x).
 */
export type GameOutcome = "in-progress" | "victory" | "defeat" | "suspended";

/**
 * Estado de partida inmutable (diseño § Estado de partida y transición).
 *
 * Contiene únicamente estado de dominio. No incluye estado de vista.
 */
export type GameState = Readonly<{
  gameId: GameId;
  missionId: MissionId;
  rulesVersion: RulesVersion;
  saveVersion: SaveVersion;
  difficulty: DifficultySelection;
  duration: DurationSelection;
  turn: number;
  phase: PhaseId;
  activation: ActivationState;
  pieces: Readonly<Record<PieceId, PieceState>>;
  unknowns: Readonly<Record<string, UnknownState>>;
  objectives: Readonly<Record<string, ObjectiveState>>;
  effects: readonly ActiveEffect[];
  outcome: GameOutcome;
}>;

// --- Aleatoriedad e integridad embebidas en la Instantánea ---

/**
 * Estado aleatorio embebido en una {@link GameSnapshot}: Semilla opaca, posición
 * de secuencia y Versión del algoritmo aleatorio (requisito 19.2).
 *
 * `algorithmVersion` se tipa aquí como `string` para no acoplar el Estado de
 * partida al identificador marcado `RandomAlgorithmVersion` de
 * {@link module:random}; la máquina de aleatoriedad produce ese valor marcado y
 * es asignable a esta forma sin conversión. Mantener la forma aquí conserva la
 * jerarquía unidireccional (`state` no depende de `random`).
 */
export type RandomState = Readonly<{
  seed: string;
  position: number;
  algorithmVersion: string;
}>;

/**
 * Descriptor de integridad (algoritmo + valor) de un artefacto serializado.
 *
 * Este módulo es el hogar canónico del tipo: la persistencia (sobre versionado,
 * `BackupCodec`, exportación de recuperación) y el paquete offline lo reutilizan
 * importándolo desde aquí, sin duplicarlo. Detecta alteración accidental
 * (requisito 22); no es firma ni cifrado.
 */
export type IntegrityDescriptor = Readonly<{ algorithm: string; value: string }>;

/**
 * Instantánea confirmable de una Partida (diseño § Estado de partida y
 * transición).
 *
 * `confirmedAt` lo aporta la capa de aplicación tras resolver el dominio y no
 * participa en resultados de juego. `previousSnapshotId` se omite en la
 * Instantánea inicial (`exactOptionalPropertyTypes`).
 */
export type GameSnapshot = Readonly<{
  id: SnapshotId;
  gameId: GameId;
  previousSnapshotId?: SnapshotId;
  confirmedAt: string;
  state: GameState;
  randomState: RandomState;
  simpleLog: readonly SimpleLogEntry[];
  detailedLog: readonly DetailedLogEntry[];
  integrity: IntegrityDescriptor;
}>;

/** Error lanzado por los constructores de este módulo ante datos inválidos. */
export class InvalidGameStateError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Estado de partida inválido en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidGameStateError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function assertNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidGameStateError(
      field,
      value,
      "debe ser un entero no negativo",
    );
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidGameStateError(field, value, "no puede estar vacío");
  }
}

/** Entrada de {@link gameState}; refleja exactamente los campos del diseño. */
export type GameStateInput = GameState;

/**
 * Construye un {@link GameState} inmutable validando invariantes locales.
 *
 * Comprobaciones: `turn` entero no negativo, `phase` no vacío, `outcome` dentro
 * del conjunto permitido. No se validan aquí invariantes de reglas de más alto
 * nivel: eso corresponde a `InvariantValidator` (Tarea 7.2).
 */
export function gameState(input: GameStateInput): GameState {
  assertNonNegativeInteger("turn", input.turn);
  assertNonEmpty("phase", input.phase);

  const allowed: readonly GameOutcome[] = [
    "in-progress",
    "victory",
    "defeat",
    "suspended",
  ];
  if (!allowed.includes(input.outcome)) {
    throw new InvalidGameStateError(
      "outcome",
      input.outcome,
      "debe ser in-progress|victory|defeat|suspended",
    );
  }

  return Object.freeze({
    gameId: input.gameId,
    missionId: input.missionId,
    rulesVersion: input.rulesVersion,
    saveVersion: input.saveVersion,
    difficulty: input.difficulty,
    duration: input.duration,
    turn: input.turn,
    phase: input.phase,
    activation: input.activation,
    pieces: input.pieces,
    unknowns: input.unknowns,
    objectives: input.objectives,
    effects: input.effects,
    outcome: input.outcome,
  });
}

/** Entrada de {@link gameSnapshot}; `previousSnapshotId` es opcional. */
export type GameSnapshotInput = GameSnapshot;

/**
 * Construye un {@link GameSnapshot} inmutable.
 *
 * Valida coherencia mínima: el `gameId` de la Instantánea coincide con el del
 * Estado que envuelve, `confirmedAt` no está vacío y `previousSnapshotId`, si
 * existe, difiere de `id`.
 */
export function gameSnapshot(input: GameSnapshotInput): GameSnapshot {
  if (input.gameId !== input.state.gameId) {
    throw new InvalidGameStateError(
      "gameId",
      input.gameId,
      "debe coincidir con el gameId del estado envuelto",
    );
  }
  assertNonEmpty("confirmedAt", input.confirmedAt);
  if (
    input.previousSnapshotId !== undefined &&
    input.previousSnapshotId === input.id
  ) {
    throw new InvalidGameStateError(
      "previousSnapshotId",
      input.previousSnapshotId,
      "no puede ser igual al id de la propia Instantánea",
    );
  }

  const base = {
    id: input.id,
    gameId: input.gameId,
    confirmedAt: input.confirmedAt,
    state: input.state,
    randomState: input.randomState,
    simpleLog: input.simpleLog,
    detailedLog: input.detailedLog,
    integrity: input.integrity,
  };

  if (input.previousSnapshotId !== undefined) {
    return Object.freeze({
      ...base,
      previousSnapshotId: input.previousSnapshotId,
    });
  }
  return Object.freeze(base);
}
