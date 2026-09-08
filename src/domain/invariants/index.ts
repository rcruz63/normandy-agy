/**
 * Punto de entrada del submódulo de Invariantes (Tarea 7.2).
 *
 * Reexporta el `InvariantValidator` puro para que las tareas 8.x (Motor de
 * reglas) y 15.x/16.x (persistencia y recuperación) validen Instantáneas y
 * propuestas de transición contra las Invariantes funcionales del dominio.
 */
export * from "./invariant-validator.js";
