/**
 * `TurnOrderPolicy`: secuencia de turnos/fases, activación de Unidades y
 * conversión de una tirada de activación en las Órdenes exactas permitidas
 * (Tarea 9.1, diseño §2 «submódulo `TurnOrderPolicy`»).
 *
 * Alcance verificado (requisitos 8.1-8.4 y 34.2-34.19):
 *
 * - SECUENCIA DE FASES: la fase británica se activa ANTES que la alemana; las
 *   Unidades británicas se activan una a una y solo cuando TODAS terminan puede
 *   comenzar la fase alemana (8.2, 8.3, 34.2, 34.3).
 * - CRUCE DE LA TIRADA: el primer d6 se cruza con la primera columna y el
 *   segundo d6 con la segunda columna de la Tabla de órdenes del tipo de Unidad
 *   (34.7). La tabla tiene EXACTAMENTE seis filas (34.18): esta política exige
 *   que el adaptador aporte las seis y falla-rápido si no es así.
 * - OPCIONES EXACTAS POR MORAL Y DOBLES: Moral normal con valores distintos
 *   ofrece exactamente cuatro opciones (primera, segunda, ambas, descartar);
 *   Moral normal con dobles permite una sola Orden de la fila o descartar; Moral
 *   baja permite solo la Orden de la primera columna o ninguna, con
 *   independencia de dobles (34.8-34.16).
 * - RESOLUCIÓN EN ORDEN DEFINIDO: ejecutar ambas resuelve primero la primera
 *   columna y después la segunda (34.11).
 * - RECHAZO SIN CAMBIO DE ESTADO: una opción no permitida por Moral+tirada se
 *   representa como un rechazo puro, SIN Consumo aleatorio ni cambio de estado
 *   (34.19). La política es una función total y determinista: no consume azar.
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). El tipo canónico de la Tabla de órdenes vive en
 * `src/catalog/schemas`; para no acoplarnos a su forma, este módulo define una
 * VISTA ESTRUCTURAL local ({@link OrderTableView}) con solo lo que la política
 * necesita. La capa de aplicación adapta la `CanonicalTable` del catálogo
 * (Tarea 3.3) a esta vista antes de invocar la política. El mismo criterio ya
 * lo aplica `RulesEngine` con su `RulesCatalogView`.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: la política NUNCA llama a
 * `VersionedRandom` ni consume azar. Recibe los valores de dado YA TIRADOS como
 * entrada ({@link ActivationRoll}); el Motor/aplicación resuelve el azar y se lo
 * suministra. Así el módulo permanece puro y determinista.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly`. Los textos visibles
 * se transportan por `messageKey` (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Cara mínima de un d6. */
const MIN_D6: number = 1;
/** Cara máxima de un d6. */
const MAX_D6: number = 6;
/** Número exacto de filas de la Tabla de órdenes por tipo de Unidad (34.18). */
const REQUIRED_ORDER_TABLE_ROWS: number = 6;

// ---------------------------------------------------------------------------
// Vista estructural del catálogo (adaptada por la capa de aplicación)
// ---------------------------------------------------------------------------

/**
 * Código de Orden. Espejo ESTRUCTURAL del `OrderCode` canónico
 * (`src/catalog/schemas`) declarado en el dominio para no importar el catálogo.
 * Las abreviaturas son las de la Tabla de órdenes del requisito 34; el nombre
 * visible `es-ES` lo resuelve el proyector, no el dominio.
 */
export type OrderCode = "RAL" | "GRE" | "ADV" | "SCO" | "COV" | "FIRE";

/** Valor de una cara de d6 (1..6), entrada de la Tabla de órdenes. */
export type DiePip = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Par de Órdenes de una fila de la Tabla de órdenes: `first` es la Orden de la
 * primera columna y `second` la de la segunda. Espejo estructural de
 * `OrderTableResult` del catálogo.
 */
export type OrderPair = Readonly<{
  first: OrderCode;
  second: OrderCode;
}>;

/** Fila de la Tabla de órdenes: cruza un d6 (1..6) con su par de Órdenes. */
export type OrderTableRow = Readonly<{
  input: DiePip;
  output: OrderPair;
}>;

