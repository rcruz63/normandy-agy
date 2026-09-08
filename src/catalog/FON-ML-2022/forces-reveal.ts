/**
 * Fixtures canónicos verificados de fuerzas británicas, Tablas de revelado d6 y
 * Unidades alemanas fijas adicionales por Misión (requisito 33).
 *
 * Fuente: FON-ML-2022. Cada fila de fuerzas y revelado se asocia con su
 * Referencia de misión (páginas de reglas de Misión pares 16, 18, 20, 22, 24,
 * 26, 28, 30, 32, 34, 36, 38, 40, 42 y 44 para las Misiones 1..15).
 *
 * Alcance (Tarea 3.2): SOLO fuerzas británicas, filas de revelado d6 y unidades
 * fijas adicionales. No se define aquí la identidad de Misión (nombre visible,
 * duración, objetivos: Tarea 3.1) ni las Tablas de órdenes / valores para
 * impactar / contadores (Tarea 3.3).
 *
 * Frontera de catálogo: módulo puro. No importa DOM, IndexedDB, red, reloj ni
 * SDK de AWS. Solo tipos y datos inmutables (`Readonly`).
 *
 * Estado no publicable: este módulo NO fija posiciones ni Orientaciones
 * visuales de las unidades fijas. Toda ubicación/Orientación visual depende de
 * DP-001 y se deja marcada como Estado no publicable (req. 33.8); no se
 * inventan coordenadas ni orientaciones.
 */
import type { Brand } from "../../domain/identity/index.js";
import { catalogId } from "../../domain/identity/index.js";
import type {
  BritishForceKind,
  CanonicalTable,
  ForceEntry,
  MissionRefString,
  RevealResult,
  SourceRef,
  SquadDesignation,
  TableRow,
} from "../schemas/index.js";
import { canonicalTable, sourceRef } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Tipos canónicos importados de `src/catalog/schemas/`
// ---------------------------------------------------------------------------
// Los sub-modelos `SourceRef`, `ForceEntry`, `BritishForceKind`, `RevealResult`,
// `TableRow` y `CanonicalTable` provienen ahora del esquema canónico (Tarea 2.2
// unificó los antiguos alias locales). Se reexportan para conservar la API que
// consumen las pruebas y otras capas del catálogo.
export type {
  BritishForceKind,
  CanonicalTable,
  ForceEntry,
  RevealResult,
  SourceRef,
  TableRow,
};

/** Marca de dato cuya posición/Orientación visual depende de DP-001. */
export type NonPublishableVisual = Readonly<{
  /** Motivo canónico del bloqueo de publicación visual. */
  blockedBy: "DP-001";
  /** Aspecto visual pendiente (posición y/o Orientación). */
  aspect: "position" | "orientation" | "position-and-orientation";
  reason: string;
}>;

/** Un resultado de d6 (1..6). */
export type D6 = 1 | 2 | 3 | 4 | 5 | 6;

/** Clave de Misión verificada (M01..M15). */
export type MissionKey = Brand<`M${string}`, "MissionKey">;

// ---------------------------------------------------------------------------
// Referencias de fuente por Misión (páginas pares 16..44)
// ---------------------------------------------------------------------------

/** Número de página de reglas de la Misión N (1..15): 16 + 2*(N-1). */
export function missionPage(missionNumber: number): number {
  if (!Number.isInteger(missionNumber) || missionNumber < 1 || missionNumber > 15) {
    throw new RangeError(`Número de Misión fuera de 1..15: ${String(missionNumber)}`);
  }
  return 16 + 2 * (missionNumber - 1);
}

/** Clave de Misión canónica «M01».. «M15» a partir del número. */
export function missionKey(missionNumber: number): MissionKey {
  if (!Number.isInteger(missionNumber) || missionNumber < 1 || missionNumber > 15) {
    throw new RangeError(`Número de Misión fuera de 1..15: ${String(missionNumber)}`);
  }
  return `M${String(missionNumber).padStart(2, "0")}` as MissionKey;
}

/** Referencia de misión «FON-ML-2022-Mnn» a partir del número. */
export function missionRef(missionNumber: number): MissionRefString {
  return `FON-ML-2022-${missionKey(missionNumber)}` as MissionRefString;
}

function forcesSourceRef(missionNumber: number): SourceRef {
  return sourceRef({
    page: missionPage(missionNumber),
    element: "Fuerzas británicas de preparación",
    missionRef: missionRef(missionNumber),
  });
}

