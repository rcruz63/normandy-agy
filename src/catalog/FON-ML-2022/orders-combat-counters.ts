/**
 * Fixtures canónicos verificados de FON-ML-2022 (Tarea 3.3):
 *
 *  1. Tabla de órdenes británica: exactamente seis filas (`d6` 1..6) por cada
 *     uno de los cuatro tipos de Unidad británica (Escuadra de fusileros,
 *     Equipo MG, Mortero y PIAT). Requisitos 34 (tabla) y 34.18.
 *  2. Valores base para impactar por atacante o efecto. Requisito 36 (tabla)
 *     y 36.1.
 *  3. Inventario funcional de contadores de la página 47, modelado como
 *     Recursos propios (no se copia ilustración del PDF). Requisitos 40.8 y
 *     40.9.
 *
 * Frontera de catálogo: este módulo es puro. No importa DOM, IndexedDB, red,
 * reloj ni SDK de AWS. Todos los valores provienen de los requisitos verificados
 * 34, 36 y 40; NO se inventa ningún dato. El texto visible es `es-ES`.
 *
 * Dependencia con la Tarea 2.1: cuando `src/catalog/schemas/` publique
 * `CanonicalTable<I,O>`, `SourceRef`, `PublicationStatus`, `TableRow<I,O>`,
 * etc., estos alias locales mínimos deben unificarse con esos tipos. Se declaran
 * aquí de forma estructuralmente compatible para permitir un typecheck autónomo.
 */
import type { Brand } from "../../domain/identity/index.js";
import { catalogId, rulesVersion, type RulesVersion } from "../../domain/identity/index.js";
import type {
  CanonicalTable,
  LicenseEntry,
  OrderCode,
  OrderTableInput,
  OrderTableResult,
  PublicationStatus,
  SourceRef,
  TableRow,
} from "../schemas/index.js";
import { sourceRef } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Tipos canónicos importados de `src/catalog/schemas/`
// ---------------------------------------------------------------------------
// La Tarea 2.2 unificó los antiguos alias locales (`SourceRef`,
// `PublicationStatus`, `TableRow`, `CanonicalTable`, `LicenseEntry`) con el
// esquema canónico, e incorporó `OrderCode`, `OrderTableInput` y
// `OrderTableResult` como sub-modelos reales. Se reexportan los tipos que
// consumen las pruebas y otras capas del catálogo.
export type {
  CanonicalTable,
  LicenseEntry,
  OrderCode,
  OrderTableInput,
  OrderTableResult,
  PublicationStatus,
  SourceRef,
  TableRow,
};

// ---------------------------------------------------------------------------
// Constantes de referencia de fuente
// ---------------------------------------------------------------------------

const rulesVersionFon2022 = rulesVersion("FON-ML-2022");

/** Referencias de fuente de la Tabla de órdenes (turnos, activación y órdenes). */
const orderTableSourceRefs: readonly SourceRef[] = [
  sourceRef({ page: 6, element: "Turnos y activación" }),
  sourceRef({ page: 7, element: "Órdenes y Tabla de órdenes" }),
  sourceRef({ page: 8, element: "Órdenes" }),
  sourceRef({ page: 14, element: "Resumen de reglas" }),
];

/** Referencias de fuente de los Valores para impactar. */
const hitValueSourceRefs: readonly SourceRef[] = [
  sourceRef({ page: 5, element: "Terreno" }),
  sourceRef({ page: 12, element: "Semioruga, PIAT y Minas" }),
  sourceRef({ page: 13, element: "Artillería y Ríos" }),
  sourceRef({ page: 14, element: "Resumen de reglas" }),
];

/** Referencia de fuente del inventario funcional de contadores (página 47). */
const counterInventorySourceRef: SourceRef = sourceRef({
  page: 47,
  element: "Inventario funcional de contadores",
});

// ---------------------------------------------------------------------------
// 1. Tabla de órdenes británica (Requisito 34 y 34.18)
// ---------------------------------------------------------------------------

/** Los cuatro tipos de Unidad británica con Tabla de órdenes propia. */
export type BritishUnitType = "rifle-squad" | "mg-team" | "mortar" | "piat";

/** Nombre visible `es-ES` de cada tipo de Unidad británica. */
export const britishUnitTypeNameEs: Readonly<Record<BritishUnitType, string>> = {
  "rifle-squad": "Escuadra de fusileros",
  "mg-team": "Equipo MG",
  mortar: "Mortero",
  piat: "PIAT",
};

