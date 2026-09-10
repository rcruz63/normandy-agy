/**
 * Contrato de Tirada de dados en dos fases del dominio (Tarea 20.1, diseño §3,
 * requisitos 19 y 41).
 *
 * Una resolución que necesita dados se divide en dos fases dentro del contrato
 * SÍNCRONO del Motor de reglas:
 *
 * 1. **Solicitud** (`DiceRollRequest`): el Motor declara una Tirada pendiente
 *    para TODO Dominio aleatorio de dados (`RandomDomain.kind === "dice"`) sin
 *    consumir aleatoriedad. Incluye identificador único, Partida, Instantánea
 *    esperada, contexto, dominio (cantidad y caras), el orden de los dados y los
 *    metadatos de tabla o cálculo aplicables (41.1, 41.2).
 * 2. **Resolución** (`DiceRollResolution`): la capa de aplicación reanuda el
 *    Motor con una resolución ligada a esa solicitud (mismo identificador,
 *    Partida, Instantánea y contexto). Solo esta fase puede producir una
 *    `TransitionProposal` confirmable (41.23, 41.24).
 *
 * Este módulo define ÚNICAMENTE los tipos de datos del contrato y sus
 * constructores validadores. La coordinación del modo Automático/Manual y la
 * reserva de aleatoriedad viven en la capa de aplicación (`DiceRollCoordinator`,
 * `src/application/games/dice-roll-coordinator.ts`); la interpretación de caras
 * la hace el Motor (`RulesEngine.resumeRoll`). El diálogo visual vive en `ui/`.
 *
 * Frontera de capas y pureza: módulo puro de `domain/`. No importa DOM,
 * IndexedDB, red, reloj (`Date`) ni SDK de AWS, y NUNCA usa `Math.random`
 * (requisito 19). Todos los tipos son `Readonly`.
 */
import type { Brand } from "../identity/brand.js";
import type { CatalogId, GameId, SnapshotId } from "../identity/index.js";
import type { SourceRef } from "../logging/index.js";
import type {
  RandomConsumption,
  RandomContext,
  RandomState,
} from "../random/index.js";

/** Reexporta `SourceRef` estructural para consumidores del contrato de tiradas. */
export type { SourceRef } from "../logging/index.js";

/** Identificador único de una Tirada pendiente dentro de una Partida (41.2). */
export type DiceRollRequestId = Brand<string, "DiceRollRequestId">;

/** Origen de un Consumo aleatorio de dados: programático o dados físicos. */
export type DiceRollSource = "automatic" | "manual";

/**
 * Dominio de dados de una Tirada: `count` dados de `sides` caras cada uno. El
 * contrato NO asume una cantidad fija de dos dados: soporta d6, 2d6 y cualquier
 * dominio futuro (41.32, 41.33).
 */
export type DiceRollDomain = Readonly<{
  kind: "dice";
  count: number;
  sides: number;
}>;

/** Comparación aplicada entre el valor bruto y el objetivo de una resolución. */
export type Comparison = ">=" | ">" | "<=" | "<" | "==";

/** Valor con nombre (clave `es-ES`) usado en un cálculo de resolución. */
export type NamedValue = Readonly<{
  name: string;
  value: number;
}>;

/** Modificador con nombre (clave `es-ES`) y aporte con signo. */
export type SignedModifier = Readonly<{
  name: string;
  value: number;
}>;

/**
 * Metadatos de la resolución declarados por la solicitud (41.2). Distinguen si
 * el resultado se resuelve consultando una tabla canónica o mediante un cálculo
 * (objetivo, bases, modificadores, fórmula y comparación).
 */
export type DiceOutcomeMetadata =
  | Readonly<{
      kind: "table";
      tableId: CatalogId;
      sourceRefs: readonly SourceRef[];
    }>
  | Readonly<{
      kind: "calculation";
      targetValue: number;
      baseValues: readonly NamedValue[];
      modifiers: readonly SignedModifier[];
      formula: string;
      comparison: Comparison;
      sourceRefs: readonly SourceRef[];
    }>;