function revealSourceRef(missionNumber: number): SourceRef {
  return sourceRef({
    page: missionPage(missionNumber),
    element: "Tabla de revelado y unidades fijas adicionales",
    missionRef: missionRef(missionNumber),
  });
}

// ---------------------------------------------------------------------------
// Constructores de fuerzas
// ---------------------------------------------------------------------------

function rifleSquad(squad: SquadDesignation): ForceEntry {
  return { kind: "rifle-squad", labelEs: `Escuadra de fusileros ${squad}`, squad };
}
const MG_TEAM: ForceEntry = { kind: "mg-team", labelEs: "Equipo MG" };
const MORTAR: ForceEntry = { kind: "mortar", labelEs: "Mortero" };
const PIAT: ForceEntry = { kind: "piat", labelEs: "PIAT" };

const SQUAD_A = rifleSquad("A");
const SQUAD_B = rifleSquad("B");
const SQUAD_C = rifleSquad("C");

// ---------------------------------------------------------------------------
// Fuerzas británicas verificadas por Misión (req. 33, tabla de fuerzas)
// ---------------------------------------------------------------------------

/** Fuerzas británicas de preparación de una Misión con su Referencia de fuente. */
export type BritishForcesFixture = Readonly<{
  missionNumber: number;
  missionKey: MissionKey;
  forces: readonly [ForceEntry, ...ForceEntry[]];
  sourceRefs: readonly [SourceRef, ...SourceRef[]];
}>;

function britishForces(
  missionNumber: number,
  forces: readonly [ForceEntry, ...ForceEntry[]],
): BritishForcesFixture {
  return {
    missionNumber,
    missionKey: missionKey(missionNumber),
    forces,
    sourceRefs: [forcesSourceRef(missionNumber)],
  };
}

/**
 * Fuerzas británicas exactas por Misión (requisito 33, tabla «Fuerzas
 * británicas verificadas»). Claves M01..M15.
 */
export const BRITISH_FORCES_BY_MISSION: Readonly<Record<string, BritishForcesFixture>> =
  Object.freeze({
    // 1-2: Escuadras de fusileros A y B
    M01: britishForces(1, [SQUAD_A, SQUAD_B]),
    M02: britishForces(2, [SQUAD_A, SQUAD_B]),
    // 3-4: Escuadras de fusileros A, B y C
    M03: britishForces(3, [SQUAD_A, SQUAD_B, SQUAD_C]),
    M04: britishForces(4, [SQUAD_A, SQUAD_B, SQUAD_C]),
    // 5: Escuadras de fusileros A y B, y Equipo MG
    M05: britishForces(5, [SQUAD_A, SQUAD_B, MG_TEAM]),
    // 6: Escuadras de fusileros A, B y C, y Equipo MG
    M06: britishForces(6, [SQUAD_A, SQUAD_B, SQUAD_C, MG_TEAM]),
    // 7: Escuadras de fusileros A, B y C, Mortero y PIAT
    M07: britishForces(7, [SQUAD_A, SQUAD_B, SQUAD_C, MORTAR, PIAT]),
    // 8: Escuadras de fusileros A y B, Equipo MG y Mortero
    M08: britishForces(8, [SQUAD_A, SQUAD_B, MG_TEAM, MORTAR]),
    // 9: Escuadras de fusileros A y B, Equipo MG, Mortero y PIAT
    M09: britishForces(9, [SQUAD_A, SQUAD_B, MG_TEAM, MORTAR, PIAT]),
    // 10: Escuadras de fusileros A y B, Equipo MG y PIAT
    M10: britishForces(10, [SQUAD_A, SQUAD_B, MG_TEAM, PIAT]),
    // 11: Escuadras de fusileros A, B y C, y Equipo MG
    M11: britishForces(11, [SQUAD_A, SQUAD_B, SQUAD_C, MG_TEAM]),
    // 12: Escuadras de fusileros A, B y C, Mortero y PIAT
    M12: britishForces(12, [SQUAD_A, SQUAD_B, SQUAD_C, MORTAR, PIAT]),
    // 13: Escuadras de fusileros A, B y C, Equipo MG y Mortero
    M13: britishForces(13, [SQUAD_A, SQUAD_B, SQUAD_C, MG_TEAM, MORTAR]),
    // 14-15: Escuadras de fusileros A, B y C, Equipo MG y PIAT
    M14: britishForces(14, [SQUAD_A, SQUAD_B, SQUAD_C, MG_TEAM, PIAT]),
    M15: britishForces(15, [SQUAD_A, SQUAD_B, SQUAD_C, MG_TEAM, PIAT]),
  });

