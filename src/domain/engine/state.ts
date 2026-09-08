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
 * Nota de frontera de tareas: varios tipos referenciados por el diseño
 * (`DifficultySelection`, `DurationSelection`, `PhaseId`, `ActivationState`,
 * `PieceState`, `UnknownState`, `ObjectiveState`, `ActiveEffect`,
 * `RandomState`, `SimpleLogEntry`, `DetailedLogEntry`, `IntegrityDescriptor`)
 * los definen tareas paralelas o posteriores (5.x geometría/ficha, 6.x
 * aleatoriedad, 13.x registros, 15.x/16.x persistencia). Para no colisionar con
 * esas tareas se declaran aquí como alias mínimos y opacos, y el cableado real
 * se hará en tareas 8.x/13.x/15.x. Cada alias lleva su TODO.
 */
import type {
  GameId,
  MissionId,
  RulesVersion,
  SaveVersion,
  SnapshotId,
} from "../identity/index.js";

// --- Alias mínimos hacia modelos de tareas paralelas/posteriores ---
// TODO(8.x): sustituir por el modelo de dificultad del catálogo/motor.
export type DifficultySelection = Readonly<{ id: string }>;
// TODO(11.x): sustituir por la selección de duración (base−1/base/base+1).
export type DurationSelection = Readonly<{ turns: number }>;
// TODO(8.x/9.x): sustituir por el identificador de fase canónico.
export type PhaseId = string;
// TODO(9.x): sustituir por el estado de activación real (unidad activa, etc.).
export type ActivationState = Readonly<{ activePieceId?: string }>;
// TODO(5.1): identificador de ficha; lo define el modelo de mapa/ficha.
export type PieceId = string;
// TODO(5.1): sustituir por `PieceState` real del modelo de ficha (Tarea 5.1).
export type PieceState = Readonly<{ pieceId: PieceId }>;
// TODO(11.1): sustituir por `UnknownState` del resolutor de Revelado.
export type UnknownState = Readonly<{ hidden: boolean }>;
// TODO(11.2): sustituir por `ObjectiveState` del resolutor de Misión.
export type ObjectiveState = Readonly<{ met: boolean }>;
// TODO(8.x/10.x): sustituir por `ActiveEffect` de los submódulos de reglas.
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

// --- Alias mínimos de aleatoriedad y registros ---
// TODO(6.1): sustituir por `RandomState` de `src/domain/random/` (Tarea 6.1).
export type RandomState = Readonly<{
  seed: string;
  position: number;
  algorithmVersion: string;
}>;
// TODO(13.1): sustituir por `SimpleLogEntry` del proyector de registros.
export type SimpleLogEntry = Readonly<{ sequence: number; messageKey: string }>;
// TODO(13.1): sustituir por `DetailedLogEntry` del proyector de registros.
export type DetailedLogEntry = Readonly<{ sequence: number; messageKey: string }>;
// TODO(16.1): sustituir por `IntegrityDescriptor` del `BackupCodec` (Tarea 16.1).
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
