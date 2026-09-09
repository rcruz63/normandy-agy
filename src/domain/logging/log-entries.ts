/**
 * Modelos y constructores de las entradas del Registro simple y del Registro
 * detallado del dominio (Tarea 13.1, requisito 20).
 *
 * Alcance verificado:
 *
 * - REGISTRO SIMPLE (20.1, 20.6): cada entrada lleva el identificador de
 *   Partida (`gameId`), un número de secuencia consecutivo por Partida, el
 *   turno, la fase, el actor, la acción y el resultado. Las listas se ordenan
 *   por secuencia dentro de la Partida.
 *
 * - REGISTRO DETALLADO (20.2, 20.3, 20.4, 20.7): cada entrada lleva `gameId` y
 *   secuencia consecutiva. Para una tirada/consulta de tabla (20.2) recoge el
 *   valor bruto (`rawValue`), el valor objetivo (`targetValue`), los valores
 *   base, cada modificador con nombre y signo, la fórmula, la comparación y el
 *   resultado final. Para una resolución sin tirada (20.3) recoge las entradas,
 *   reglas, prioridades y cálculos deterministas usados. Cuando se emplean
 *   Datos canónicos (20.4) incluye la Versión de reglas (`rulesVersion`) y las
 *   Referencias de fuente (`sourceRefs`). El array `steps` refleja el orden de
 *   cálculo dentro de la resolución (20.7). Los Consumos aleatorios efectuados
 *   se conservan como referencia estructural (8.7, 12.3, 12.5, 14.5, 16.4,
 *   38.8).
 *
 * - AISLAMIENTO POR PARTIDA (20.5): los constructores de lista rechazan mezclar
 *   entradas de `gameId` distintos y verifican que las secuencias sean
 *   consecutivas empezando en 1.
 *
 * FRONTERA DE CAPAS Y PUREZA: el dominio NO importa la capa de catálogo; las
 * Referencias de fuente se modelan como {@link SourceRef} estructural, igual que
 * `RevealSourceRef` en `reveal-resolver`. El desglose de una resolución de
 * combate se acomoda como VISTA estructural ({@link ModifierBreakdown}), sin
 * acoplar logging→combat. Módulo puro: no importa DOM, IndexedDB, red, reloj ni
 * SDK de AWS; no usa `Math.random` ni `Date`. Todos los tipos son `Readonly` y
 * las funciones no mutan sus argumentos. Los textos visibles se transportan por
 * `messageKey` (`es-ES`); la resolución final la hace la Interfaz (Tarea 20).
 */
import type { GameId, RulesVersion } from "../identity/index.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Primera secuencia válida de un registro dentro de una Partida (20.6). */
const FIRST_SEQUENCE: number = 1;

// ---------------------------------------------------------------------------
// Referencias de fuente y Consumos aleatorios
// ---------------------------------------------------------------------------

/**
 * Referencia de fuente estructural mínima para el Registro detallado (20.4).
 * Espeja la `SourceRef` canónica sin acoplar el dominio al catálogo, igual que
 * `RevealSourceRef`.
 */
export type SourceRef = Readonly<{
  sourceVersion: string;
  page: number;
  element: string;
  missionRef?: string;
}>;

/**
 * Referencia estructural a un Consumo aleatorio ya efectuado y conservado en el
 * Registro detallado (8.7, 12.3, 12.5, 14.5, 16.4, 38.8). Identifica el avance
 * de secuencia aleatoria sin acoplar el dominio al Gestor de aleatoriedad:
 * `position` es la posición consumida y `algorithmVersion` la Versión del
 * algoritmo que la produjo.
 */
export type RandomConsumptionRef = Readonly<{
  position: number;
  algorithmVersion: string;
}>;

// ---------------------------------------------------------------------------
// Desglose de modificadores de una resolución con tirada (20.2)
// ---------------------------------------------------------------------------

/**
 * Un modificador con nombre y signo del desglose de una resolución (20.2). El
 * `name` es la clave `es-ES` del origen del modificador (p. ej. la fuente de un
 * `ModifierOperand` de combate); `value` es su aporte con signo; `count`, cuando
 * aplica (Apoyo), indica cuántas Unidades lo generan.
 */
