/**
 * Fixtures canónicos de IDENTIDAD de las quince Misiones (requisito 32).
 *
 * Este módulo codifica únicamente la identidad verificada de cada Misión de
 * FON-ML-2022 tal como aparece en la tabla de datos de aceptación del
 * requisito 32:
 *
 * - Nombre visible propio en `es-ES` (único contenido de juego).
 * - Título inglés conservado SOLO como metadato de trazabilidad/mantenimiento.
 * - Turnos base.
 * - Objetivo de victoria (texto en `es-ES`).
 * - Referencia de misión `FON-ML-2022-Mnn` con sus dos páginas de fuente:
 *   Página de reglas de Misión `16 + 2 × (N - 1)` y Página de Mapa
 *   `17 + 2 × (N - 1)` (requisito 32 y requisito 1).
 * - Exactamente tres opciones de duración: base−1, base, base+1.
 *
 * Fuera de alcance (otras tareas): fuerzas/revelado/unidades fijas (Tarea 3.2),
 * órdenes/impactos/contadores (Tarea 3.3), mapa/geometría (Tarea 5). Todo dato
 * visual o de mapa que dependa de DP-001 permanece en «Estado no publicable» y
 * NO se fabrica aquí. No se copia prosa protegida del PDF.
 *
 * Nota de frontera: este módulo vive en `catalog/` y no importa DOM, IndexedDB,
 * red, reloj ni SDK de AWS. Es puro y determinista.
 *
 * Nota de integración (Tarea 2.2): los tipos de catálogo ricos
 * (`SourceRef`, `MissionRefString`, `DurationOptions`, …) los define la Tarea
 * 2.1 en `src/catalog/schemas/` y aquí se IMPORTAN de su barril. Este módulo
 * codifica la identidad de Misión como un subconjunto (`MissionIdentity`) del
 * `MissionDefinition` canónico; el compilador (Tarea 2.2) ensambla la
 * definición completa combinando esta identidad con fuerzas, revelado, mapa,
 * etc.
 */
import type { MissionId } from "../../domain/identity/index.js";
import { missionId } from "../../domain/identity/index.js";
import type {
  DurationOptions,
  MissionRefString,
  SourceRef,
} from "../schemas/index.js";
import {
  DURATION_OPTIONS,
  missionMapPage as schemaMissionMapPage,
  missionRulesPage as schemaMissionRulesPage,
  sourceRef,
} from "../schemas/index.js";

// Reexporta los tipos y constantes canónicos para conservar la API previa del
// fixture (consumida por pruebas y otras capas del catálogo).
export type { DurationOptions, SourceRef };
export { DURATION_OPTIONS };

/**
 * Identidad verificada de una Misión (subconjunto propio de la Tarea 3.1).
 * Converge con `MissionDefinition` de `src/catalog/schemas/`, que añade
 * `setup`, `map`, `britishForces`, `revealTable`, etc. El compilador (Tarea
 * 2.2) ensambla la `MissionDefinition` completa a partir de esta identidad.
 */
export type MissionIdentity = Readonly<{
  id: MissionId;
  /** Número de Misión 1..15. */
  number: number;
  /** Nombre visible propio en es-ES (único contenido de juego). */
  visibleNameEs: string;
  /** Título inglés solo como metadato de trazabilidad; nunca contenido de juego. */
  maintenanceMetadata: Readonly<{ originalTitle: string }>;
  /** Turnos base indicados en la tabla del requisito 32. */
  baseTurns: number;
  /** Exactamente tres opciones: base−1, base, base+1 (requisito 32.5). */
  durationOptions: DurationOptions;
  /** Objetivo de victoria en es-ES (requisito 32.11). */
  objectiveEs: string;
  /** Referencia de misión `FON-ML-2022-Mnn`. */
  missionRef: MissionRefString;
  /** Página de reglas de Misión y Página de Mapa (requisito 32 / 1). */
  sourceRefs: readonly [SourceRef, SourceRef];
}>;

// --- Utilidades de derivación de referencias (requisito 32 / 1) ---

