/**
 * Punto de entrada de la capa de aplicación (`application/`).
 *
 * La capa de aplicación orquesta los puertos del dominio (unidad de trabajo con
 * cola por Partida, Coordinador de Tiradas, casos de uso de Partida, repositorio
 * IndexedDB, copia/importación/migración y coordinador del Paquete sin conexión)
 * y compone el cableado final de la sesión (Tarea 27.1). No interpreta reglas
 * (eso es del Motor) ni contiene lógica de presentación (eso es de `ui/`).
 */
export * from "./games/index.js";
export * from "./offline/index.js";
export * from "./session/index.js";
