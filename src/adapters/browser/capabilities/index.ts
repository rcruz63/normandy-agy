/**
 * Adaptadores de capacidades del navegador (Tareas 15.3 y 21.1).
 *
 * Punto de entrada de los adaptadores que exponen capacidades de plataforma
 * tras puertos, para que la capa de aplicación las consuma sin acoplarse a
 * globals. El primero es la estimación de almacenamiento que respalda la sonda
 * de cuota (`navigator.storage.estimate`).
 *
 * También expone la {@link CapabilityDetector} de la Tarea 21.1, que comprueba
 * instalación PWA, IndexedDB, Modo sin conexión y tacto de un puntero para
 * bloquear el inicio de una Partida ante una carencia obligatoria conservando la
 * exportación (requisitos 31.3, 31.4, 31.7).
 */
export {
  BrowserStorageEstimator,
  StorageEstimatorUnavailableError,
} from "./storage-estimator.js";
export type {
  StorageEstimate,
  StorageEstimator,
  StorageManagerLike,
} from "./storage-estimator.js";
export { CapabilityDetector, surfaceFromEnvironment } from "./capability-detector.js";
export type {
  CapabilityCheck,
  CapabilityId,
  CapabilityReport,
  PlatformSurface,
} from "./capability-detector.js";