/** Formatea el número de Misión como dos dígitos: 1 -> "01", 15 -> "15". */
function twoDigits(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Referencia de misión canónica `FON-ML-2022-Mnn`. */
function missionRefOf(n: number): MissionRefString {
  return `FON-ML-2022-M${twoDigits(n)}` as MissionRefString;
}

/** Página de reglas de Misión: `16 + 2 × (N - 1)` (constructor canónico). */
export function missionRulesPage(n: number): number {
  return schemaMissionRulesPage(n);
}

/** Página de Mapa: `17 + 2 × (N - 1)` (constructor canónico). */
export function missionMapPage(n: number): number {
  return schemaMissionMapPage(n);
}

/**
 * Datos verbatim verificados de la tabla del requisito 32. Solo identidad:
 * número, nombre es-ES, título inglés (metadato), turnos base y objetivo es-ES.
 */
type MissionSeed = Readonly<{
  number: number;
  visibleNameEs: string;
  originalTitle: string;
  baseTurns: number;
  objectiveEs: string;
}>;

const MISSION_SEEDS: readonly MissionSeed[] = [
  {
    number: 1,
    visibleNameEs: "Control del bosque I",
    originalTitle: "Secure the Woods (1)",
    baseTurns: 4,
    objectiveEs: "Eliminar la única Unidad alemana revelada",
  },
  {
    number: 2,
    visibleNameEs: "Control del bosque II",
    originalTitle: "Secure the Woods (2)",
    baseTurns: 5,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 3,
    visibleNameEs: "Control del edificio",
    originalTitle: "Secure the Building",
    baseTurns: 6,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 4,
    visibleNameEs: "Control de la colina",
    originalTitle: "Secure the Hill",
    baseTurns: 6,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 5,
    visibleNameEs: "Control de la zona I",
    originalTitle: "Secure the Area (1)",
    baseTurns: 6,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 6,
    visibleNameEs: "Control de la zona II",
    originalTitle: "Secure the Area (2)",
    baseTurns: 6,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 7,
    visibleNameEs: "Control de la aldea I",
    originalTitle: "Secure the Village (1)",
    baseTurns: 7,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 8,
    visibleNameEs: "Entrada en la iglesia",
    originalTitle: "Enter the Church",
    baseTurns: 8,
    objectiveEs:
      "Ocupar el Hexágono de la iglesia con cualquier Unidad británica, sin exigir eliminar las demás Unidades alemanas",
  },
  {
    number: 9,
    visibleNameEs: "Control de la aldea II",
    originalTitle: "Secure the Village (2)",
    baseTurns: 8,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 10,
    visibleNameEs: "Control del bosque III",
    originalTitle: "Secure the Woods (3)",
    baseTurns: 8,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 11,
    visibleNameEs: "Neutralizar la artillería alemana",
    originalTitle: "Destroy the German Artillery",
    baseTurns: 8,
    objectiveEs: "Destruir la Artillería alemana",
  },
  {
    number: 12,
    visibleNameEs: "Control de la aldea III",
    originalTitle: "Secure the Village (3)",
    baseTurns: 8,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 13,
    visibleNameEs: "Jornada adversa",
    originalTitle: "Unlucky for Some",
    baseTurns: 8,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
  {
    number: 14,
    visibleNameEs: "Periferia de Caen",
    originalTitle: "On the Outskirts of the City of Caen",
    baseTurns: 8,
    objectiveEs: "Ocupar el Hexágono de la iglesia con cualquier Unidad británica",
  },
  {
    number: 15,
    visibleNameEs: "Control de la ciudad de Caen",
    originalTitle: "Secure the City of Caen",
    baseTurns: 8,
    objectiveEs: "Revelar y eliminar todas las Unidades alemanas",
  },
] as const;

/** Construye la identidad completa de una Misión a partir de su semilla. */
function toMissionIdentity(seed: MissionSeed): MissionIdentity {
  const ref = missionRefOf(seed.number);
  return {
    id: missionId(ref),
    number: seed.number,
    visibleNameEs: seed.visibleNameEs,
    maintenanceMetadata: { originalTitle: seed.originalTitle },
    baseTurns: seed.baseTurns,
    durationOptions: DURATION_OPTIONS,
    objectiveEs: seed.objectiveEs,
    missionRef: ref,
    sourceRefs: [
      sourceRef({
        page: missionRulesPage(seed.number),
        element: "Página de reglas de Misión",
        missionRef: ref,
      }),
      sourceRef({
        page: missionMapPage(seed.number),
        element: "Página de Mapa",
        missionRef: ref,
      }),
    ],
  };
}

/**
 * Las quince Misiones verificadas (M01..M15), en orden por número de Misión.
 * Requisitos 32.1, 32.2, 32.3, 32.4, 32.5, 32.8, 32.9, 32.10, 32.11, 32.12.
 */
export const MISSIONS: readonly MissionIdentity[] = MISSION_SEEDS.map(
  toMissionIdentity,
);

/** Índice por número de Misión (1..15) para búsquedas O(1). */
export const MISSIONS_BY_NUMBER: ReadonlyMap<number, MissionIdentity> = new Map(
  MISSIONS.map((m) => [m.number, m]),
);

/** Devuelve la identidad de una Misión por número, o `undefined` si no existe. */
export function getMissionByNumber(n: number): MissionIdentity | undefined {
  return MISSIONS_BY_NUMBER.get(n);
}
