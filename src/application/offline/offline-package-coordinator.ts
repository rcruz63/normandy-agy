/**
 * Coordinador del Paquete sin conexión y su actualización segura (Tarea 19.2,
 * requisitos 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.11, 28.7).
 *
 * Implementa el puerto {@link OfflinePackageCoordinator} (diseño §7) orquestando
 * el adaptador de Cache Storage, el descargador de recursos y comprobaciones de
 * arranque, sin tocar IndexedDB ni datos de Partidas. Cinco garantías del
 * diseño §7 se cumplen aquí de forma explícita:
 *
 * 1. La recuperación de red NO toca IndexedDB ni Partidas: `inspect` y `stage`
 *    solo leen/escriben Cache Storage a través del adaptador; ninguna ruta de
 *    este coordinador abre la base de Partidas (req. 23.4, 23.5, 28.7).
 * 2. `stage` descarga y verifica TODOS los recursos antes de marcar completitud
 *    (fail-closed): si un recurso falla longitud o integridad, devuelve un
 *    {@link StagedPackageResult} de fallo con la fase y el recurso, y NO marca el
 *    paquete completo (req. 23.7, 23.9).
 * 3. `activate` cambia el puntero de `current` (con confirmación si hay Partida
 *    abierta, req. 23.6) y ejecuta una comprobación de arranque de shell,
 *    catálogo, migradores y compatibilidad con guardados (diseño §7).
 * 4. Si activación o health check falla, se restaura `previous`, se informa la
 *    fase/componente y NO se elimina el paquete anterior (req. 23.8, 23.9).
 * 5. La limpieza de cachés SOLO ocurre tras un arranque confirmado y NUNCA borra
 *    datos de Partidas (viven en IndexedDB, no en Cache Storage) (req. 23).
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta puertos del adaptador de
 * navegador (Cache Storage, `fetch`) y funciones PURAS del dominio (validación
 * del manifiesto, nombres de caché, integridad, salud). No importa DOM/red/
 * reloj/`Math.random`/AWS de forma directa; todo efecto entra por inyección.
 */
import type { PackageVersion } from "../../domain/identity/index.js";
import { computeIntegrity } from "../../domain/persistence/index.js";
import type { OfflinePackageCoordinator } from "../../domain/ports/index.js";
import {
  failedHealthComponents,
  isHealthy,
  validateManifest,
  type ActivationResult,
  type FailedResource,
  type HealthCheckResult,
  type OfflineAvailability,
  type OfflinePackageManifest,
  type OfflineResource,
  type OfflineUpdatePhase,
  type StagedPackageResult,
} from "../../domain/offline/index.js";
import type {
  OfflinePackageCacheStore,
  OfflineResourceFetcher,
} from "../../adapters/browser/cache/index.js";

// ---------------------------------------------------------------------------
// Puertos de estado del ciclo de vida (inyectados)
// ---------------------------------------------------------------------------

/**
 * Manifiesto del paquete `current` activo y del `previous` restaurable, tal como
 * lo conoce el Entorno. La orquestación no interpreta cómo se persisten estos
 * punteros (metadato, archivo de manifiesto en caché…): los recibe por puerto.
 */
export type OfflinePackageState = Readonly<{
  current?: OfflinePackageManifest;
  previous?: OfflinePackageManifest;
}>;

/**
 * Puntero del ciclo de vida del paquete. Lee el estado actual y actualiza el
 * puntero de `current`/`previous` al activar o restaurar. Es la ÚNICA fuente de
 * verdad del puntero; el adaptador de Cache Storage mueve los bytes.
 */
export interface OfflinePackagePointer {
  /** Lee el manifiesto `current` activo y el `previous` restaurable. */
  read(): Promise<OfflinePackageState>;
  /**
   * Fija `current` a `activated` y `previous` a `demoted` (el saliente). Se
   * invoca SOLO tras promover los bytes y superar el health check.
   */
  setActive(activated: OfflinePackageManifest, demoted?: OfflinePackageManifest): Promise<void>;
  /**
   * Restaura el puntero a `restored` tras un rollback. No borra el paquete que
   * falló; solo reapunta `current` (req. 23.8).
   */
  restoreTo(restored: OfflinePackageManifest): Promise<void>;
}

/**
 * Política de Partida abierta. La activación requiere confirmación si hay una
 * Partida abierta (req. 23.6). El coordinador no accede al Gestor de partidas:
 * consulta este puerto, que además transporta la decisión ya tomada por la UI.
 */