/**
 * Nombre visible `es-ES` de cada Orden. Las abreviaturas (`RAL`, `GRE`, ...)
 * son las de la Tabla de órdenes del requisito 34; el nombre visible es es-ES.
 * El tipo {@link OrderCode} es canónico (importado del esquema).
 */
export const orderCodeNameEs: Readonly<Record<OrderCode, string>> = {
  RAL: "Reagrupar",
  GRE: "Granada",
  ADV: "Avanzar",
  SCO: "Explorar",
  COV: "Cobertura",
  FIRE: "Fuego",
};

/** Dominio de entrada de toda Tabla de órdenes: los seis resultados de un d6. */
export const orderTableInputDomain: readonly OrderTableInput[] = [1, 2, 3, 4, 5, 6];

/**
 * Construye las seis filas verificadas de un tipo de Unidad. Se exige que las
 * salidas cubran exactamente `d6` 1..6, garantizando la restricción de "seis
 * filas" del requisito 34.18.
 */
function makeOrderRows(
  outcomes: readonly [
    OrderTableResult,
    OrderTableResult,
    OrderTableResult,
    OrderTableResult,
    OrderTableResult,
    OrderTableResult,
  ],
): readonly TableRow<OrderTableInput, OrderTableResult>[] {
  return orderTableInputDomain.map((d6, index) => ({
    input: d6,
    output: outcomes[index] as OrderTableResult,
  }));
}

const rifleSquadRows = makeOrderRows([
  { first: "RAL", second: "GRE" }, // d6 1: Reagrupar / Granada
  { first: "ADV", second: "SCO" }, // d6 2: Avanzar / Explorar
  { first: "ADV", second: "COV" }, // d6 3: Avanzar / Cobertura
  { first: "FIRE", second: "COV" }, // d6 4: Fuego / Cobertura
  { first: "FIRE", second: "ADV" }, // d6 5: Fuego / Avanzar
  { first: "ADV", second: "FIRE" }, // d6 6: Avanzar / Fuego
]);

const mgTeamRows = makeOrderRows([
  { first: "RAL", second: "ADV" }, // d6 1: Reagrupar / Avanzar
  { first: "ADV", second: "COV" }, // d6 2: Avanzar / Cobertura
  { first: "ADV", second: "COV" }, // d6 3: Avanzar / Cobertura
  { first: "COV", second: "FIRE" }, // d6 4: Cobertura / Fuego
  { first: "FIRE", second: "COV" }, // d6 5: Fuego / Cobertura
  { first: "FIRE", second: "COV" }, // d6 6: Fuego / Cobertura
]);

const mortarRows = makeOrderRows([
  { first: "RAL", second: "ADV" }, // d6 1: Reagrupar / Avanzar
  { first: "RAL", second: "ADV" }, // d6 2: Reagrupar / Avanzar
  { first: "RAL", second: "ADV" }, // d6 3: Reagrupar / Avanzar
  { first: "ADV", second: "COV" }, // d6 4: Avanzar / Cobertura
  { first: "ADV", second: "COV" }, // d6 5: Avanzar / Cobertura
  { first: "ADV", second: "COV" }, // d6 6: Avanzar / Cobertura
]);

const piatRows = makeOrderRows([
  { first: "RAL", second: "ADV" }, // d6 1: Reagrupar / Avanzar
  { first: "ADV", second: "COV" }, // d6 2: Avanzar / Cobertura
  { first: "ADV", second: "COV" }, // d6 3: Avanzar / Cobertura
  { first: "COV", second: "FIRE" }, // d6 4: Cobertura / Fuego
  { first: "FIRE", second: "COV" }, // d6 5: Fuego / Cobertura
  { first: "FIRE", second: "COV" }, // d6 6: Fuego / Cobertura
]);

function makeOrderTable(
  unit: BritishUnitType,
  rows: readonly TableRow<OrderTableInput, OrderTableResult>[],
): CanonicalTable<OrderTableInput, OrderTableResult> {
  return {
    id: catalogId(`FON-ML-2022-order-table-${unit}`),
    rows,
    inputDomain: orderTableInputDomain,
    sourceRefs: orderTableSourceRefs,
  };
}

