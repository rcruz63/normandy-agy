/**
 * Punto de entrada del submódulo de Estado de partida y transición (Tarea 7).
 *
 * Reexporta los modelos concretos de estado (Tarea 7.1) y transición para que
 * las tareas 8.x (Motor de reglas) y 15.x/16.x (persistencia) los cableen.
 */
export * from "./state.js";
export * from "./transition.js";