// ---------------------------------------------------------------------------
// Tablas de revelado d6 verificadas por Misión (req. 33, tabla de revelado)
// ---------------------------------------------------------------------------

const ALL_D6: readonly D6[] = Object.freeze([1, 2, 3, 4, 5, 6] as const);

/**
 * Construye una Tabla de revelado canónica d6 asignando a cada valor 1..6 su
 * `RevealResult`. Valida cobertura total del dominio 1..6 (salida única por
 * entrada) para respetar la pureza del catálogo.
 */
function revealTable(
  missionNumber: number,
  assignment: Readonly<Record<D6, RevealResult>>,
): CanonicalTable<D6, RevealResult> {
  const rows: TableRow<D6, RevealResult>[] = ALL_D6.map((value) => ({
    input: value,
    output: assignment[value],
  }));
  return canonicalTable<D6, RevealResult>({
    id: catalogId(`FON-ML-2022-reveal-${missionKey(missionNumber)}`),
    rows,
    inputDomain: ALL_D6,
    sourceRefs: [revealSourceRef(missionNumber)],
  });
}

/**
 * Tablas de revelado d6 exactas por Misión (requisito 33, tabla «Tablas de
 * revelado y unidades fijas verificadas»). Cada Misión mapea 1..6 a un
 * `RevealResult`.
 */
export const REVEAL_TABLE_BY_MISSION: Readonly<
  Record<string, CanonicalTable<D6, RevealResult>>
> = Object.freeze({
  // 1-2: 1-2 HMG; 3-6 LMG
  M01: revealTable(1, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "LMG", 6: "LMG" }),
  M02: revealTable(2, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "LMG", 6: "LMG" }),
  // 3-6: 1-2 HMG; 3-4 LMG; 5-6 Fusileros
  M03: revealTable(3, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  M04: revealTable(4, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  M05: revealTable(5, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  M06: revealTable(6, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  // 7: 1 HMG; 2-3 LMG; 4-5 Fusileros; 6 Mina
  M07: revealTable(7, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "german-rifles", 5: "german-rifles", 6: "mine" }),
  // 8: 1 HMG; 2-4 LMG; 5 Fusileros; 6 Mina
  M08: revealTable(8, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "mine" }),
  // 9 y 12: 1-2 HMG; 3 LMG; 4-5 Fusileros; 6 Mina
  M09: revealTable(9, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "german-rifles", 5: "german-rifles", 6: "mine" }),
  M12: revealTable(12, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "german-rifles", 5: "german-rifles", 6: "mine" }),
  // 10: 1-2 HMG; 3-4 LMG; 5-6 Fusileros
  M10: revealTable(10, { 1: "HMG", 2: "HMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  // 11: 1 HMG; 2-3 LMG; 4-5 Fusileros; 6 Mina
  M11: revealTable(11, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "german-rifles", 5: "german-rifles", 6: "mine" }),
  // 13: 1 HMG; 2-4 LMG; 5-6 Fusileros
  M13: revealTable(13, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "german-rifles" }),
  // 14: 1 HMG; 2-4 LMG; 5 Fusileros; 6 Mina
  M14: revealTable(14, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "mine" }),
  // 15: 1 HMG; 2-4 LMG; 5 Fusileros; 6 Mina
  M15: revealTable(15, { 1: "HMG", 2: "LMG", 3: "LMG", 4: "LMG", 5: "german-rifles", 6: "mine" }),
});

// ---------------------------------------------------------------------------
// Unidades alemanas fijas adicionales verificadas por Misión (req. 33)
// ---------------------------------------------------------------------------

/**
 * Tipo de Unidad alemana fija adicional que puede aparecer en la fila de la
 * Misión. Etiqueta visible en es-ES en {@link fixedUnit}.
 */
export type FixedGermanUnitKind =
  | "HMG"
  | "LMG"
  | "half-track"
  | "artillery";

/**
 * Unidad alemana fija adicional. La posición y Orientación visual dependen de
 * DP-001 y se dejan en Estado no publicable (req. 33.8): NO se fijan
 * coordenadas ni orientaciones.
 */
export type FixedGermanUnit = Readonly<{
  kind: FixedGermanUnitKind;
  /** Nombre visible en es-ES. */
  labelEs: string;
  /**
   * Anclaje semántico verificado en la fuente cuando el requisito lo indica
   * (p. ej. la LMG de la Misión 8 en el Hexágono de la iglesia). La posición y
   * Orientación visuales siguen bloqueadas por DP-001.
   */
  semanticAnchorEs?: string;
  /** Marca de Estado no publicable de su posición/Orientación visual. */
  visual: NonPublishableVisual;
}>;

