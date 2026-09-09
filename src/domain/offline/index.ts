/**
 * Modelos puros del Paquete sin conexión y su actualización segura (Tarea 19.1).
 *
 * Reexporta el manifiesto, los desenlaces de `stage`/`activate`, la
 * disponibilidad offline, los nombres de caché deterministas y la validación
 * pura del manifiesto, para que el puerto (`ports/`), el adaptador de Cache
 * Storage (`adapters/browser/cache/`), el service worker (`service-worker/`) y
 * la orquestación (`application/offline/`) compartan exactamente los mismos
 * modelos sin acoplar el dominio a la Cache API.
 */
export {
  CACHE_PREFIX,
  cacheName,
  isStagingCacheName,
  isCurrentCacheName,
  isPreviousCacheName,
  isOfflinePackageCacheName,
  isHealthy,
  failedHealthComponents,
  validateManifest,
} from "./offline-package.js";
export type {
  CacheRole,
  OfflineResource,
  OfflinePackageManifest,
  OfflineAvailability,
  OfflineUpdatePhase,
  ResourceFailureReason,
  FailedResource,
  StagedPackageResult,
  HealthCheckResult,
  ActivationResult,
  ManifestRejectionReason,
  ManifestValidationFailure,
  ManifestValidationSuccess,
  ManifestValidation,
} from "./offline-package.js";