/**
 * Tirada pendiente declarada por el Motor (diseño §3, 41.1, 41.2). No muta el
 * Estado de partida, los registros ni el Estado aleatorio: es una declaración
 * que devuelve el control a la capa de aplicación.
 *
 * - `id`: identificador único de la solicitud (uso único, 41.24).
 * - `gameId`, `expectedSnapshotId`, `context`: ligan la resolución a esta
 *   Partida, Instantánea y contexto exactos (41.23).
 * - `domain`: cantidad y caras de los dados (41.32, 41.33).
 * - `diceOrder`: orden declarado de los dados; una permutación de `0..count-1`
 *   que fija el orden en que se representan y se recogen las caras (41.9, 41.5).
 * - `outcomeMetadata`: tabla o cálculo aplicable (41.16, 41.17).
 */
export type DiceRollRequest = Readonly<{
  id: DiceRollRequestId;
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  context: RandomContext;
  domain: DiceRollDomain;
  diceOrder: readonly number[];
  outcomeMetadata: DiceOutcomeMetadata;
}>;

/**
 * Resolución validada que reanuda el Motor (diseño §3). Liga la solicitud
 * (`requestId`), la Partida, la Instantánea esperada y el contexto, y transporta
 * las caras efectivas ordenadas, el siguiente Estado aleatorio reservado y el
 * Consumo aleatorio efectivo con su origen.
 *
 * En Automático las caras efectivas son las programáticas; en Manual son las
 * caras físicas ordenadas del Jugador y `consumption` conserva `source="manual"`
 * (41.8, 41.13, 41.14).
 */
export type DiceRollResolution = Readonly<{
  requestId: DiceRollRequestId;
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  context: RandomContext;
  source: DiceRollSource;
  effectiveFaces: readonly number[];
  nextRandomState: RandomState;
  consumption: RandomConsumption;
}>;

/**
 * Entrada del Coordinador: la elección del Jugador. `automatic` adopta las
 * caras programáticas; `manual` aporta una cara física por dado en el orden
 * declarado (41.6, 41.9).
 */
export type DiceRollInput =
  | Readonly<{ source: "automatic" }>
  | Readonly<{ source: "manual"; faces: readonly number[] }>;

