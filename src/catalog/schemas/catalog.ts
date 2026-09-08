/**
 * Esquema del catálogo funcional (Tarea 2.1).
 *
 * Define los tipos `Readonly` del catálogo canónico —`CatalogItem<T>`,
 * `CanonicalRule`, `CanonicalTable<I, O>`, `MissionDefinition` y
 * `RulesCatalog`— junto con constructores que validan sus invariantes de forma
 * fail-closed. La compilación fail-closed completa (unicidad global, cobertura
 * de tablas, exactamente quince Misiones) es de la Tarea 2.2; aquí se validan
 * las invariantes locales de cada modelo.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS. Conserva el
 * título inglés únicamente como metadato de mantenimiento; el nombre visible es
 * es-ES (requisitos 3.5, 32.3).
 */
import type {
  CatalogId,
  DecisionRef,
  MissionId,
  RulesVersion,
} from "../../domain/identity/index.js";
import type {
  ObjectiveDefinition,
  SetupDefinition,
  HexMapDefinition,
  ForceEntry,
  RevealResult,
  PieceDefinition,
  OrderTable,
  DeclarativePredicate,
  DeclarativeEffect,
} from "./placeholders.js";
import type {
  ConformanceEntry,
  DecisionRecord,
  PublicationStatus,
} from "./publication.js";
import type { SourceRef, SourceVersion } from "./source-ref.js";
import {
  SOURCE_VERSION,
  MAX_MISSION_NUMBER,
  MIN_MISSION_NUMBER,
  missionMapPage,
  missionRulesPage,
} from "./source-ref.js";

/**
 * Elemento de catálogo con trazabilidad y estado de publicación.
 *
 * `sourceRefs` es una tupla no vacía: todo Dato canónico conserva al menos una
 * Referencia de fuente (requisito 1.2).
 */
export type CatalogItem<T> = Readonly<{
  id: CatalogId;
  rulesVersion: RulesVersion;
  value: T;
  sourceRefs: readonly [SourceRef, ...SourceRef[]];
  status: PublicationStatus;
}>;

/** Regla canónica declarativa con su prioridad de precedencia. */
export type CanonicalRule = Readonly<{
  id: CatalogId;
  predicate: DeclarativePredicate;
  effect: DeclarativeEffect;
  priority: number | DecisionRef;
}>;

/** Fila de una tabla canónica: entrada declarada y salida asociada. */
export type TableRow<I, O> = Readonly<{
  input: I;
  output: O;
}>;

/** Tabla canónica genérica (por ejemplo, la Tabla de revelado d6). */
export type CanonicalTable<I, O> = Readonly<{
  id: CatalogId;
  rows: readonly TableRow<I, O>[];
  inputDomain: readonly I[];
  sourceRefs: readonly SourceRef[];
}>;

/** Tres opciones de duración de una Misión: base−1, base, base+1 (req. 32). */
export type DurationOptions = readonly [
  "base-minus-one",
  "base",
  "base-plus-one",
];

/** Valor constante de {@link DurationOptions}. */
export const DURATION_OPTIONS: DurationOptions = Object.freeze([
  "base-minus-one",
  "base",
  "base-plus-one",
]);

/**
 * Definición canónica de una Misión.
 *
 * El nombre visible (`visibleNameEs`) es es-ES; el título inglés vive solo en
 * `maintenanceMetadata.originalTitle` como metadato de mantenimiento.
 */
export type MissionDefinition = Readonly<{
  id: MissionId;
  number: number;
  visibleNameEs: string;
  maintenanceMetadata: Readonly<{ originalTitle: string }>;
  rulesVersion: RulesVersion;
  sourceRefs: readonly SourceRef[];
  publicationStatus: PublicationStatus;
  baseTurns: number;
  durationOptions: DurationOptions;
  objective: ObjectiveDefinition;
  setup: SetupDefinition;
  map: HexMapDefinition;
  britishForces: readonly ForceEntry[];
  fixedGermanForces: readonly ForceEntry[];
  revealTable: CanonicalTable<number, RevealResult>;
  specialRules: readonly CatalogId[];
}>;