/**
 * Tabla de órdenes por tipo de Unidad británica. Cada tabla contiene
 * exactamente seis filas (`d6` 1..6), cumpliendo el requisito 34.18.
 */
export const britishOrderTables: Readonly<
  Record<BritishUnitType, CanonicalTable<OrderTableInput, OrderTableResult>>
> = {
  "rifle-squad": makeOrderTable("rifle-squad", rifleSquadRows),
  "mg-team": makeOrderTable("mg-team", mgTeamRows),
  mortar: makeOrderTable("mortar", mortarRows),
  piat: makeOrderTable("piat", piatRows),
};

// ---------------------------------------------------------------------------
// 2. Valores base para impactar (Requisito 36 y 36.1)
// ---------------------------------------------------------------------------

/** Atacante o efecto con Valor para impactar base verificado. */
export type HitValueSubject =
  | "british-rifle-squad-fire"
  | "british-rifle-squad-grenade"
  | "british-mg-team-fire"
  | "british-piat"
  | "german-hmg"
  | "german-lmg"
  | "german-rifles"
  | "german-halftrack"
  | "german-artillery"
  | "mine";

/**
 * Valor base para impactar de un atacante o efecto. El `threshold` es el umbral
 * "n+" (total de 2d6 tras modificadores debe igualar o superar `n`).
 */
export type BaseHitValue = Readonly<{
  subject: HitValueSubject;
  /** Umbral base "n+" antes de modificadores permitidos. */
  threshold: number;
  /** Descripción `es-ES` del alcance funcional verificado. */
  scopeEs: string;
  /** Si el valor es fijo y excluye todos los modificadores de terreno/apoyo. */
  fixed: boolean;
  sourceRefs: readonly SourceRef[];
}>;

/**
 * Inventario de Valores base para impactar (requisito 36). Modela exactamente
 * las filas de la tabla verificada; los modificadores de terreno, Flanqueo,
 * Apoyo y Mortero los aplica el Motor de reglas (Tareas 9-10), no este fixture.
 */
export const baseHitValues: Readonly<Record<HitValueSubject, BaseHitValue>> = {
  "british-rifle-squad-fire": {
    subject: "british-rifle-squad-fire",
    threshold: 8,
    scopeEs: "Fuego contra Unidad alemana adyacente.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "british-rifle-squad-grenade": {
    subject: "british-rifle-squad-grenade",
    threshold: 6,
    scopeEs:
      "Granada fija contra Unidad alemana adyacente, sin bonos ni penalizadores.",
    fixed: true,
    sourceRefs: hitValueSourceRefs,
  },
  "british-mg-team-fire": {
    subject: "british-mg-team-fire",
    threshold: 6,
    scopeEs: "Fuego del Equipo MG británico.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "british-piat": {
    subject: "british-piat",
    threshold: 7,
    scopeEs:
      "Únicamente contra Semiorugas y Unidades alemanas en edificios.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "german-hmg": {
    subject: "german-hmg",
    threshold: 5,
    scopeEs: "HMG alemana.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "german-lmg": {
    subject: "german-lmg",
    threshold: 6,
    scopeEs: "LMG alemana.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "german-rifles": {
    subject: "german-rifles",
    threshold: 8,
    scopeEs: "Fusileros alemanes.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "german-halftrack": {
    subject: "german-halftrack",
    threshold: 6,
    scopeEs: "Semioruga alemana.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  "german-artillery": {
    subject: "german-artillery",
    threshold: 10,
    scopeEs: "Artillería alemana.",
    fixed: false,
    sourceRefs: hitValueSourceRefs,
  },
  mine: {
    subject: "mine",
    threshold: 7,
    scopeEs: "Mina, sin modificadores.",
    fixed: true,
    sourceRefs: hitValueSourceRefs,
  },
};

// ---------------------------------------------------------------------------
// 3. Inventario funcional de contadores de la página 47 (Requisitos 40.8/40.9)
//    Modelado como Recursos propios: no se copia arte del PDF.
// ---------------------------------------------------------------------------

/**
 * Identificadores de los contadores funcionales inventariados en la página 47.
 * El requisito 40.8 exige inventariar: Moral normal y baja, Fusileros, LMG,
 * HMG, Artillería, Semioruga, Cobertura, Incógnitas, Minas y turno.
 */
