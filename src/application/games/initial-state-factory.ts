/**
 * Fábrica de la Instantánea inicial de una Partida (Tarea 15.3, requisitos 5.1,
 * 5.6, 17.8, 19.1, 19.2).
 *
 * Traduce la preparación fiel de una Misión ({@link MissionSetup}, Tarea 11.2)
 * al Estado de partida inicial y a la ÚNICA Instantánea inicial que la creación
 * confirma. El dominio ya decide QUÉ incluye la preparación (duración, Fuerzas,
 * Unidades fijas reveladas, objetivo tipado, tabla); esta fábrica solo compone
 * el {@link GameSnapshot} inicial con esa preparación y los valores INYECTADOS
 * de la capa de aplicación (Semilla, reloj, generador de identificadores).
 *
 * ESTADO NO PUBLICABLE (DP-001/DP-002/DP-003): la preparación de dominio NO
 * fabrica posiciones ni Orientaciones visuales (bloqueadas). Por ello el Estado
 * inicial no incluye colocación de Fichas ni Incógnitas: se construye con lo que
 * EXISTE de forma coherente (turno 1, fase británica, objetivo pendiente) y deja
 * el enganche de la colocación para cuando esas decisiones se desbloqueen. No se
 * inventan coordenadas ni contenido bloqueado.
 *
 * FRONTERA DE CAPAS: vive en `application/`. No interpreta reglas (reutiliza la
 * preparación del dominio) ni accede a IndexedDB/DOM/red. El reloj, el
 * generador de identificadores y la Semilla llegan por INYECCIÓN para no leer
 * `Date` ni `Math.random` y garantizar reproducibilidad (requisitos 19.1, 19.7).
 */
import type {
  GameId,
  MissionId,
  RandomAlgorithmVersion,
  RulesVersion,
  SaveVersion,
} from "../../domain/identity/index.js";
import { snapshotId as makeSnapshotId } from "../../domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type DifficultySelection,
  type GameSnapshot,
  type GameState,
  type ObjectiveState,
} from "../../domain/engine/state.js";
import type {
  DetailedLogEntry,
  SimpleLogEntry,
} from "../../domain/logging/index.js";
import { initialRandomState } from "../../domain/random/versioned-random.js";
import { computeIntegrity } from "../../domain/persistence/index.js";
import type { MissionSetup } from "../../domain/rules/index.js";
import type { Clock, SnapshotIdGenerator } from "./game-command-dispatcher.js";

/** Turno inicial de toda Partida recién preparada (8.1, 34.1). */
const INITIAL_TURN = 1 as const;

/** Fase inicial de todo turno: la británica precede a la alemana (8.3, 34.3). */
const INITIAL_PHASE = "british" as const;

/**
 * Identidad y versiones de la Partida a crear. La capa de aplicación las
 * resuelve (identificador único de Partida, Versión de reglas/guardado y
 * dificultad elegida); la fábrica no las inventa.
 */
export type GameIdentity = Readonly<{
  gameId: GameId;
  missionId: MissionId;
  rulesVersion: RulesVersion;
  saveVersion: SaveVersion;
  difficulty: DifficultySelection;
}>;

/** Entrada de {@link buildInitialSnapshot}: preparación, identidad y azar. */
export type InitialSnapshotInput = Readonly<{
  missionSetup: MissionSetup;
  identity: GameIdentity;
  /** Semilla del Estado aleatorio inicial, INYECTADA (reproducibilidad, 19.1). */
  seed: string;
  /** Versión del algoritmo aleatorio; por defecto la de referencia (19.2). */
  algorithmVersion?: RandomAlgorithmVersion;
}>;

/**
 * Deriva el mapa de objetivos del Estado inicial a partir del objetivo tipado de
 * la Misión. El objetivo comienza SIN cumplir (`met: false`); su evaluación
 * estructural corresponde a `mission-outcome` durante la Partida, no aquí.
 */
function initialObjectives(
  setup: MissionSetup,
): Readonly<Record<string, ObjectiveState>> {
  return Object.freeze({
    [setup.objective.kind]: Object.freeze({ met: false }),
  });
}

/**
 * Construye el {@link GameState} inicial a partir de la preparación de la Misión
 * y la identidad de la Partida. La duración disponible proviene de la variante
 * ya elegida en la preparación (32.4/32.8/32.9/32.10). Las Fichas e Incógnitas
 * quedan vacías por Estado no publicable (DP-001); no se fabrican posiciones.
 */
function buildInitialState(input: InitialSnapshotInput): GameState {
  const { identity, missionSetup } = input;
  return gameState({
    gameId: identity.gameId,
    missionId: identity.missionId,
    rulesVersion: identity.rulesVersion,
    saveVersion: identity.saveVersion,
    difficulty: identity.difficulty,
    duration: { turns: missionSetup.availableTurns },
    turn: INITIAL_TURN,
    phase: INITIAL_PHASE,
    activation: {},
    pieces: {},
    unknowns: {},
    objectives: initialObjectives(missionSetup),
    effects: [],
    outcome: "in-progress",
  });
}

/**
 * Compone la ÚNICA Instantánea inicial completa de una Partida (5.6): Estado
 * inicial, Estado aleatorio en posición 0 con la Semilla inyectada, ambos
 * registros vacíos e integridad calculada sobre el `payload` canónico. Sin
 * `previousSnapshotId` por ser la primera. Función pura respecto a sus
 * dependencias inyectadas: mismos valores de entrada producen la misma
 * Instantánea (reproducibilidad, 19.1, 19.7).
 */
export function buildInitialSnapshot(
  input: InitialSnapshotInput,
  clock: Clock,
  idGenerator: SnapshotIdGenerator,
): GameSnapshot {
  const state = buildInitialState(input);
  const randomState = input.algorithmVersion === undefined
    ? initialRandomState(input.seed)
    : initialRandomState(input.seed, input.algorithmVersion);
  const simpleLog: readonly SimpleLogEntry[] = Object.freeze([]);
  const detailedLog: readonly DetailedLogEntry[] = Object.freeze([]);
  const integrity = computeIntegrity({
    gameId: input.identity.gameId,
    missionId: input.identity.missionId,
    seed: input.seed,
    turn: INITIAL_TURN,
  });
  return gameSnapshot({
    id: makeSnapshotId(idGenerator.next()),
    gameId: input.identity.gameId,
    confirmedAt: clock.now(),
    state,
    randomState,
    simpleLog,
    detailedLog,
    integrity,
  });
}
