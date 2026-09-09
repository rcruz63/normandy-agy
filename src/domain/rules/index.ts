/**
 * Punto de entrada del submódulo de reglas del dominio (`src/domain/rules`).
 *
 * Reexporta las políticas puras de reglas para que la capa de aplicación las
 * consuma por un único módulo. La Tarea 9.1 aporta `TurnOrderPolicy`; la Tarea
 * 9.2 añade `MoralePolicy` (impactos, Reagrupar y limitación de Órdenes); la
 * Tarea 9.3 añade `order-effects` (efectos concretos de las Órdenes: Avanzar,
 * Fuego, Granada, Cobertura, Explorar) sin colisionar con las anteriores; la
 * Tarea 10.1 añade `combat-resolver` (Valor para impactar efectivo, suma
 * algebraica, exclusiones de terreno/Flanqueo/Apoyo/Mortero y PIAT); la Tarea
 * 10.2 añade las reglas de elementos especiales: `halftrack` (Semioruga solo
 * atacable por PIAT con Apoyo), `mines` (disparo y persistencia de la Mina) y
 * `artillery` (selección de objetivo 10+ sin Flanqueo y eliminación), que
 * componen con `combat-resolver` para el Valor para impactar.
 */
export * from "./turn-order-policy.js";
export * from "./morale-policy.js";
export * from "./order-effects.js";
export * from "./combat-resolver.js";
export * from "./halftrack.js";
export * from "./mines.js";
export * from "./artillery.js";
