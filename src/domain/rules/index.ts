/**
 * Punto de entrada del submódulo de reglas del dominio (`src/domain/rules`).
 *
 * Reexporta las políticas puras de reglas para que la capa de aplicación las
 * consuma por un único módulo. La Tarea 9.1 aporta `TurnOrderPolicy`; la Tarea
 * 9.2 añade `MoralePolicy` (impactos, Reagrupar y limitación de Órdenes); la
 * Tarea 9.3 añade `order-effects` (efectos concretos de las Órdenes: Avanzar,
 * Fuego, Granada, Cobertura, Explorar) sin colisionar con las anteriores.
 */
export * from "./turn-order-policy.js";
export * from "./morale-policy.js";
export * from "./order-effects.js";