export type NamedModifier = Readonly<{
  name: string;
  value: number;
  count?: number;
}>;

/**
 * Vista estructural del desglose de una resolución con tirada/consulta de tabla
 * (20.2). Acomoda —sin acoplarse rígidamente— la `CombatResolution` de
 * `combat-resolver` (valores base, operandos con signo, umbral efectivo) junto
 * al azar consumido y la comparación:
 *
 * - `rawValue`: valor bruto de la tirada (p. ej. el total de 2d6).
 * - `targetValue`: valor objetivo tras modificadores (p. ej. `effectiveThreshold`).
 * - `baseValues`: valores base antes de modificadores (p. ej. `baseThreshold`).
 * - `modifiers`: cada modificador con su nombre y signo, en orden de cálculo (20.7).
 * - `formula`: fórmula estructurada como cadena `es-ES`-neutra
 *   (p. ej. "base + Σ modificadores"); el texto lo interpola el proyector.
 * - `comparison`: comparación aplicada entre bruto y objetivo
 *   (`>=` = igualar o superar, `>` = superar, `<=`, `<`, `==`).
 * - `finalResult`: clave `es-ES` del resultado final (impacto/fallo/…).
 */
export type ComparisonOperator = ">=" | ">" | "<=" | "<" | "==";

export type ModifierBreakdown = Readonly<{
  rawValue: number;
  targetValue: number;
  baseValues: readonly number[];
  modifiers: readonly NamedModifier[];
  formula: string;
  comparison: ComparisonOperator;
  finalResult: string;
}>;

/**
 * Vista estructural de una resolución determinista SIN tirada (20.3): las
 * entradas, reglas, prioridades y cálculos usados, en orden de cálculo (20.7).
 * Cada campo es una lista ordenada de claves `es-ES` (o valores) que el
 * proyector interpola.
 */
export type DeterministicBreakdown = Readonly<{
  inputs: readonly string[];
  rules: readonly string[];
  priorities: readonly string[];
  computations: readonly string[];
}>;

// ---------------------------------------------------------------------------
// Entradas de registro
// ---------------------------------------------------------------------------

/**
 * Entrada del Registro simple (20.1). `sequence` y `messageKey` son la base
 * mínima común a toda entrada de registro (compatibles con los diagnósticos que
 * producen otras capas); los campos de 20.1 (`gameId`, `turn`, `phase`, `actor`,
 * `action`, `result`) describen la acción o evento resuelto. `params` transporta
 * operandos para interpolar el `messageKey` sin acoplar el dominio al idioma.
 */
export type SimpleLogEntry = Readonly<{
  gameId?: GameId;
  sequence: number;
  turn?: number;
  phase?: string;
  actor?: string;
  action?: string;
  result?: string;
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Entrada del Registro detallado (20.2, 20.3, 20.4, 20.7). Una entrada es «con
 * tirada» ({@link ModifierBreakdown} en `roll`) o «determinista»
 * ({@link DeterministicBreakdown} en `deterministic`); nunca ambas. Cuando la
 * resolución usa Datos canónicos incluye `rulesVersion` y `sourceRefs` (20.4), y
 * conserva los Consumos aleatorios efectuados en `consumptions` (8.7, 12.3,
 * 12.5, 14.5, 16.4, 38.8).
 */
export type DetailedLogEntry = Readonly<{
  gameId?: GameId;
  sequence: number;
  roll?: ModifierBreakdown;
  deterministic?: DeterministicBreakdown;
  rulesVersion?: RulesVersion;
  sourceRefs?: readonly SourceRef[];
  consumptions?: readonly RandomConsumptionRef[];
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/** Error lanzado por los constructores de este módulo ante datos inválidos. */
export class InvalidLogEntryError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Entrada de registro inválida en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidLogEntryError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function assertNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidLogEntryError(field, value, "debe ser un entero no negativo");
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidLogEntryError(field, value, "no puede estar vacío");
  }
}

// ---------------------------------------------------------------------------
// Constructores de entradas
// ---------------------------------------------------------------------------

