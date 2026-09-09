/**
 * Adaptador de descarga de recursos del Paquete sin conexión (Tarea 19.1).
 *
 * Envuelve `fetch` —I/O de red— tras el puerto {@link OfflineResourceFetcher}
 * que consume la orquestación de `application/offline/`. La descarga es la única
 * operación de red del ciclo de actualización; el juego en Modo sin conexión no
 * emite solicitudes (req. 28.7). La VERIFICACIÓN de longitud/integridad la hace
 * la orquestación con funciones puras del dominio, no este adaptador.
 *
 * FRONTERA DE CAPAS: este módulo vive en `adapters/browser/`. Es el único punto
 * que realiza `fetch` de recursos del paquete; `fetch` se INYECTA por
 * constructor para que las pruebas usen una implementación falsa sin depender
 * de `globalThis.fetch`.
 *
 * Referencia: [fetch()](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch).
 */

/** Bytes descargados de un recurso, listos para verificar y almacenar. */
export type DownloadedResource = Readonly<{
  url: string;
  body: Uint8Array;
}>;

/**
 * Desenlace de una descarga: éxito con los bytes, o fallo (sin lanzar) para que
 * la orquestación lo clasifique en la fase `download` con el recurso pendiente
 * (req. 23.9) sin depender de excepciones.
 */
export type FetchResult =
  | Readonly<{ ok: true; resource: DownloadedResource }>
  | Readonly<{ ok: false; url: string; detail: string }>;

/**
 * Puerto de descarga de un recurso propio por su URL versionada. Nunca lanza:
 * un fallo de red se devuelve como `{ ok: false }` para que la orquestación lo
 * clasifique fail-closed.
 */
export interface OfflineResourceFetcher {
  fetchResource(url: string): Promise<FetchResult>;
}

/** Forma mínima de la respuesta de `fetch` que este adaptador necesita. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Firma mínima de `fetch` inyectable. */
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/**
 * Adaptador de {@link OfflineResourceFetcher} respaldado por un `fetch`
 * inyectado. No accede a globals: recibe `fetch` por constructor.
 */
export class BrowserOfflineResourceFetcher implements OfflineResourceFetcher {
  private readonly fetchFn: FetchLike;

  public constructor(fetchFn: FetchLike) {
    this.fetchFn = fetchFn;
  }

  public async fetchResource(url: string): Promise<FetchResult> {
    let response: FetchResponseLike;
    try {
      response = await this.fetchFn(url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return Object.freeze({ ok: false, url, detail });
    }
    if (!response.ok) {
      return Object.freeze({
        ok: false,
        url,
        detail: `respuesta HTTP ${response.status}`,
      });
    }
    const body = new Uint8Array(await response.arrayBuffer());
    return Object.freeze({
      ok: true,
      resource: Object.freeze({ url, body }),
    });
  }
}