/** Catálogo lúdico inmutable emitido por el compilador (forma de la Tarea 2.1). */
export type RulesCatalog = Readonly<{
  sourceVersion: SourceVersion;
  rulesVersion: RulesVersion;
  missions: readonly MissionDefinition[];
  pieceTypes: Readonly<Record<string, CatalogItem<PieceDefinition>>>;
  orderTables: Readonly<Record<string, CatalogItem<OrderTable>>>;
  generalRules: readonly CatalogItem<CanonicalRule>[];
  decisions: readonly DecisionRecord[];
  conformance: readonly ConformanceEntry[];
}>;

/** Error de los constructores del esquema de catálogo ante un valor inválido. */
export class InvalidCatalogModelError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Modelo de catálogo inválido en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidCatalogModelError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function requireNonEmptyString(field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidCatalogModelError(field, value, "no puede estar vacío");
  }
  return value;
}

function requireSourceRefs(
  field: string,
  value: readonly SourceRef[],
): readonly [SourceRef, ...SourceRef[]] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidCatalogModelError(
      field,
      value,
      "requiere al menos una Referencia de fuente",
    );
  }
  return Object.freeze([...value]) as readonly [SourceRef, ...SourceRef[]];
}

/** Construye un {@link CatalogItem} validando su trazabilidad no vacía. */
export function catalogItem<T>(input: {
  id: CatalogId;
  rulesVersion: RulesVersion;
  value: T;
  sourceRefs: readonly SourceRef[];
  status: PublicationStatus;
}): CatalogItem<T> {
  return Object.freeze({
    id: input.id,
    rulesVersion: input.rulesVersion,
    value: input.value,
    sourceRefs: requireSourceRefs("sourceRefs", input.sourceRefs),
    status: input.status,
  });
}

/** Construye una {@link CanonicalRule}. */
export function canonicalRule(input: {
  id: CatalogId;
  predicate: DeclarativePredicate;
  effect: DeclarativeEffect;
  priority: number | DecisionRef;
}): CanonicalRule {
  if (
    typeof input.priority === "number" &&
    (!Number.isFinite(input.priority) || !Number.isInteger(input.priority))
  ) {
    throw new InvalidCatalogModelError(
      "priority",
      input.priority,
      "una prioridad numérica debe ser un entero finito",
    );
  }
  return Object.freeze({
    id: input.id,
    predicate: input.predicate,
    effect: input.effect,
    priority: input.priority,
  });
}

/**
 * Construye una {@link CanonicalTable} validando localmente que cada entrada
 * del dominio tiene exactamente una fila y que no hay filas fuera del dominio
 * ni entradas duplicadas. (La cobertura global la refuerza la Tarea 2.2.)
 */
export function canonicalTable<I, O>(input: {
  id: CatalogId;
  rows: readonly TableRow<I, O>[];
  inputDomain: readonly I[];
  sourceRefs?: readonly SourceRef[];
}): CanonicalTable<I, O> {
  const domain = [...input.inputDomain];
  const rows = [...input.rows];

  const domainSet = new Set<I>(domain);
  if (domainSet.size !== domain.length) {
    throw new InvalidCatalogModelError(
      "inputDomain",
      input.inputDomain,
      "el dominio de entrada no puede tener valores repetidos",
    );
  }

  const seen = new Set<I>();
  for (const row of rows) {
    if (!domainSet.has(row.input)) {
      throw new InvalidCatalogModelError(
        "rows",
        row.input,
        "una fila referencia una entrada fuera del dominio declarado",
      );
    }
    if (seen.has(row.input)) {
      throw new InvalidCatalogModelError(
        "rows",
        row.input,
        "el dominio de entrada tiene resultado duplicado",
      );
    }
    seen.add(row.input);
  }

  if (seen.size !== domainSet.size) {
    throw new InvalidCatalogModelError(
      "rows",
      input.rows,
      "cada entrada del dominio debe tener exactamente una fila",
    );
  }

  return Object.freeze({
    id: input.id,
    rows: Object.freeze(rows),
    inputDomain: Object.freeze(domain),
    sourceRefs: Object.freeze([...(input.sourceRefs ?? [])]),
  });
}

/**
 * Construye una {@link MissionDefinition} validando:
 * - `number` entre 1 y 15;
 * - `visibleNameEs` y `originalTitle` no vacíos;
 * - `baseTurns` entero positivo;
 * - trazabilidad que incluya las páginas de reglas y de Mapa de la Misión
 *   (`16 + 2(N−1)` y `17 + 2(N−1)`), conservando el título inglés solo como
 *   metadato de mantenimiento.
 */
