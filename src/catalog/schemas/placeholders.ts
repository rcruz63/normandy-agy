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

// --- Objetivo y preparación de Misión ---
// Concretados por la spec del JUEGO (fields-of-normandy-game, tarea 15). Antes
// eran marcas opacas `Brand<unknown>` (Tareas 9-11 sin cerrar). Ahora tienen
// forma real y evaluable para poder ensamblar el bucle jugable.
//
// FRONTERA: el esquema NO importa `domain/rules` (evita invertir la dirección
// esquema→dominio). Reproduce aquí la forma del objetivo tipado que el dominio
// evalúa en `mission-outcome.ts` (`MissionObjective`), y la generaliza
// `occupy-hex` (superconjunto de `occupy-church-hex`). La capa de aplicación
// adapta entre ambas representaciones cuando invoca al dominio.

/** Identificador de Hexágono en el esquema (cadena; el dominio la marca como `HexId`). */
export type ObjectiveHexRef = string;

/**
 * Objetivo de victoria de una Misión, estructurado y evaluable. Espeja
 * `MissionObjective` del dominio y generaliza la ocupación a un Hexágono
 * cualquiera (`occupy-hex`), del que `occupy-church-hex` es un caso concreto.
 */
export type ObjectiveDefinition =
  | Readonly<{ kind: "eliminate-all-germans" }>
  | Readonly<{ kind: "eliminate-single-revealed-german" }>
  | Readonly<{ kind: "destroy-artillery" }>
  | Readonly<{ kind: "occupy-hex"; hexId: ObjectiveHexRef }>;

/** Orientación de una Ficha en la colocación inicial (cadena; el dominio usa `DirectionId`). */
export type SetupOrientation = string;

/** Colocación inicial de una Ficha propia sobre un Hexágono de salida. */
export type StartingPlacement = Readonly<{
  /** Identificador de la Ficha colocada. */
  pieceId: string;
  /** Identificador de la definición de contador (catálogo). */
  definitionId: string;
  /** Hexágono de salida (triángulo negro para las británicas). */
  hexId: ObjectiveHexRef;
  /** Orientación inicial, si la preparación la fija. */
  orientation?: SetupOrientation;
}>;

/** Colocación inicial de una Incógnita alemana sobre un Hexágono. */
export type UnknownPlacement = Readonly<{
  unknownId: string;
  hexId: ObjectiveHexRef;
}>;

/**
 * Preparación (colocación inicial) de una Misión: dónde empiezan las fuerzas
 * británicas, las unidades alemanas fijas y las Incógnitas. Es lo que hoy falta
 * para que el estado inicial no sea `pieces: {}`. La elección de entrada
 * (`entryChoice`) ofrece solo las opciones definidas por la Misión.
 */
export type SetupDefinition = Readonly<{
  britishStart: readonly StartingPlacement[];
  fixedGermanStart: readonly StartingPlacement[];
  unknowns: readonly UnknownPlacement[];
  entryChoice?: Readonly<{ options: readonly string[] }>;
}>;

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