const DP001_POSITION_AND_ORIENTATION: NonPublishableVisual = Object.freeze({
  blockedBy: "DP-001",
  aspect: "position-and-orientation",
  reason:
    "Posición y Orientación visual de la unidad fija pendientes de DP-001; Estado no publicable (req. 33.8).",
});

function fixedUnit(
  kind: FixedGermanUnitKind,
  labelEs: string,
  semanticAnchorEs?: string,
): FixedGermanUnit {
  return semanticAnchorEs === undefined
    ? { kind, labelEs, visual: DP001_POSITION_AND_ORIENTATION }
    : { kind, labelEs, semanticAnchorEs, visual: DP001_POSITION_AND_ORIENTATION };
}

const HMG_UNIT = (): FixedGermanUnit => fixedUnit("HMG", "HMG alemana");
const LMG_UNIT = (anchor?: string): FixedGermanUnit => fixedUnit("LMG", "LMG alemana", anchor);
const HALF_TRACK = (): FixedGermanUnit => fixedUnit("half-track", "Semioruga");
const ARTILLERY = (): FixedGermanUnit => fixedUnit("artillery", "Artillería");

/**
 * Registro de unidades fijas adicionales de una Misión. La ausencia se
 * registra EXPLÍCITAMENTE (`present: false`), nunca se omite en silencio
 * (req. 33.6).
 */
export type FixedGermanForcesFixture = Readonly<{
  missionNumber: number;
  missionKey: MissionKey;
  sourceRefs: readonly [SourceRef, ...SourceRef[]];
}> &
  (
    | Readonly<{ present: true; units: readonly [FixedGermanUnit, ...FixedGermanUnit[]] }>
    | Readonly<{ present: false; absenceNote: string }>
  );

function withFixed(
  missionNumber: number,
  units: readonly [FixedGermanUnit, ...FixedGermanUnit[]],
): FixedGermanForcesFixture {
  return {
    missionNumber,
    missionKey: missionKey(missionNumber),
    sourceRefs: [revealSourceRef(missionNumber)],
    present: true,
    units,
  };
}

function withoutFixed(missionNumber: number): FixedGermanForcesFixture {
  return {
    missionNumber,
    missionKey: missionKey(missionNumber),
    sourceRefs: [revealSourceRef(missionNumber)],
    present: false,
    absenceNote: "Ninguna unidad fija adicional indicada (ausencia explícita, req. 33.6).",
  };
}

/**
 * Unidades alemanas fijas adicionales exactas por Misión (requisito 33). Las
 * Misiones sin unidad fija registran ausencia explícita. Las posiciones y
 * Orientaciones visuales quedan en Estado no publicable (DP-001).
 */
export const FIXED_GERMAN_FORCES_BY_MISSION: Readonly<
  Record<string, FixedGermanForcesFixture>
> = Object.freeze({
  // 1-2: Ninguna indicada
  M01: withoutFixed(1),
  M02: withoutFixed(2),
  // 3-6: Ninguna indicada
  M03: withoutFixed(3),
  M04: withoutFixed(4),
  M05: withoutFixed(5),
  M06: withoutFixed(6),
  // 7: Semioruga
  M07: withFixed(7, [HALF_TRACK()]),
  // 8: LMG (req. 33.4: LMG fija y revelada en el Hexágono de la iglesia)
  M08: withFixed(8, [LMG_UNIT("Hexágono de la iglesia")]),
  // 9: Semioruga
  M09: withFixed(9, [HALF_TRACK()]),
  // 10: Semioruga y Artillería
  M10: withFixed(10, [HALF_TRACK(), ARTILLERY()]),
  // 11: Artillería y LMG (req. 33.5)
  M11: withFixed(11, [ARTILLERY(), LMG_UNIT()]),
  // 12: Semioruga
  M12: withFixed(12, [HALF_TRACK()]),
  // 13: Artillería y HMG
  M13: withFixed(13, [ARTILLERY(), HMG_UNIT()]),
  // 14: Semioruga, Artillería y HMG
  M14: withFixed(14, [HALF_TRACK(), ARTILLERY(), HMG_UNIT()]),
  // 15: Artillería y LMG
  M15: withFixed(15, [ARTILLERY(), LMG_UNIT()]),
});

/** Conjunto ordenado de claves de Misión cubiertas: M01..M15. */
export const MISSION_KEYS: readonly MissionKey[] = Object.freeze(
  Array.from({ length: 15 }, (_unused, index) => missionKey(index + 1)),
);
