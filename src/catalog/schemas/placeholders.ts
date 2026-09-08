/**
 * Marcadores provisionales de tipos referenciados por el esquema de catálogo
 * pero cuya forma rica pertenece a otras tareas (Tarea 2.1 solo fija el
 * esquema de catálogo y fuente).
 *
 * Siguiendo el patrón de `src/domain/ports/placeholders.ts`, estos tipos se
 * declaran como marcas opacas para que `RulesCatalog`, `MissionDefinition`,
 * `CanonicalRule` y `CanonicalTable` compilen con fronteras estrictas sin fijar
 * prematuramente detalles que otras tareas definirán:
 *
 * - Geometría de mapa y fichas (`HexMapDefinition`, `PieceDefinition`): Tarea 5.
 * - Datos lúdicos concretos de las quince Misiones (objetivos, preparación,
 *   fuerzas, tablas de órdenes, resultados de revelado): Tareas 3.x y 9-11.
 * - Predicados y efectos declarativos de las reglas: Tarea 8.
 *
 * Cada tarea posterior sustituirá el marcador correspondiente por su definición
 * real. Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { Brand } from "../../domain/identity/index.js";

// --- Geometría y fichas (Tarea 5) ---
export type HexMapDefinition = Brand<unknown, "HexMapDefinition">;
export type PieceDefinition = Brand<unknown, "PieceDefinition">;

// --- Datos lúdicos concretos (Tareas 3.x, 9-11) ---
export type ObjectiveDefinition = Brand<unknown, "ObjectiveDefinition">;
export type SetupDefinition = Brand<unknown, "SetupDefinition">;
export type ForceEntry = Brand<unknown, "ForceEntry">;
export type RevealResult = Brand<unknown, "RevealResult">;
export type OrderTable = Brand<unknown, "OrderTable">;

// --- Reglas declarativas (Tarea 8) ---
export type DeclarativePredicate = Brand<unknown, "DeclarativePredicate">;
export type DeclarativeEffect = Brand<unknown, "DeclarativeEffect">;