export interface OpenGamePolicy {
  /** ¿Hay una Partida abierta en este momento? */
  isGameOpen(): Promise<boolean>;
}

/**
 * Comprobación de arranque (health check) del diseño §7: verifica que el
 * paquete recién activado arranca correctamente (shell, catálogo, migradores
 * necesarios y compatibilidad con guardados). Es un puerto inyectado porque
 * depende del Entorno; devuelve el desglose por componente.
 */
export interface OfflineHealthChecker {
  check(manifest: OfflinePackageManifest): Promise<HealthCheckResult>;
}

// ---------------------------------------------------------------------------
// Errores tipados del ciclo de vida
// ---------------------------------------------------------------------------

/**
 * Error tipado cuando se intenta activar una versión que no está preparada en
 * staging (no superó `stage`). Fail-closed: nunca se activa un paquete
 * incompleto (req. 23.7).
 */
export class PackageNotStagedError extends Error {
  public readonly version: PackageVersion;
  public constructor(version: PackageVersion) {
    super(`El paquete «${version}» no está preparado en staging.`);
    this.name = "PackageNotStagedError";
    this.version = version;
  }
}

/**
 * Error tipado cuando la activación requiere confirmación (Partida abierta) y no
 * se aportó (req. 23.6). La UI debe reintentar con `confirmed: true` tras
 * confirmar con el Propietario.
 */
export class ActivationConfirmationRequiredError extends Error {
  public readonly version: PackageVersion;
  public constructor(version: PackageVersion) {
    super(
      `La activación del paquete «${version}» requiere confirmación porque hay ` +
        "una Partida abierta.",
    );
    this.name = "ActivationConfirmationRequiredError";
    this.version = version;
  }
}

// ---------------------------------------------------------------------------
// Dependencias del coordinador
// ---------------------------------------------------------------------------

/** Dependencias inyectadas del coordinador de Paquete sin conexión. */
export type OfflinePackageCoordinatorDeps = Readonly<{
  cache: OfflinePackageCacheStore;
  fetcher: OfflineResourceFetcher;
  pointer: OfflinePackagePointer;
  openGames: OpenGamePolicy;
  healthChecker: OfflineHealthChecker;
}>;

/** Opciones de `activate`. `confirmed` habilita la activación con Partida abierta. */
export type ActivateOptions = Readonly<{ confirmed?: boolean }>;

// ---------------------------------------------------------------------------
// Coordinador
// ---------------------------------------------------------------------------

/**
 * Coordinador que implementa el ciclo de vida seguro del Paquete sin conexión.
 * Mantiene en memoria los manifiestos preparados en staging para poder activar
 * exactamente la versión verificada; los bytes viven en Cache Storage.
 */
