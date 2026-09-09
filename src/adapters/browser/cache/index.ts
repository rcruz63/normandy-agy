/**
 * Adaptadores de Cache Storage y descarga del Paquete sin conexión (Tarea 19.1).
 *
 * Punto de entrada de los adaptadores que exponen la Cache API y la red tras
 * puertos, para que la orquestación de `application/offline/` los consuma sin
 * acoplarse a globals: el almacén de las tres cachés (staging/current/previous)
 * y el descargador de recursos. El service worker sirve EXCLUSIVAMENTE de
 * `current` y nunca de staging.
 */
export {
  BrowserOfflinePackageCacheStore,
  CacheStorageUnavailableError,
} from "./offline-package-cache.js";
export type {
  CachedResource,
  OfflinePackageCacheStore,
  CacheStorageLike,
  CacheLike,
  ResponseLike,
  RequestLike,
  ResponseFactory,
} from "./offline-package-cache.js";

export { BrowserOfflineResourceFetcher } from "./offline-resource-fetcher.js";
export type {
  DownloadedResource,
  FetchResult,
  OfflineResourceFetcher,
  FetchResponseLike,
  FetchLike,
} from "./offline-resource-fetcher.js";
