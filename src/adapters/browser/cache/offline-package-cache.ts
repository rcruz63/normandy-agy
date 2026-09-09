/**
 * Adaptador de Cache Storage para el Paquete sin conexión (Tarea 19.1).
 *
 * Envuelve la Cache API del navegador —I/O de plataforma— tras el puerto
 * {@link OfflinePackageCacheStore} que consume la orquestación de
 * `application/offline/`. El adaptador materializa las tres cachés del diseño
 * §7 usando los nombres deterministas del dominio (`fon-staging/current/previous
 * -{packageVersion}`):
 *
 * - escribe recursos verificados en la caché de STAGING de una versión;
 * - promueve `current` → `previous` y `staging` → `current` al activar;
 * - restaura `previous` → `current` al hacer rollback;
 * - lista y borra cachés del paquete SOLO para limpieza tras arranque confirmado.
 *
 * INVARIANTE DE FRONTERA: la caché de STAGING NUNCA sirve a clientes (diseño §7,
 * req. 23). Este adaptador solo escribe/lee staging para preparar y promover; el
 * service worker (`service-worker/`) responde a `fetch` EXCLUSIVAMENTE desde
 * `current` y jamás desde una caché de staging.
 *
 * FRONTERA DE CAPAS: este módulo vive en `adapters/browser/`. Es uno de los
 * únicos puntos que acceden a `CacheStorage`; la aplicación nunca lee ese global
 * de forma implícita. `CacheStorage` se INYECTA por constructor para que las
 * pruebas usen una implementación falsa sin depender de `globalThis.caches`.
 *
 * Referencia: [CacheStorage](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage).
 */
import type { PackageVersion } from "../../../domain/identity/index.js";
import {
  cacheName,
  isOfflinePackageCacheName,
} from "../../../domain/offline/index.js";

/**
 * Contenido verificado de un recurso listo para almacenarse en Cache Storage:
 * su URL versionada y los bytes ya descargados y comprobados.
 */
export type CachedResource = Readonly<{
  url: string;
  body: Uint8Array;
}>;

/**
 * Puerto de almacenamiento de cachés del Paquete sin conexión. Expresa las
 * operaciones que la orquestación necesita SIN acoplarla a la Cache API. Todas
 * operan por rol y versión, nunca por nombre físico crudo (los nombres los
 * compone el dominio).
 */
export interface OfflinePackageCacheStore {
  /** Escribe un recurso verificado en la caché de STAGING de la versión dada. */
  putStaged(version: PackageVersion, resource: CachedResource): Promise<void>;
  /** ¿Existe ya la caché `current` de la versión dada? */
  hasCurrent(version: PackageVersion): Promise<boolean>;
  /** ¿Existe la caché `previous` de la versión dada? */
  hasPrevious(version: PackageVersion): Promise<boolean>;
  /**
   * Promueve la versión indicada de STAGING a `current`, moviendo el `current`
   * saliente (si existe) a `previous`. Deja el paquete anterior conservado como
   * `previous` restaurable; no borra nada (req. 23.7, 23.8).
   */
  promoteStagingToCurrent(
    version: PackageVersion,
    previousVersion?: PackageVersion,
  ): Promise<void>;
  /**
   * Restaura `previous` como `current` para la versión anterior indicada
   * (rollback). No elimina el paquete que falló (req. 23.8).
   */
  restorePrevious(previousVersion: PackageVersion): Promise<void>;
  /** Elimina la caché de STAGING de la versión dada (limpieza segura). */
  discardStaging(version: PackageVersion): Promise<void>;
  /**
   * Lista los nombres de caches del Paquete sin conexión existentes. La limpieza
   * solo opera sobre estas; jamás sobre datos de Partidas (IndexedDB).
   */
  listPackageCaches(): Promise<readonly string[]>;
  /** Elimina una caché del paquete por nombre exacto (limpieza tras arranque). */
  deletePackageCache(name: string): Promise<void>;
}

/**
 * Subconjunto de `CacheStorage` que este adaptador necesita. Permite inyectar
 * una implementación falsa en pruebas sin depender del tipo global completo.
 */