export function missionDefinition(input: {
  id: MissionId;
  number: number;
  visibleNameEs: string;
  originalTitle: string;
  rulesVersion: RulesVersion;
  sourceRefs: readonly SourceRef[];
  publicationStatus: PublicationStatus;
  baseTurns: number;
  objective: ObjectiveDefinition;
  setup: SetupDefinition;
  map: HexMapDefinition;
  britishForces?: readonly ForceEntry[];
  fixedGermanForces?: readonly ForceEntry[];
  revealTable: CanonicalTable<number, RevealResult>;
  specialRules?: readonly CatalogId[];
}): MissionDefinition {
  if (
    !Number.isInteger(input.number) ||
    input.number < MIN_MISSION_NUMBER ||
    input.number > MAX_MISSION_NUMBER
  ) {
    throw new InvalidCatalogModelError(
      "number",
      input.number,
      `debe ser un entero entre ${MIN_MISSION_NUMBER} y ${MAX_MISSION_NUMBER}`,
    );
  }

  requireNonEmptyString("visibleNameEs", input.visibleNameEs);
  requireNonEmptyString("originalTitle", input.originalTitle);

  if (!Number.isInteger(input.baseTurns) || input.baseTurns <= 0) {
    throw new InvalidCatalogModelError(
      "baseTurns",
      input.baseTurns,
      "debe ser un entero positivo",
    );
  }

  const sourceRefs = requireSourceRefs("sourceRefs", input.sourceRefs);
  const rulesPage = missionRulesPage(input.number);
  const mapPage = missionMapPage(input.number);
  const pages = new Set(sourceRefs.map((ref) => ref.page));
  if (!pages.has(rulesPage) || !pages.has(mapPage)) {
    throw new InvalidCatalogModelError(
      "sourceRefs",
      input.sourceRefs,
      `la Misión ${input.number} debe referenciar la página ${rulesPage} (reglas) y ${mapPage} (mapa)`,
    );
  }

  return Object.freeze({
    id: input.id,
    number: input.number,
    visibleNameEs: input.visibleNameEs,
    maintenanceMetadata: Object.freeze({ originalTitle: input.originalTitle }),
    rulesVersion: input.rulesVersion,
    sourceRefs,
    publicationStatus: input.publicationStatus,
    baseTurns: input.baseTurns,
    durationOptions: DURATION_OPTIONS,
    objective: input.objective,
    setup: input.setup,
    map: input.map,
    britishForces: Object.freeze([...(input.britishForces ?? [])]),
    fixedGermanForces: Object.freeze([...(input.fixedGermanForces ?? [])]),
    revealTable: input.revealTable,
    specialRules: Object.freeze([...(input.specialRules ?? [])]),
  });
}

/**
 * Construye un {@link RulesCatalog} validando la forma local del agregado.
 *
 * Solo comprueba la coherencia de esta estructura (versión de fuente y
 * `rulesVersion` presentes, colecciones congeladas). La validación global
 * fail-closed —identificadores únicos, referencias, exactamente quince
 * Misiones y no solapamiento de tablas— es responsabilidad de la Tarea 2.2.
 */
export function rulesCatalog(input: {
  rulesVersion: RulesVersion;
  missions: readonly MissionDefinition[];
  pieceTypes: Readonly<Record<string, CatalogItem<PieceDefinition>>>;
  orderTables: Readonly<Record<string, CatalogItem<OrderTable>>>;
  generalRules: readonly CatalogItem<CanonicalRule>[];
  decisions?: readonly DecisionRecord[];
  conformance?: readonly ConformanceEntry[];
}): RulesCatalog {
  return Object.freeze({
    sourceVersion: SOURCE_VERSION,
    rulesVersion: input.rulesVersion,
    missions: Object.freeze([...input.missions]),
    pieceTypes: Object.freeze({ ...input.pieceTypes }),
    orderTables: Object.freeze({ ...input.orderTables }),
    generalRules: Object.freeze([...input.generalRules]),
    decisions: Object.freeze([...(input.decisions ?? [])]),
    conformance: Object.freeze([...(input.conformance ?? [])]),
  });
}
