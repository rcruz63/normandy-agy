/**
 * Adaptador de estimación de almacenamiento del navegador (Tarea 15.3).
 *
 * Envuelve `navigator.storage.estimate()` —I/O de plataforma— tras el puerto
 * {@link StorageEstimator} que consume la sonda de cuota de la capa de
 * aplicación. La estimación es SOLO informativa: no toca ninguna Partida ni
 * escribe en IndexedDB (requisitos 6.5, 6.6, diseño §5).
 *
 * FRONTERA DE CAPAS: este módulo vive en `adapters/browser/`. Es el único punto
 * que accede a `navigator.storage`; la aplicación nunca lee ese global de forma
 * implícita. `StorageManager` se INYECTA por constructor para que las pruebas
 * usen una implementación falsa sin depender de `globalThis.navigator`.
 *
 * Referencia: [StorageManager.estimate()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate).
 */

/**
 * Estimación de capacidad de almacenamiento observada, en bytes. Refleja lo que
 * expone `StorageManager.estimate()`; ambos campos pueden faltar si el Entorno
 * no los provee, en cuyo caso la sonda lo trata como capacidad desconocida.
 */
export type StorageEstimate = Readonly<{
  /** Bytes ya usados por el origen, si el Entorno lo expone. */
  usage?: number;
  /** Bytes de cuota total estimada para el origen, si el Entorno lo expone. */
  quota?: number;
}>;

/** Puerto de estimación de capacidad de almacenamiento (solo lectura). */
export interface StorageEstimator {
  /** Devuelve la estimación observada sin modificar ningún dato persistido. */
  estimate(): Promise<StorageEstimate>;
}

/**
 * Subconjunto de `StorageManager` que este adaptador necesita. Permite inyectar
 * una implementación falsa en pruebas sin depender del tipo global completo.
 */
export interface StorageManagerLike {
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

/** Error tipado cuando la plataforma no ofrece estimación de almacenamiento. */
export class StorageEstimatorUnavailableError extends Error {
  public constructor(detail: string) {
    super(`Estimación de almacenamiento no disponible: ${detail}.`);
    this.name = "StorageEstimatorUnavailableError";
  }
}

/**
 * Adaptador de {@link StorageEstimator} respaldado por un `StorageManager`
 * inyectado. No accede a globals: recibe el `StorageManager` por constructor.
 */
export class BrowserStorageEstimator implements StorageEstimator {
  private readonly manager: StorageManagerLike;

  public constructor(manager: StorageManagerLike) {
    this.manager = manager;
  }

  /**
   * Consulta la estimación de la plataforma y la normaliza a
   * {@link StorageEstimate}. Solo copia `usage`/`quota` cuando son números
   * finitos; cualquier otro valor se omite (capacidad desconocida).
   */
  public async estimate(): Promise<StorageEstimate> {
    const raw = await this.manager.estimate();
    const result: { usage?: number; quota?: number } = {};
    if (typeof raw.usage === "number" && Number.isFinite(raw.usage)) {
      result.usage = raw.usage;
    }
    if (typeof raw.quota === "number" && Number.isFinite(raw.quota)) {
      result.quota = raw.quota;
    }
    return Object.freeze(result);
  }
}
