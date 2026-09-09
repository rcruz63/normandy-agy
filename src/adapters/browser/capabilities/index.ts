/**
 * Adaptadores de capacidades del navegador (Tarea 15.3).
 *
 * Punto de entrada de los adaptadores que exponen capacidades de plataforma
 * tras puertos, para que la capa de aplicación las consuma sin acoplarse a
 * globals. El primero es la estimación de almacenamiento que respalda la sonda
 * de cuota (`navigator.storage.estimate`).
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
