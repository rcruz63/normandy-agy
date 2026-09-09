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
 * componen con `combat-resolver` para el Valor para impactar. La Tarea 11.1
 * añade `reveal-resolver` (Revelado de Incógnitas: sustitución por la Tabla de
 * la Misión en el mismo Hexágono, Orientación hacia la única reveladora o
 * suspensión DP-002 ante empate, Explorar sin prueba inmediata de Mina y
 * sustitución por Mina), que compone con `mines` para la persistencia y el
 * disparo de prueba, y con `order-effects` para los disparadores.
 */
export * from "./turn-order-policy.js";
export * from "./morale-policy.js";
export * from "./order-effects.js";
export * from "./combat-resolver.js";
export * from "./halftrack.js";
export * from "./mines.js";
export * from "./artillery.js";
export * from "./reveal-resolver.js";
// Tarea 11.2: preparación fiel (duración base∓1, fuerzas, unidades fijas
// reveladas, objetivo tipado, tabla) y desenlace (victoria hasta el último
// turno inclusive, derrota al concluir, solo el objetivo de la Misión,
// suspensión ante precedencia no resuelta).
export * from "./mission-setup.js";
export * from "./mission-outcome.js";