export type FunctionalCounterId =
  | "morale-normal"
  | "morale-low"
  | "rifles"
  | "lmg"
  | "hmg"
  | "artillery"
  | "halftrack"
  | "cover"
  | "unknown-marker"
  | "mine"
  | "turn";

/**
 * Contador funcional de la página 47 modelado como dato canónico (no imagen).
 * El diseño visible se produce como Recurso propio (ver `counterLicenseEntries`).
 */
export type FunctionalCounter = Readonly<{
  id: FunctionalCounterId;
  /** Nombre visible `es-ES` del contador. */
  nameEs: string;
  /** Bando funcional del contador, o `neutral` para marcadores de estado/juego. */
  side: "british" | "german" | "neutral";
  /** Descripción funcional `es-ES` del significado del contador. */
  functionEs: string;
  sourceRef: SourceRef;
}>;

/**
 * Inventario funcional de contadores de la página 47 (requisito 40.8). Cada
 * contador conserva su significado funcional verificado; el arte no se copia.
 */
export const functionalCounters: readonly FunctionalCounter[] = [
  {
    id: "morale-normal",
    nameEs: "Moral normal",
    side: "british",
    functionEs: "Estado de Moral normal de una Unidad británica.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "morale-low",
    nameEs: "Moral baja",
    side: "british",
    functionEs: "Estado de Moral baja de una Unidad británica.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "rifles",
    nameEs: "Fusileros",
    side: "german",
    functionEs: "Unidad de Fusileros alemanes.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "lmg",
    nameEs: "LMG",
    side: "german",
    functionEs: "Ametralladora ligera alemana.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "hmg",
    nameEs: "HMG",
    side: "german",
    functionEs: "Ametralladora pesada alemana.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "artillery",
    nameEs: "Artillería",
    side: "german",
    functionEs: "Unidad de Artillería alemana.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "halftrack",
    nameEs: "Semioruga",
    side: "german",
    functionEs: "Vehículo Semioruga alemán.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "cover",
    nameEs: "Cobertura",
    side: "neutral",
    functionEs: "Marcador de Cobertura acumulada de una Unidad británica.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "unknown-marker",
    nameEs: "Incógnita",
    side: "neutral",
    functionEs: "Marcador «?» cuyo contenido se determina al producirse un Revelado.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "mine",
    nameEs: "Mina",
    side: "neutral",
    functionEs: "Marcador de Mina colocado en un Hexágono.",
    sourceRef: counterInventorySourceRef,
  },
  {
    id: "turn",
    nameEs: "Turno",
    side: "neutral",
    functionEs: "Marcador del turno actual de la Misión.",
    sourceRef: counterInventorySourceRef,
  },
];

/**
 * Entradas del Inventario de licencias que clasifican como Recursos propios los
 * diseños distribuidos de cada contador funcional inventariado (requisito 40.9).
 */
export const counterLicenseEntries: readonly LicenseEntry[] = functionalCounters.map(
  (counter): LicenseEntry => ({
    resourceId: `own-counter-${counter.id}`,
    ownership: "own",
    author: "Propietario",
    provenance:
      "Diseño propio original que representa el significado funcional del contador sin reproducir arte del PDF.",
    scope: `Contador funcional «${counter.nameEs}» de la página 47.`,
  }),
);

/**
 * Versión de reglas asociada a estos fixtures. Placeholder alineado con la
 * Fuente lúdica única; el compilador de catálogo (Tarea 2.2) asigna la
 * `rulesVersion` definitiva al emitir la versión inmutable.
 */
export const ordersCombatCountersRulesVersion: RulesVersion = rulesVersionFon2022;

/** Marca de agrupación para exportar el conjunto como fixture cohesionado. */
export type OrdersCombatCountersFixture = Brand<
  Readonly<{
    orderTables: typeof britishOrderTables;
    hitValues: typeof baseHitValues;
    counters: typeof functionalCounters;
    counterLicenses: typeof counterLicenseEntries;
  }>,
  "OrdersCombatCountersFixture"
>;

/** Fixture agrupado de órdenes, valores para impactar y contadores. */
export const ordersCombatCountersFixture = {
  orderTables: britishOrderTables,
  hitValues: baseHitValues,
  counters: functionalCounters,
  counterLicenses: counterLicenseEntries,
} as OrdersCombatCountersFixture;
