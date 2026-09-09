/**
 * Punto de entrada del submódulo de reglas del dominio (`src/domain/rules`).
 *
 * Reexporta las políticas puras de reglas para que la capa de aplicación las
 * consuma por un único módulo. La Tarea 9.1 aporta `TurnOrderPolicy`; las Tareas
 * 9.2 (`MoralePolicy`) y 9.3 (efectos de Orden) añadirán sus propios módulos
 * cohesionados aquí sin colisionar.
 */
export * from "./turn-order-policy.js";