/**
 * VISTA de la Tabla de órdenes de un tipo de Unidad que necesita la política.
 * La capa de aplicación la adapta desde la `CanonicalTable` del catálogo. Debe
 * contener EXACTAMENTE las seis filas 1..6 (34.18); {@link crossActivationRoll}
 * lo verifica y falla-rápido en caso contrario.
 */
export type OrderTableView = Readonly<{
  rows: readonly OrderTableRow[];
}>;

// ---------------------------------------------------------------------------
// Secuencia de fases y activación
// ---------------------------------------------------------------------------

/** Bando de una Unidad en la secuencia de activación. */
export type Side = "british" | "german";

/**
 * Fase de la secuencia de un turno. La fase británica precede a la alemana
 * (8.2, 8.3, 34.2, 34.3).
 */
export type TurnPhase = "british" | "german";

/** Orden canónico de las fases dentro de un turno: británica antes que alemana. */
export const PHASE_SEQUENCE: readonly TurnPhase[] = Object.freeze([
  "british",
  "german",
]);

/** Estado de Moral al comienzo de la activación de una Unidad británica. */
export type MoraleState = "normal" | "low";

/** Los cuatro tipos de Unidad británica con Tabla de órdenes propia. */
export type BritishUnitType = "rifle-squad" | "mg-team" | "mortar" | "piat";

/**
 * ¿La fase `earlier` precede a `later` en la secuencia del turno?
 *
 * Devuelve `true` solo cuando `earlier` aparece estrictamente antes que `later`
 * en {@link PHASE_SEQUENCE}. La fase británica precede a la alemana; ninguna
 * fase se precede a sí misma.
 */
export function phasePrecedes(earlier: TurnPhase, later: TurnPhase): boolean {
  const earlierIndex = PHASE_SEQUENCE.indexOf(earlier);
  const laterIndex = PHASE_SEQUENCE.indexOf(later);
  return earlierIndex < laterIndex;
}

/**
 * Estado de la cola de activación de un bando dentro de su fase.
 *
 * `pending` son las Unidades aún no activadas, en el orden en que deben
 * activarse una a una; `activated` las ya resueltas. El identificador de Unidad
 * es opaco (`string`): la política solo secuencia, no interpreta la Unidad.
 */
export type ActivationQueue = Readonly<{
  side: Side;
  pending: readonly string[];
  activated: readonly string[];
}>;

/**
 * Siguiente Unidad activable de la cola, o `undefined` si la fase del bando ya
 * terminó. La activación es una a una: siempre la primera pendiente (34.2).
 */
export function nextActivatableUnit(
  queue: ActivationQueue,
): string | undefined {
  return queue.pending[0];
}

/**
 * ¿Ha terminado la activación de todas las Unidades del bando?
 *
 * La fase alemana solo puede comenzar cuando esto es `true` para el bando
 * británico (8.3, 34.3). La comprobación es pura sobre la cola recibida.
 */
export function isPhaseComplete(queue: ActivationQueue): boolean {
  return queue.pending.length === 0;
}

/**
 * ¿Puede comenzar la fase alemana dado el estado de la cola británica?
 *
 * Solo cuando la activación británica ha terminado por completo (8.3, 34.3).
 */
export function canBeginGermanPhase(britishQueue: ActivationQueue): boolean {
  return britishQueue.side === "british" && isPhaseComplete(britishQueue);
}

// ---------------------------------------------------------------------------
// Cruce de la tirada de activación con la Tabla de órdenes
// ---------------------------------------------------------------------------

/**
 * Tirada de activación de una Unidad británica: los dos d6 YA tirados por el
 * Gestor de aleatoriedad (34.6). La política no los genera: los recibe.
 *
 * `firstDie` se cruza con la primera columna y `secondDie` con la segunda
 * (34.7).
 */
export type ActivationRoll = Readonly<{
  firstDie: DiePip;
  secondDie: DiePip;
}>;

/** ¿La tirada muestra dobles (ambos d6 con el mismo valor)? (34.13-34.15) */
export function isDouble(roll: ActivationRoll): boolean {
  return roll.firstDie === roll.secondDie;
}

/**
 * Órdenes resultantes de cruzar la tirada con la Tabla de órdenes.
 *
 * `firstColumn` proviene de cruzar `firstDie` con la primera columna;
 * `secondColumn`, de cruzar `secondDie` con la segunda (34.7).
 */
export type CrossedOrders = Readonly<{
  firstColumn: OrderCode;
  secondColumn: OrderCode;
}>;

