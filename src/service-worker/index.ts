/**
 * Service worker del Paquete sin conexión (Tarea 19.1).
 *
 * Punto de entrada del service worker. Sirve recursos EXCLUSIVAMENTE desde la
 * caché `current` activa y nunca desde staging (diseño §7). El ciclo de vida del
 * paquete (stage/activate/rollback/limpieza) lo orquesta `application/offline/`.
 */
export { resolveFromCurrent } from "./offline-package-service-worker.js";
export type {
  CurrentVersionSource,
  WorkerCacheStorageLike,
  WorkerCacheLike,
} from "./offline-package-service-worker.js";
