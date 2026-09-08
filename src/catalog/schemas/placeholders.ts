/**
 * Tipos de sub-modelo del catálogo referenciados por el esquema.
 *
 * Tras la Tarea 2.2 (unificación de alias) este módulo cumple dos papeles:
 *
 * 1. Define de forma REAL los sub-tipos que los fixtures de FON-ML-2022 ya
 *    concretan: `ForceEntry` (fuerzas y unidades fijas), `RevealResult`
 *    (resultado de la Tabla de revelado) y `OrderTable` (Tabla de órdenes por
 *    tipo de Unidad). Estos dejan de ser marcas opacas y pasan a ser tipos
 *    `Readonly` alineados con los datos verificados.
 *
 * 2. Conserva como marcas opacas (`Brand`) los sub-tipos cuya forma rica
 *    pertenece a tareas posteriores y que este round NO define:
 *    - Geometría de mapa y fichas (`HexMapDefinition`, `PieceDefinition`): Tarea 5.
 *    - Objetivo y preparación de Misión (`ObjectiveDefinition`, `SetupDefinition`):
 *      Tareas 9-11.
 *    - Predicados y efectos declarativos de reglas (`DeclarativePredicate`,
 *      `DeclarativeEffect`): Tarea 8.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { Brand } from "../../domain/identity/index.js";
import type { CanonicalTable } from "./catalog.js";

// --- Geometría y fichas (Tarea 5) ---
export type HexMapDefinition = Brand<unknown, "HexMapDefinition">;
export type PieceDefinition = Brand<unknown, "PieceDefinition">;

// --- Objetivo y preparación de Misión (Tareas 9-11) ---
export type ObjectiveDefinition = Brand<unknown, "ObjectiveDefinition">;
export type SetupDefinition = Brand<unknown, "SetupDefinition">;

// --- Reglas declarativas (Tarea 8) ---
export type DeclarativePredicate = Brand<unknown, "DeclarativePredicate">;
export type DeclarativeEffect = Brand<unknown, "DeclarativeEffect">;

// ---------------------------------------------------------------------------
// Sub-tipos REALES alineados con los fixtures verificados de FON-ML-2022
// (Tarea 2.2). No se importan desde los fixtures para no invertir la frontera
// (esquema ← fixtures); en su lugar el esquema declara la forma canónica y los
// fixtures la consumen.
// ---------------------------------------------------------------------------

/**
 * Tipos de Unidad británica verificados (requisito 33). Etiqueta visible en
 * es-ES en cada {@link ForceEntry}.
 */
export type BritishForceKind = "rifle-squad" | "mg-team" | "mortar" | "piat";

/** Designación de escuadra de fusileros cuando aplica. */
export type SquadDesignation = "A" | "B" | "C";

/**
 * Entrada de fuerza británica de preparación de una Misión (requisito 33).
 *
 * `squad` solo está presente para Escuadras de fusileros; se omite para
 * equipos y armas de apoyo únicas (`exactOptionalPropertyTypes`).
 */
export type ForceEntry = Readonly<{
  kind: BritishForceKind;
  /** Nombre visible en es-ES. */
  labelEs: string;
  squad?: SquadDesignation;
}>;

/**
 * Resultado de un Revelado (requisito 33): la Unidad alemana o Mina a la que la
 * Tabla de revelado de la Misión transforma un resultado de d6.
 */
export type RevealResult = "HMG" | "LMG" | "german-rifles" | "mine";

/** Entrada de una Tabla de órdenes: el valor de un d6 (1..6). */
export type OrderTableInput = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Códigos de Orden verificados de la Tabla de órdenes (requisito 34). Las
 * abreviaturas coinciden con la fuente; el nombre visible se redacta en es-ES.
 */
export type OrderCode = "RAL" | "GRE" | "ADV" | "SCO" | "COV" | "FIRE";

/** Resultado de una fila de la Tabla de órdenes: primera y segunda Orden. */
export type OrderTableResult = Readonly<{
  first: OrderCode;
  second: OrderCode;
}>;

/**
 * Tabla de órdenes de un tipo de Unidad británica (requisito 34): una
 * {@link CanonicalTable} que cruza cada d6 1..6 con su par de Órdenes.
 */
export type OrderTable = CanonicalTable<OrderTableInput, OrderTableResult>;
