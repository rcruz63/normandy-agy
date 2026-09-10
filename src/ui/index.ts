/**
 * Punto de entrada de la capa de interfaz (`ui/`).
 *
 * Esta capa solo transforma proyecciones: no contiene lógica de reglas ni
 * estado de dominio. Expone las vistas del mapa y el `ViewState` independiente
 * del `GameState` (Tarea 20.3), las proyecciones `es-ES` de Acciones, registros
 * y selector de Misiones (Tarea 20.5) y la capa regional `es-ES`
 * (formateadores `Intl`, catálogo de textos y resolutor de `DomainMessage`).
 */
export * from "./views/index.js";
export * from "./locale/index.js";
export * from "./components/index.js";
