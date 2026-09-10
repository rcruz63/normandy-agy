/**
 * Barril de accesibilidad de la Interfaz (`ui/a11y`, Tarea 21.1).
 *
 * Reexporta la codificación perceptiva más allá del color
 * ({@link accessible-encoding}) —bando, estado, visibilidad, Moral, Orientación,
 * terreno, selección y resultado con texto/forma/patrón/icono además de color
 * (requisitos 10.7, 25.1, 25.4, 25.5, 25.7)—, la comprobación de objetivos
 * táctiles mínimos de 44×44 Píxeles CSS ({@link touch-target}, requisito 24.4) y
 * la equivalencia entre animaciones de cambio de estado y el Registro simple
 * ({@link animation-log-equivalence}, requisito 25.6).
 */
export * from "./accessible-encoding.js";
export * from "./touch-target.js";
export * from "./animation-log-equivalence.js";