/** Entrada de {@link simpleLogEntry}; refleja los campos de 20.1. */
export type SimpleLogEntryInput = Readonly<{
  gameId: GameId;
  sequence: number;
  turn: number;
  phase: string;
  actor: string;
  action: string;
  result: string;
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Construye una {@link SimpleLogEntry} validando los campos obligatorios de
 * 20.1: secuencia entero no negativo, turno entero no negativo y `phase`,
 * `actor`, `action`, `result`, `messageKey` no vacíos. Congela `params`.
 */
export function simpleLogEntry(input: SimpleLogEntryInput): SimpleLogEntry {
  assertNonNegativeInteger("sequence", input.sequence);
  assertNonNegativeInteger("turn", input.turn);
  assertNonEmpty("phase", input.phase);
  assertNonEmpty("actor", input.actor);
  assertNonEmpty("action", input.action);
  assertNonEmpty("result", input.result);
  assertNonEmpty("messageKey", input.messageKey);

  const base = {
    gameId: input.gameId,
    sequence: input.sequence,
    turn: input.turn,
    phase: input.phase,
    actor: input.actor,
    action: input.action,
    result: input.result,
    messageKey: input.messageKey,
  };
  if (input.params !== undefined) {
    return Object.freeze({ ...base, params: Object.freeze({ ...input.params }) });
  }
  return Object.freeze(base);
}

/** Entrada de {@link detailedLogEntry}; refleja los campos de 20.2/20.3/20.4. */
export type DetailedLogEntryInput = Readonly<{
  gameId: GameId;
  sequence: number;
  roll?: ModifierBreakdown;
  deterministic?: DeterministicBreakdown;
  rulesVersion?: RulesVersion;
  sourceRefs?: readonly SourceRef[];
  consumptions?: readonly RandomConsumptionRef[];
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Comprueba que una entrada detallada describa EXACTAMENTE una de las dos
 * naturalezas de 20.2/20.3: con tirada (`roll`) o determinista
 * (`deterministic`). Falla-rápido ante ninguna o ambas (dato incoherente).
 */
function assertExactlyOneBreakdown(input: DetailedLogEntryInput): void {
  const hasRoll = input.roll !== undefined;
  const hasDeterministic = input.deterministic !== undefined;
  if (hasRoll === hasDeterministic) {
    throw new InvalidLogEntryError(
      "roll/deterministic",
      { hasRoll, hasDeterministic },
      "debe incluir exactamente uno: roll (20.2) o deterministic (20.3)",
    );
  }
}

/**
 * Construye una {@link DetailedLogEntry} validando: secuencia entero no
 * negativo, `messageKey` no vacío y exactamente una naturaleza (con tirada o
 * determinista). Congela las colecciones opcionales presentes (20.4, Consumos).
 * Las claves opcionales ausentes se omiten (`exactOptionalPropertyTypes`).
 */
export function detailedLogEntry(input: DetailedLogEntryInput): DetailedLogEntry {
  assertNonNegativeInteger("sequence", input.sequence);
  assertNonEmpty("messageKey", input.messageKey);
  assertExactlyOneBreakdown(input);

  const withRoll = input.roll !== undefined ? { roll: input.roll } : {};
  const withDeterministic =
    input.deterministic !== undefined ? { deterministic: input.deterministic } : {};
  const withRulesVersion =
    input.rulesVersion !== undefined ? { rulesVersion: input.rulesVersion } : {};
  const withSourceRefs =
    input.sourceRefs !== undefined
      ? { sourceRefs: Object.freeze([...input.sourceRefs]) }
      : {};
  const withConsumptions =
    input.consumptions !== undefined
      ? { consumptions: Object.freeze([...input.consumptions]) }
      : {};
  const withParams =
    input.params !== undefined ? { params: Object.freeze({ ...input.params }) } : {};

  return Object.freeze({
    gameId: input.gameId,
    sequence: input.sequence,
    messageKey: input.messageKey,
    ...withRoll,
    ...withDeterministic,
    ...withRulesVersion,
    ...withSourceRefs,
    ...withConsumptions,
    ...withParams,
  });
}

// ---------------------------------------------------------------------------
// Constructores de registro (aislamiento por Partida y orden por secuencia)
// ---------------------------------------------------------------------------

/** Cualquier entrada de registro con secuencia y `gameId` opcional. */
type SequencedEntry = Readonly<{ sequence: number; gameId?: GameId }>;

/**
 * Comprueba el aislamiento por Partida (20.5): ninguna entrada mezcla un
 * `gameId` distinto del de la Partida indicada. Falla-rápido ante una mezcla.
 */
function assertSameGame(
  entries: readonly SequencedEntry[],
  gameId: GameId,
  path: string,
): void {
  const mixedIndex = entries.findIndex(
    (entry) => entry.gameId !== undefined && entry.gameId !== gameId,
  );
  if (mixedIndex < 0) {
    return;
  }
  throw new InvalidLogEntryError(
    `${path}[${mixedIndex}].gameId`,
    entries[mixedIndex]?.gameId,
    `no puede mezclar entradas de una Partida distinta de «${gameId}» (20.5)`,
  );
}

/**
 * Comprueba el orden por secuencia (20.6, 20.7): las secuencias son
 * consecutivas empezando en {@link FIRST_SEQUENCE}, sin huecos ni repeticiones.
 * Falla-rápido en la primera secuencia que no encaje.
 */
function assertConsecutiveSequences(
  entries: readonly SequencedEntry[],
  path: string,
): void {
  const brokenIndex = entries.findIndex(
    (entry, index) => entry.sequence !== index + FIRST_SEQUENCE,
  );
  if (brokenIndex < 0) {
    return;
  }
  throw new InvalidLogEntryError(
    `${path}[${brokenIndex}].sequence`,
    entries[brokenIndex]?.sequence,
    `debe ser consecutiva empezando en ${FIRST_SEQUENCE} (20.6, 20.7)`,
  );
}

/**
 * Valida y congela un Registro simple de una Partida: aislamiento por Partida
 * (20.5) y secuencias consecutivas ordenadas (20.6). Devuelve la misma lista
 * congelada; no muta la entrada.
 */
export function simpleLog(
  gameId: GameId,
  entries: readonly SimpleLogEntry[],
): readonly SimpleLogEntry[] {
  assertSameGame(entries, gameId, "simpleLog");
  assertConsecutiveSequences(entries, "simpleLog");
  return Object.freeze([...entries]);
}

/**
 * Valida y congela un Registro detallado de una Partida: aislamiento por
 * Partida (20.5) y secuencias consecutivas ordenadas (20.6, 20.7). Devuelve la
 * misma lista congelada; no muta la entrada.
 */
export function detailedLog(
  gameId: GameId,
  entries: readonly DetailedLogEntry[],
): readonly DetailedLogEntry[] {
  assertSameGame(entries, gameId, "detailedLog");
  assertConsecutiveSequences(entries, "detailedLog");
  return Object.freeze([...entries]);
}

/**
 * Añade una entrada al Registro simple asignándole la siguiente secuencia
 * consecutiva (20.6) y garantizando el aislamiento por Partida (20.5). Función
 * pura: devuelve una lista nueva congelada sin mutar la recibida.
 */
export function appendSimpleEntry(
  gameId: GameId,
  entries: readonly SimpleLogEntry[],
  input: Omit<SimpleLogEntryInput, "gameId" | "sequence">,
): readonly SimpleLogEntry[] {
  assertSameGame(entries, gameId, "simpleLog");
  const entry = simpleLogEntry({
    ...input,
    gameId,
    sequence: entries.length + FIRST_SEQUENCE,
  });
  return Object.freeze([...entries, entry]);
}

/**
 * Añade una entrada al Registro detallado asignándole la siguiente secuencia
 * consecutiva (20.6, 20.7) y garantizando el aislamiento por Partida (20.5).
 * Función pura: devuelve una lista nueva congelada sin mutar la recibida.
 */
export function appendDetailedEntry(
  gameId: GameId,
  entries: readonly DetailedLogEntry[],
  input: Omit<DetailedLogEntryInput, "gameId" | "sequence">,
): readonly DetailedLogEntry[] {
  assertSameGame(entries, gameId, "detailedLog");
  const entry = detailedLogEntry({
    ...input,
    gameId,
    sequence: entries.length + FIRST_SEQUENCE,
  });
  return Object.freeze([...entries, entry]);
}