/** Error de la política ante datos estructuralmente inválidos (fail-fast). */
export class TurnOrderPolicyError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail: string) {
    super(`Política de turno inválida en «${field}»: ${detail}.`);
    this.name = "TurnOrderPolicyError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

/** ¿El valor es una cara de d6 válida (entero 1..6)? */
function isValidPip(value: number): value is DiePip {
  return Number.isInteger(value) && value >= MIN_D6 && value <= MAX_D6;
}

/**
 * Localiza la fila de la Tabla que corresponde a un d6, fallando-rápido si la
 * tabla no tiene exactamente las seis filas 1..6 (34.18) o si falta la fila.
 */
function findRow(table: OrderTableView, pip: DiePip): OrderTableRow {
  if (table.rows.length !== REQUIRED_ORDER_TABLE_ROWS) {
    throw new TurnOrderPolicyError(
      "table.rows",
      table.rows.length,
      `la Tabla de órdenes debe tener exactamente ${REQUIRED_ORDER_TABLE_ROWS} filas`,
    );
  }
  const row = table.rows.find((candidate) => candidate.input === pip);
  if (row === undefined) {
    throw new TurnOrderPolicyError("pip", pip, "no hay fila para ese d6");
  }
  return row;
}

/**
 * Cruza la tirada de activación con la Tabla de órdenes del tipo de Unidad
 * (34.7). Toma la Orden de la PRIMERA columna de la fila del `firstDie` y la de
 * la SEGUNDA columna de la fila del `secondDie`.
 *
 * Falla-rápido si la tabla no tiene las seis filas o si algún d6 es inválido:
 * no se silencian datos corruptos (norma de errores fail-fast).
 */
export function crossActivationRoll(
  table: OrderTableView,
  roll: ActivationRoll,
): CrossedOrders {
  if (!isValidPip(roll.firstDie)) {
    throw new TurnOrderPolicyError("roll.firstDie", roll.firstDie, "d6 inválido");
  }
  if (!isValidPip(roll.secondDie)) {
    throw new TurnOrderPolicyError(
      "roll.secondDie",
      roll.secondDie,
      "d6 inválido",
    );
  }
  const firstRow = findRow(table, roll.firstDie);
  const secondRow = findRow(table, roll.secondDie);
  return Object.freeze({
    firstColumn: firstRow.output.first,
    secondColumn: secondRow.output.second,
  });
}

// ---------------------------------------------------------------------------
// Opciones de Orden permitidas por Moral y tirada
// ---------------------------------------------------------------------------

/**
 * Opción de Orden ofrecida al Jugador tras cruzar la tirada.
 *
 * - `first`: ejecutar solo la Orden de la primera columna (34.9).
 * - `second`: ejecutar solo la Orden de la segunda columna (34.10).
 * - `both`: ejecutar ambas, primero la primera y después la segunda (34.11).
 * - `discard`: descartar ambos resultados sin ejecutar Orden (34.12).
 */
export type OrderOptionKind = "first" | "second" | "both" | "discard";

/**
 * Conjunto EXACTO de opciones permitidas según Moral y tirada. El orden de las
 * opciones es estable y determinista para que la Interfaz y las pruebas puedan
 * compararlo por igualdad estructural.
 */
export type AllowedOrderOptions = readonly OrderOptionKind[];

/** Opciones de Moral normal con dos valores distintos (34.8). */
const NORMAL_DISTINCT_OPTIONS: AllowedOrderOptions = Object.freeze([
  "first",
  "second",
  "both",
  "discard",
]);

/** Opciones de Moral normal con dobles: una sola Orden de la fila o descartar (34.15). */
const NORMAL_DOUBLE_OPTIONS: AllowedOrderOptions = Object.freeze([
  "first",
  "second",
  "discard",
]);

/** Opciones de Moral baja: solo la primera columna o ninguna Orden (34.16). */
const LOW_MORALE_OPTIONS: AllowedOrderOptions = Object.freeze([
  "first",
  "discard",
]);

/**
 * Devuelve el conjunto EXACTO de opciones de Orden permitidas al comienzo de la
 * activación de una Unidad británica, dado su estado de Moral y si la tirada es
 * doble (34.8, 34.15, 34.16).
 *
 * - Moral baja: `first` o `discard`, con independencia de dobles (34.16).
 * - Moral normal con dobles: `first`, `second` o `discard` (una sola Orden de
 *   la fila o descartar) (34.15).
 * - Moral normal sin dobles: `first`, `second`, `both` o `discard` (exactamente
 *   cuatro opciones) (34.8).
 *
 * Función pura y total: no consume azar ni muta estado.
 */
export function allowedOrderOptions(
  morale: MoraleState,
  roll: ActivationRoll,
): AllowedOrderOptions {
  if (morale === "low") {
    return LOW_MORALE_OPTIONS;
  }
  if (isDouble(roll)) {
    return NORMAL_DOUBLE_OPTIONS;
  }
  return NORMAL_DISTINCT_OPTIONS;
}

/**
 * ¿La opción solicitada está permitida por Moral y tirada? (34.19)
 *
 * Predicado puro sobre {@link allowedOrderOptions}. La rama de rechazo de
 * {@link resolveOrderOption} lo usa para no cambiar estado ni consumir azar.
 */
export function isOrderOptionAllowed(
  option: OrderOptionKind,
  morale: MoraleState,
  roll: ActivationRoll,
): boolean {
  return allowedOrderOptions(morale, roll).includes(option);
}

// ---------------------------------------------------------------------------
// Resolución de la opción elegida en el orden definido
// ---------------------------------------------------------------------------

/**
 * Resultado de resolver la opción elegida por el Jugador.
 *
 * - `resolved`: `orders` es la SECUENCIA de Órdenes a ejecutar en el orden
 *   definido. `both` produce `[first, second]` (34.11); `first`/`second`
 *   producen una sola Orden (34.9, 34.10); `discard` produce una secuencia
 *   vacía: la activación termina sin ejecutar Orden (34.12).
 * - `rejected`: la opción no estaba permitida por Moral y tirada; NO cambia el
 *   estado ni consume azar (34.19). `reason` es un mensaje `es-ES`.
 */
export type OrderResolution =
  | Readonly<{ kind: "resolved"; orders: readonly OrderCode[] }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

/** Mensaje `es-ES` de rechazo de una opción no permitida (34.19). */
function disallowedOptionMessage(
  option: OrderOptionKind,
  morale: MoraleState,
): DomainMessage {
  return Object.freeze({
    messageKey: "rules.orders.optionNotAllowed",
    params: Object.freeze({ option, morale }),
  });
}

/**
 * Traduce una opción PERMITIDA a su secuencia de Órdenes en el orden definido.
 * Precondición garantizada por {@link resolveOrderOption}: `option` está en el
 * conjunto permitido, de modo que aquí solo se mapea sin ramas de error.
 */
function orderSequenceFor(
  option: OrderOptionKind,
  crossed: CrossedOrders,
): readonly OrderCode[] {
  if (option === "discard") {
    return Object.freeze([]);
  }
  if (option === "first") {
    return Object.freeze([crossed.firstColumn]);
  }
  if (option === "second") {
    return Object.freeze([crossed.secondColumn]);
  }
  return Object.freeze([crossed.firstColumn, crossed.secondColumn]);
}

/**
 * Resuelve la opción de Orden elegida por el Jugador (34.8-34.19).
 *
 * 1. Si la opción NO está permitida por Moral y tirada, devuelve `rejected` sin
 *    tocar estado ni azar (34.19): la función es pura y no efectúa Consumo.
 * 2. Si está permitida, devuelve `resolved` con la secuencia de Órdenes en el
 *    orden definido: `both` resuelve primero la primera columna y luego la
 *    segunda (34.11); `discard` termina la activación sin Orden (34.12).
 *
 * La política NO ejecuta las Órdenes (eso corresponde a los efectos de Orden,
 * Tarea 9.3): solo determina QUÉ Órdenes y en QUÉ orden se resolverían.
 */
export function resolveOrderOption(
  option: OrderOptionKind,
  morale: MoraleState,
  roll: ActivationRoll,
  crossed: CrossedOrders,
): OrderResolution {
  if (!isOrderOptionAllowed(option, morale, roll)) {
    return Object.freeze({
      kind: "rejected",
      reason: disallowedOptionMessage(option, morale),
    });
  }
  return Object.freeze({
    kind: "resolved",
    orders: orderSequenceFor(option, crossed),
  });
}
