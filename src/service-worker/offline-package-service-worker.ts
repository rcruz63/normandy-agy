/**
 * Service worker del Paquete sin conexión (Tarea 19.1, requisitos 23.1, 23.3,
 * 28.7, 28.8).
 *
 * El service worker responde a las solicitudes de recursos EXCLUSIVAMENTE desde
 * la caché `current` activa y NUNCA desde una caché de staging (diseño §7): un
 * paquete en descarga no debe servir a clientes hasta ser promovido a `current`
 * por la orquestación (`application/offline/`). Mientras exista un paquete
 * `current` válido, el juego funciona sin solicitudes a la Plataforma AWS
 * (req. 28.7); los recursos versionados son inmutables y reutilizables desde
 * Caché (req. 28.8).
 *
 * Este módulo NO decide el ciclo de vida (stage/activate/rollback/limpieza): eso
 * lo orquesta la capa de aplicación sobre el adaptador de Cache Storage. Aquí
 * solo se instala el manejador de `fetch` que sirve de `current`.
 *
 * FRONTERA: vive en `service-worker/`. Reutiliza los nombres de caché
 * DETERMINISTAS del dominio (`domain/offline/`) para localizar la caché
 * `current` y para garantizar que jamás sirve desde staging. No importa
 * IndexedDB ni datos de Partidas: la caché de recursos y las Partidas están
 * separadas.
 */
import type { PackageVersion } from "../domain/identity/index.js";
import {
  cacheName,
  isStagingCacheName,
} from "../domain/offline/index.js";

/** Puntero a la versión de paquete `current` que el worker debe servir. */
export interface CurrentVersionSource {
  /** Devuelve la versión `current` activa, o `undefined` si no hay ninguna. */
  currentVersion(): Promise<PackageVersion | undefined>;
}

/** Subconjunto de `CacheStorage` que el manejador de `fetch` necesita. */
export interface WorkerCacheStorageLike {
  open(name: string): Promise<WorkerCacheLike>;
}

/** Subconjunto de `Cache` para responder a `fetch`. */
export interface WorkerCacheLike {
  match(request: string): Promise<Response | undefined>;
}

/**
 * Resuelve una respuesta para `url` desde la caché `current` activa. Devuelve
 * `undefined` si no hay paquete `current` o el recurso no está en él. GARANTIZA,
 * por construcción, que jamás lee de una caché de staging: solo abre el nombre
 * `current` derivado del dominio y comprueba explícitamente el prefijo.
 */
export async function resolveFromCurrent(
  url: string,
  source: CurrentVersionSource,
  caches: WorkerCacheStorageLike,
): Promise<Response | undefined> {
  const version = await source.currentVersion();
  if (version === undefined) {
    return undefined;
  }
  const name = cacheName("current", version);
  // Defensa en profundidad: nunca servir desde una caché de staging.
  if (isStagingCacheName(name)) {
    return undefined;
  }
  const cache = await caches.open(name);
  return cache.match(url);
}