export class DefaultOfflinePackageCoordinator
  implements OfflinePackageCoordinator
{
  private readonly cache: OfflinePackageCacheStore;
  private readonly fetcher: OfflineResourceFetcher;
  private readonly pointer: OfflinePackagePointer;
  private readonly openGames: OpenGamePolicy;
  private readonly healthChecker: OfflineHealthChecker;
  /** Manifiestos verificados en staging, por versión, listos para activar. */
  private readonly staged = new Map<PackageVersion, OfflinePackageManifest>();

  public constructor(deps: OfflinePackageCoordinatorDeps) {
    this.cache = deps.cache;
    this.fetcher = deps.fetcher;
    this.pointer = deps.pointer;
    this.openGames = deps.openGames;
    this.healthChecker = deps.healthChecker;
  }

  /**
   * Anuncia la disponibilidad offline (req. 23.2) leyendo SOLO el puntero de
   * paquetes: qué Versión de reglas y Misiones ofrece el `current` activo y si
   * existe un `previous` restaurable. No toca IndexedDB ni Partidas (req. 23.4).
   */
  public async inspect(): Promise<OfflineAvailability> {
    const state = await this.pointer.read();
    if (state.current === undefined) {
      return Object.freeze({ kind: "unavailable" });
    }
    const current = state.current;
    const base = {
      kind: "available" as const,
      packageVersion: current.packageVersion,
      appVersion: current.appVersion,
      rulesVersion: current.rulesVersion,
      publishedMissionIds: current.publishedMissionIds,
    };
    if (state.previous !== undefined) {
      return Object.freeze({
        ...base,
        previousVersion: state.previous.packageVersion,
      });
    }
    return Object.freeze(base);
  }

  /**
   * Descarga y verifica TODOS los recursos del manifiesto en la caché de staging
   * antes de marcar completitud (fail-closed, req. 23.7). Valida primero el
   * manifiesto (puro). Ante el PRIMER recurso que falle descarga o verificación,
   * devuelve un fallo tipado con la fase y el recurso pendiente (req. 23.9) sin
   * marcar el paquete completo. En éxito, registra el manifiesto como preparado.
   */
  public async stage(
    manifest: OfflinePackageManifest,
  ): Promise<StagedPackageResult> {
    const validation = validateManifest(manifest);
    if (!validation.ok) {
      return Object.freeze({
        ok: false,
        phase: "verification",
        packageVersion: manifest.packageVersion,
        failed: Object.freeze({
          url: "(manifiesto)",
          reason: "integrity-mismatch",
          detail: validation.detail,
        }),
      });
    }

    for (const resource of manifest.resources) {
      const failure = await this.downloadAndVerify(manifest.packageVersion, resource);
      if (failure !== undefined) {
        return failure;
      }
    }

    // Todos los recursos descargados y verificados: el paquete está completo en
    // staging y listo para activar. Fuera de aquí, `staging` nunca sirve a
    // clientes; solo `activate` lo promueve a `current`.
    this.staged.set(manifest.packageVersion, manifest);
    return Object.freeze({
      ok: true,
      packageVersion: manifest.packageVersion,
      stagedResourceCount: manifest.resources.length,
    });
  }

  /**
   * Cambia el puntero de caché a la versión preparada y ejecuta la comprobación
   * de arranque (diseño §7). Si hay Partida abierta, exige `confirmed` (req.
   * 23.6). Si la activación o el health check falla, restaura `previous` sin
   * borrarlo (req. 23.8) y devuelve un {@link ActivationResult} de rollback con
   * la fase y los componentes fallidos (req. 23.9). El puntero de `current` solo
   * se fija tras un health check satisfactorio.
   */
  public async activate(
    version: PackageVersion,
    options: ActivateOptions = {},
  ): Promise<ActivationResult> {
    const manifest = this.staged.get(version);
    if (manifest === undefined) {
      throw new PackageNotStagedError(version);
    }

    if (options.confirmed !== true && (await this.openGames.isGameOpen())) {
      throw new ActivationConfirmationRequiredError(version);
    }

    const state = await this.pointer.read();
    const outgoing = state.current;

    // Fase de activación: promover staging→current (y current→previous).
    try {
      await this.cache.promoteStagingToCurrent(
        version,
        outgoing?.packageVersion,
      );
    } catch (error) {
      return this.rollbackToPrevious(
        "activation",
        version,
        outgoing,
        errorDetail(error),
      );
    }

    // Comprobación de arranque tras cambiar el puntero de bytes.
    const health = await this.healthChecker.check(manifest);
    if (!isHealthy(health)) {
      const failedComponents = failedHealthComponents(health);
      return this.rollbackToPrevious(
        "health-check",
        version,
        outgoing,
        `la comprobación de arranque falló en: ${failedComponents.join(", ")}`,
        failedComponents,
      );
    }

    // Arranque confirmado: fijar el puntero de `current` y conservar el saliente
    // como `previous` restaurable. La limpieza de cachés obsoletas es un paso
    // posterior (`cleanup`) que solo ocurre tras este arranque confirmado.
    await this.pointer.setActive(manifest, outgoing);
    this.staged.delete(version);

    const result = {
      kind: "activated" as const,
      activatedVersion: version,
      health,
    };
    if (outgoing !== undefined) {
      return Object.freeze({ ...result, previousVersion: outgoing.packageVersion });
    }
    return Object.freeze(result);
  }

  /**
   * Restaura explícitamente el paquete `previous` operativo tras un fallo de una
   * actualización (req. 23.8). No elimina el paquete que falló ni toca Partidas.
   * Si no hay `previous`, no hay nada que restaurar y se conserva el estado.
   * `failedVersion` se acepta para trazar la versión que se abandonó y descartar
   * su staging.
   */
  public async rollback(failedVersion: PackageVersion): Promise<void> {
    const state = await this.pointer.read();
    this.staged.delete(failedVersion);
    await this.cache.discardStaging(failedVersion);
    if (state.previous !== undefined) {
      await this.cache.restorePrevious(state.previous.packageVersion);
      await this.pointer.restoreTo(state.previous);
    }
  }

  /**
   * Ruta interna del rollback durante `activate`: restaura el paquete saliente
   * como `current` operativo SIN borrar el paquete que falló (req. 23.8) y
   * describe el fallo con la fase y, si procede, los componentes de arranque que
   * fallaron (req. 23.9). Devuelve un {@link ActivationResult} de rollback.
   */
  private async rollbackToPrevious(
    phase: Extract<OfflineUpdatePhase, "activation" | "health-check">,
    attemptedVersion: PackageVersion,
    outgoing: OfflinePackageManifest | undefined,
    detail: string,
    failedComponents?: readonly (keyof HealthCheckResult)[],
  ): Promise<ActivationResult> {
    this.staged.delete(attemptedVersion);
    if (outgoing !== undefined) {
      await this.cache.restorePrevious(outgoing.packageVersion);
      await this.pointer.restoreTo(outgoing);
    }
    const rolledBack = {
      kind: "rolled-back" as const,
      phase,
      attemptedVersion,
      detail,
    };
    const withRestored =
      outgoing !== undefined
        ? { ...rolledBack, restoredVersion: outgoing.packageVersion }
        : rolledBack;
    if (failedComponents !== undefined) {
      return Object.freeze({ ...withRestored, failedComponents });
    }
    return Object.freeze(withRestored);
  }

  /**
   * Limpieza de cachés del paquete OBSOLETAS. SOLO debe invocarse tras un
   * arranque confirmado (req. 23): conserva las cachés de la versión activa y su
   * `previous` restaurable y elimina el resto de cachés del paquete. NUNCA borra
   * datos de Partidas: solo opera sobre nombres de caché del paquete y jamás
   * toca IndexedDB.
   */
  public async cleanup(): Promise<readonly string[]> {
    const state = await this.pointer.read();
    if (state.current === undefined) {
      // Sin arranque confirmado no se limpia nada (fail-closed).
      return Object.freeze([]);
    }
    const keep = keepableCacheNames(state);
    const existing = await this.cache.listPackageCaches();
    const removed: string[] = [];
    for (const name of existing) {
      if (!keep.has(name)) {
        await this.cache.deletePackageCache(name);
        removed.push(name);
      }
    }
    return Object.freeze(removed);
  }

  /**
   * Descarga un recurso y verifica su longitud e integridad; ante fallo devuelve
   * un {@link StagedPackageResult} de rechazo con la fase adecuada (`download` o
   * `verification`) y el recurso pendiente. En éxito, escribe los bytes en la
   * caché de staging y devuelve `undefined`.
   */
  private async downloadAndVerify(
    version: PackageVersion,
    resource: OfflineResource,
  ): Promise<StagedPackageResult | undefined> {
    const download = await this.fetcher.fetchResource(resource.url);
    if (!download.ok) {
      return stageFailure(version, "download", {
        url: resource.url,
        reason: "fetch-failed",
        detail: download.detail,
      });
    }

    const body = download.resource.body;
    if (body.byteLength !== resource.bytes) {
      return stageFailure(version, "verification", {
        url: resource.url,
        reason: "length-mismatch",
        detail: `esperados ${resource.bytes} bytes, recibidos ${body.byteLength}`,
      });
    }

    const recomputed = computeIntegrity(bytesToNumbers(body));
    if (
      recomputed.algorithm !== resource.integrity.algorithm ||
      recomputed.value !== resource.integrity.value
    ) {
      return stageFailure(version, "verification", {
        url: resource.url,
        reason: "integrity-mismatch",
        detail: "la suma de integridad recalculada no coincide con la declarada",
      });
    }

    await this.cache.putStaged(version, { url: resource.url, body });
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Auxiliares puros
// ---------------------------------------------------------------------------

function stageFailure(
  version: PackageVersion,
  phase: "download" | "verification",
  failed: FailedResource,
): StagedPackageResult {
  return Object.freeze({
    ok: false,
    phase,
    packageVersion: version,
    failed: Object.freeze(failed),
  });
}

/**
 * Convierte los bytes a una forma estable y serializable para
 * {@link computeIntegrity}, que canonicaliza JSON. Un `Uint8Array` se
 * canonicaliza de forma no determinista según el Entorno; una lista de números
 * es reproducible y compatible con la suma declarada en el manifiesto.
 */
function bytesToNumbers(body: Uint8Array): readonly number[] {
  return Array.from(body);
}

/** Nombres de caché que la limpieza debe conservar (activa y previous). */
function keepableCacheNames(state: OfflinePackageState): ReadonlySet<string> {
  const keep = new Set<string>();
  if (state.current !== undefined) {
    keep.add(`fon-current-${state.current.packageVersion}`);
  }
  if (state.previous !== undefined) {
    keep.add(`fon-current-${state.previous.packageVersion}`);
    keep.add(`fon-previous-${state.previous.packageVersion}`);
  }
  return keep;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
