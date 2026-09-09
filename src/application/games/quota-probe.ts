/**
 * Sonda de cuota de almacenamiento (Tarea 15.3, requisitos 6.5, 6.6, diseño §5).
 *
 * Estima la capacidad de almacenamiento observada SIN tocar ninguna Partida:
 * es una consulta de solo lectura a través del puerto {@link StorageEstimator}.
 * La API de cuota SOLO INFORMA; la garantía de conservación ante falta de
 * espacio procede del commit abortable, no de la sonda (diseño §5). Por eso
 * `probe` no bloquea por sí sola: cuando recibe una capacidad requerida,
 * devuelve si CABE según la estimación, para que la UI explique capacidad
 * requerida frente a disponible observada (6.6), pero no impide crear.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Consume el puerto de estimación;
 * NO accede a `navigator.storage` ni a globals. El I/O de plataforma vive en el
 * adaptador de `adapters/browser/capabilities`, que implementa este puerto de
 * forma estructural. En pruebas se inyecta una implementación falsa.
 */

/**
 * Estimación de capacidad observada, en bytes. Ambos campos pueden faltar si el
 * Entorno no los expone (capacidad desconocida). Espeja lo que devuelve el
 * puerto de estimación del adaptador de navegador.
 */
export type StorageEstimate = Readonly<{
  usage?: number;
  quota?: number;
}>;

/**
 * Puerto de estimación de capacidad (solo lectura). El adaptador de navegador
 * lo satisface estructuralmente envolviendo `navigator.storage.estimate()`.
 */
export interface StorageEstimator {
  estimate(): Promise<StorageEstimate>;
}

/**
 * Resultado de la sonda de cuota. `availableBytes`/`usedBytes` son la capacidad
 * observada (indefinidos si el Entorno no la expone). `requiredBytes` refleja lo
 * solicitado por el llamante; `fits` indica si la estimación sugiere que cabe.
 * Cuando la capacidad es desconocida, `fits` queda indefinido: la sonda no
 * afirma ni niega; la creación decide con el commit abortable.
 */
export type QuotaProbeResult = Readonly<{
  usedBytes?: number;
  availableBytes?: number;
  requiredBytes?: number;
  fits?: boolean;
}>;

/** Sonda de cuota que informa capacidad estimada sin tocar Partidas. */
export class QuotaProbe {
  private readonly estimator: StorageEstimator;

  public constructor(estimator: StorageEstimator) {
    this.estimator = estimator;
  }

  /**
   * Estima la capacidad observada. Si se aporta `requiredBytes`, calcula si
   * cabe según la estimación (solo informativo). Función de solo lectura: no
   * escribe en IndexedDB ni modifica Partida alguna (6.5).
   */
  public async probe(requiredBytes?: number): Promise<QuotaProbeResult> {
    const estimate = await this.estimator.estimate();
    const availableBytes = computeAvailable(estimate);
    return buildResult(estimate.usage, availableBytes, requiredBytes);
  }
}

/**
 * Calcula los bytes disponibles observados como `quota − usage` cuando ambos se
 * conocen. Si falta cualquiera, la capacidad disponible es desconocida. Nunca
 * devuelve un valor negativo (se acota a cero).
 */
function computeAvailable(estimate: StorageEstimate): number | undefined {
  if (estimate.quota === undefined || estimate.usage === undefined) {
    return undefined;
  }
  const remaining = estimate.quota - estimate.usage;
  return remaining > 0 ? remaining : 0;
}

/** Compone el {@link QuotaProbeResult} incluyendo `fits` solo si es evaluable. */
function buildResult(
  usedBytes: number | undefined,
  availableBytes: number | undefined,
  requiredBytes: number | undefined,
): QuotaProbeResult {
  const base: { usedBytes?: number; availableBytes?: number; requiredBytes?: number; fits?: boolean } = {};
  if (usedBytes !== undefined) {
    base.usedBytes = usedBytes;
  }
  if (availableBytes !== undefined) {
    base.availableBytes = availableBytes;
  }
  if (requiredBytes !== undefined) {
    base.requiredBytes = requiredBytes;
  }
  if (requiredBytes !== undefined && availableBytes !== undefined) {
    base.fits = availableBytes >= requiredBytes;
  }
  return Object.freeze(base);
}