/** Efecto de dominio proyectado tras interpretar las caras (clave `es-ES`). */
export type DomainEffectProjection = Readonly<{
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/** Fila proyectable de una tabla canónica en la proyección del resultado. */
export type TableProjectionRow = Readonly<{
  rowId: string;
  cells: Readonly<Record<string, string | number>>;
}>;

/**
 * Proyección estructurada del resultado (diseño §3). Es un dato producido por
 * el dominio, nunca una inferencia de la Interfaz: alimenta el diálogo, el
 * Registro simple y el detallado sin duplicar lógica lúdica en presentación.
 *
 * - `table`: tabla canónica con la fila, columna o intervalo aplicado (41.16).
 * - `calculation`: objetivo, bases, modificadores, fórmula/comparación y efecto
 *   (41.17).
 */
export type DiceOutcomeProjection =
  | Readonly<{
      kind: "table";
      tableId: CatalogId;
      rows: readonly TableProjectionRow[];
      appliedRowId: string;
      appliedColumnId?: string;
      appliedInterval?: string;
      effect: DomainEffectProjection;
      sourceRefs: readonly SourceRef[];
    }>
  | Readonly<{
      kind: "calculation";
      targetValue: number;
      baseValues: readonly NamedValue[];
      modifiers: readonly SignedModifier[];
      formula: string;
      comparison: Comparison;
      effect: DomainEffectProjection;
      sourceRefs: readonly SourceRef[];
    }>;

/** Error lanzado por los constructores de este módulo ante datos inválidos. */
export class InvalidDiceRollError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(
      `Tirada de dados inválida en «${field}»${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "InvalidDiceRollError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidDiceRollError(field, value, "no puede estar vacío");
  }
}

function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidDiceRollError(
      field,
      value,
      "debe ser un entero mayor o igual que 1",
    );
  }
}

/**
 * Valida que `diceOrder` sea una permutación EXACTA de `0..count-1`: describe el
 * orden declarado de los dados sin huecos, repeticiones ni índices fuera de
 * rango (41.9). Un orden vacío para `count>=1` es inválido.
 */
function assertDiceOrder(count: number, diceOrder: readonly number[]): void {
  if (diceOrder.length !== count) {
    throw new InvalidDiceRollError(
      "diceOrder",
      diceOrder,
      `debe declarar exactamente ${count} posiciones ordenadas`,
    );
  }
  const seen = new Set<number>();
  for (const index of diceOrder) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new InvalidDiceRollError(
        "diceOrder",
        diceOrder,
        `cada posición debe ser un entero en 0..${count - 1}`,
      );
    }
    if (seen.has(index)) {
      throw new InvalidDiceRollError(
        "diceOrder",
        diceOrder,
        "no puede repetir posiciones",
      );
    }
    seen.add(index);
  }
}

/** Entrada de {@link diceRollRequest}. */
export type DiceRollRequestInput = Readonly<{
  id: DiceRollRequestId;
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  context: RandomContext;
  domain: DiceRollDomain;
  diceOrder: readonly number[];
  outcomeMetadata: DiceOutcomeMetadata;
}>;

/**
 * Construye una {@link DiceRollRequest} inmutable validando su contrato: dominio
 * de dados con `count>=1` y `sides>=1`, `diceOrder` como permutación de
 * `0..count-1`, `context.label` no vacío e identificadores no vacíos. Congela la
 * solicitud completa (dominio, orden y metadatos incluidos).
 */
export function diceRollRequest(input: DiceRollRequestInput): DiceRollRequest {
  assertNonEmpty("id", input.id as string);
  assertNonEmpty("gameId", input.gameId as string);
  assertNonEmpty("expectedSnapshotId", input.expectedSnapshotId as string);
  assertNonEmpty("context.label", input.context.label);
  if (input.domain.kind !== "dice") {
    throw new InvalidDiceRollError(
      "domain.kind",
      (input.domain as { kind: string }).kind,
      "debe ser un dominio de dados",
    );
  }
  assertPositiveInteger("domain.count", input.domain.count);
  assertPositiveInteger("domain.sides", input.domain.sides);
  assertDiceOrder(input.domain.count, input.diceOrder);

  return Object.freeze({
    id: input.id,
    gameId: input.gameId,
    expectedSnapshotId: input.expectedSnapshotId,
    context: input.context,
    domain: Object.freeze({
      kind: "dice" as const,
      count: input.domain.count,
      sides: input.domain.sides,
    }),
    diceOrder: Object.freeze([...input.diceOrder]),
    outcomeMetadata: input.outcomeMetadata,
  });
}

/**
 * ¿La resolución `resolution` corresponde EXACTAMENTE a la solicitud `request`?
 *
 * Verifica identidad de solicitud, Partida, Instantánea esperada y contexto
 * (etiqueta y detalle). Una resolución obsoleta, reutilizada o cruzada NO supera
 * esta comprobación (41.23). No inspecciona las caras: eso es responsabilidad de
 * la interpretación del Motor.
 */
export function resolutionMatchesRequest(
  request: DiceRollRequest,
  resolution: DiceRollResolution,
): boolean {
  if (resolution.requestId !== request.id) {
    return false;
  }
  if (resolution.gameId !== request.gameId) {
    return false;
  }
  if (resolution.expectedSnapshotId !== request.expectedSnapshotId) {
    return false;
  }
  return sameContext(request.context, resolution.context);
}

/** ¿Dos contextos son estructuralmente idénticos (etiqueta y detalle)? */
function sameContext(left: RandomContext, right: RandomContext): boolean {
  if (left.label !== right.label) {
    return false;
  }
  const leftDetail = left.detail;
  const rightDetail = right.detail;
  if (leftDetail === undefined || rightDetail === undefined) {
    return leftDetail === rightDetail;
  }
  const leftKeys = Object.keys(leftDetail);
  const rightKeys = Object.keys(rightDetail);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => leftDetail[key] === rightDetail[key]);
}
