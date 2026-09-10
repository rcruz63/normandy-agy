/**
 * Barril de los componentes de la Interfaz (`ui/components`).
 *
 * Reexporta el {@link DiceRollDialog} (Tarea 20.4): su máquina de estado y
 * proyección de presentación ({@link dice-roll-dialog}) y la capa fina de render
 * a markup accesible ({@link dice-roll-dialog-render}). Todos son módulos de
 * presentación pura: no generan aleatoriedad ni interpretan reglas.
 */
export * from "./dice-roll-dialog.js";
export * from "./dice-roll-dialog-render.js";