export interface CacheStorageLike {
  open(cacheName: string): Promise<CacheLike>;
  has(cacheName: string): Promise<boolean>;
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

/** Subconjunto de `Cache` que este adaptador necesita. */
export interface CacheLike {
  put(request: string, response: ResponseLike): Promise<void>;
  match(request: string): Promise<ResponseLike | undefined>;
  keys(): Promise<readonly RequestLike[]>;
}

/** Forma mínima de una respuesta clonable/serializable de Cache Storage. */
export interface ResponseLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Forma mínima de una petición almacenada como clave de Cache Storage. */
export interface RequestLike {
  url: string;
}

/**
 * Fábrica de respuestas para escribir bytes en Cache Storage. Se INYECTA para
 * no acoplar el adaptador al constructor global `Response` (facilita pruebas).
 */
export interface ResponseFactory {
  fromBytes(body: Uint8Array): ResponseLike;
}

/** Error tipado cuando la plataforma no ofrece Cache Storage. */
export class CacheStorageUnavailableError extends Error {
  public constructor(detail: string) {
    super(`Cache Storage no disponible: ${detail}.`);
    this.name = "CacheStorageUnavailableError";
  }
}

/**
 * Adaptador de {@link OfflinePackageCacheStore} respaldado por un `CacheStorage`
 * inyectado. No accede a globals: recibe el `CacheStorage` y la fábrica de
 * respuestas por constructor.
 */
export class BrowserOfflinePackageCacheStore
  implements OfflinePackageCacheStore
{
  private readonly caches: CacheStorageLike;
  private readonly responses: ResponseFactory;

  public constructor(caches: CacheStorageLike, responses: ResponseFactory) {
    this.caches = caches;
    this.responses = responses;
  }

  public async putStaged(
    version: PackageVersion,
    resource: CachedResource,
  ): Promise<void> {
    const cache = await this.caches.open(cacheName("staging", version));
    await cache.put(resource.url, this.responses.fromBytes(resource.body));
  }

  public async hasCurrent(version: PackageVersion): Promise<boolean> {
    return this.caches.has(cacheName("current", version));
  }

  public async hasPrevious(version: PackageVersion): Promise<boolean> {
    return this.caches.has(cacheName("previous", version));
  }

  public async promoteStagingToCurrent(
    version: PackageVersion,
    previousVersion?: PackageVersion,
  ): Promise<void> {
    // Mueve el `current` saliente a `previous` antes de promover el staging, de
    // modo que el paquete anterior quede conservado como restaurable (23.8).
    if (previousVersion !== undefined) {
      await this.copyCache(
        cacheName("current", previousVersion),
        cacheName("previous", previousVersion),
      );
    }
    await this.copyCache(
      cacheName("staging", version),
      cacheName("current", version),
    );
  }

  public async restorePrevious(previousVersion: PackageVersion): Promise<void> {
    // Restaura `previous` como `current` de la versión anterior; NO borra el
    // paquete que falló (req. 23.8): la limpieza es una decisión posterior.
    await this.copyCache(
      cacheName("previous", previousVersion),
      cacheName("current", previousVersion),
    );
  }

  public async discardStaging(version: PackageVersion): Promise<void> {
    await this.caches.delete(cacheName("staging", version));
  }

  public async listPackageCaches(): Promise<readonly string[]> {
    const names = await this.caches.keys();
    return Object.freeze(names.filter(isOfflinePackageCacheName));
  }

  public async deletePackageCache(name: string): Promise<void> {
    // Defensa en profundidad: nunca borra algo que no sea una caché del paquete.
    if (!isOfflinePackageCacheName(name)) {
      return;
    }
    await this.caches.delete(name);
  }

  /** Copia todas las entradas de una caché a otra (crea el destino). */
  private async copyCache(from: string, to: string): Promise<void> {
    const source = await this.caches.open(from);
    const target = await this.caches.open(to);
    const requests = await source.keys();
    for (const request of requests) {
      const response = await source.match(request.url);
      if (response !== undefined) {
        const body = new Uint8Array(await response.arrayBuffer());
        await target.put(request.url, this.responses.fromBytes(body));
      }
    }
  }
}
