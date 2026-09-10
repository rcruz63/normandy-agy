/**
 * Barril de las vistas de la interfaz (Tareas 20.3 y 20.5).
 *
 * Reexporta el `ViewState` independiente del dominio y sus operaciones puras
 * ({@link view-state}) junto con la proyección del Mapa hexagonal a SVG
 * responsive y su capa semántica sincronizada ({@link map-view}).
 *
 * Añade las proyecciones `es-ES` de la Tarea 20.5: la proyección de Acciones
 * disponibles ({@link action-projection}) y el selector de Misiones publicables
 * ({@link mission-selector}).
 *
 * El estado de vista de los registros ({@link log-view}) —alternar registro
 * conservando la posición de lectura (20.8) y expandir/contraer entradas
 * detalladas (20.9)— se reexporta bajo el espacio de nombres `LogView` para no
 * colisionar con las operaciones homónimas del `ViewState` unificado
 * (`setReadingPosition`, `LogTab`≈`LogKind`), que las cubre desde otra capa.
 */
export * from "./view-state.js";
export * from "./map-view.js";
export * from "./action-projection.js";
export * from "./mission-selector.js";
export * from "./local-lock-panel.js";
export * as LogView from "./log-view.js";
