/**
 * Modelos de dominio del Paquete sin conexión y su actualización segura
 * (Tarea 19.1, requisitos 23.1, 23.2, 23.3-23.9, 23.11, 28.7, 28.8).
 *
 * La Tarea 1 fijó la FIRMA del puerto `OfflinePackageCoordinator` con tipos
 * opacos (marcas) en `ports/placeholders.ts`. La Tarea 19.1 SUSTITUYE esos
 * marcadores (`OfflinePackageManifest`, `OfflineAvailability`,
 * `StagedPackageResult`, `ActivationResult`) por los modelos reales que
 * atraviesan la frontera del ciclo de vida del Paquete sin conexión:
 *
 * - {@link OfflinePackageManifest}: enumera la versión de aplicación, la Versión
 *   de reglas, las Misiones publicadas disponibles sin red, y la URL versionada,
 *   longitud (bytes) e integridad de CADA recurso propio (diseño §7, req. 23.1,
 *   23.2). Sirve para validar completitud durante el `stage` (fail-closed).
 * - {@link OfflineResource}: un recurso propio del paquete con su URL versionada
 *   inmutable, su longitud declarada y su {@link IntegrityDescriptor}.
 * - {@link OfflineAvailability}: lo que la PWA puede anunciar sin red: qué
 *   Versión de reglas y qué Misiones están disponibles en el paquete `current`
 *   activo (req. 23.2), y si hay un `previous` restaurable.
 * - {@link StagedPackageResult}: desenlace de `stage`. Éxito solo si TODOS los
 *   recursos se descargaron y verificaron (completitud); fallo tipado con la
 *   fase y el recurso pendiente (req. 23.7, 23.9).
 * - {@link ActivationResult}: desenlace de `activate`. Éxito tras cambiar el
 *   puntero y superar la comprobación de arranque; fallo tipado con la fase que
 *   provocó el rollback (req. 23.6, 23.8, 23.9).
 *
 * Las cachés del diseño §7 se nombran de forma determinista por
 * `packageVersion`:
 * - `fon-staging-{packageVersion}`: descarga incompleta; NUNCA sirve a clientes;
 * - `fon-current-{packageVersion}`: paquete activo completo;
 * - `fon-previous-{packageVersion}`: último paquete válido para rollback.
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es PURO. No
 * importa DOM, Cache API, red, IndexedDB, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Solo define modelos y verificación pura (validación
 * del manifiesto, nombres de caché deterministas, comprobación de completitud).
 * Los efectos (descarga, escritura en Cache Storage, service worker) viven en
 * `adapters/browser/` y `service-worker/`; la orquestación, en `application/`.
 */
import type {
  MissionId,
  PackageVersion,
  RulesVersion,
} from "../identity/index.js";
import type { IntegrityDescriptor } from "../engine/state.js";

// ---------------------------------------------------------------------------
// Nombres de caché deterministas (diseño §7)
// ---------------------------------------------------------------------------

/**
 * Prefijos canónicos de las tres cachés del Paquete sin conexión. El nombre
 * físico se compone con la `packageVersion` para aislar versiones y permitir
 * reutilización desde Caché con identificadores inmutables (req. 28.8).
 *
 * - `staging`: material de descarga incompleto; NUNCA sirve a clientes;
 * - `current`: paquete activo completo del que sirve el service worker;
 * - `previous`: último paquete válido conservado para rollback (req. 23.8).
 */
export const CACHE_PREFIX = Object.freeze({
  staging: "fon-staging",
  current: "fon-current",
  previous: "fon-previous",
} as const);

/** Rol de una de las tres cachés del ciclo de vida del paquete. */
export type CacheRole = keyof typeof CACHE_PREFIX;

/**
 * Compone el nombre físico de una caché a partir de su rol y la versión de
 * paquete: `fon-{role}-{packageVersion}`. Determinista y puro; no accede a la
 * Cache API. El adaptador de `adapters/browser/cache/` usa exactamente estos
 * nombres para que el service worker sirva de `current` y jamás de `staging`.
 */
export function cacheName(role: CacheRole, version: PackageVersion): string {
  return `${CACHE_PREFIX[role]}-${version}`;
}

/**
 * ¿Es `name` el nombre de una caché de STAGING de cualquier versión? El service
 * worker usa esta comprobación pura para GARANTIZAR que nunca responde a un
 * cliente desde una caché de staging (diseño §7, req. 23 «staging nunca sirve a
 * clientes»).
 */
export function isStagingCacheName(name: string): boolean {
  return name === CACHE_PREFIX.staging || name.startsWith(`${CACHE_PREFIX.staging}-`);
}

/** ¿Es `name` el nombre de una caché `current` de cualquier versión? */
export function isCurrentCacheName(name: string): boolean {
  return name === CACHE_PREFIX.current || name.startsWith(`${CACHE_PREFIX.current}-`);
}

/** ¿Es `name` el nombre de una caché `previous` de cualquier versión? */
export function isPreviousCacheName(name: string): boolean {
  return name === CACHE_PREFIX.previous || name.startsWith(`${CACHE_PREFIX.previous}-`);
}

/**
 * ¿Es `name` una caché del Paquete sin conexión (staging/current/previous)? La
 * limpieza de cachés solo debe operar sobre estas y NUNCA sobre datos de
 * Partidas (que viven en IndexedDB, no en Cache Storage) (req. 23, diseño §7).
 */
export function isOfflinePackageCacheName(name: string): boolean {
  return (
    isStagingCacheName(name) ||
    isCurrentCacheName(name) ||
    isPreviousCacheName(name)
  );
}

// ---------------------------------------------------------------------------
// Recurso propio y manifiesto
// ---------------------------------------------------------------------------

/**
 * Un recurso propio del Paquete sin conexión. `url` es la URL versionada
 * inmutable (req. 28.8); `bytes` es la longitud declarada que la descarga debe
 * igualar; `integrity` es la suma de detección de alteración que debe coincidir
 * tras descargar (verificación de completitud, req. 23.7).
 */
export type OfflineResource = Readonly<{
  url: string;
  bytes: number;
  integrity: IntegrityDescriptor;
}>;

/**
 * Manifiesto del Paquete sin conexión (diseño §7). Enumera versión de
 * aplicación, Versión de reglas, Misiones publicadas disponibles sin red y el
 * conjunto de recursos propios con su URL versionada, longitud e integridad.
 *
 * `packageVersion` identifica de forma inmutable esta versión del paquete y
 * nombra sus cachés (`fon-*-{packageVersion}`). El manifiesto es la fuente de
 * verdad de COMPLETITUD: `stage` solo marca completo el paquete si descarga y
 * verifica TODOS estos recursos.
 */
export type OfflinePackageManifest = Readonly<{
  packageVersion: PackageVersion;
  appVersion: string;
  rulesVersion: RulesVersion;
  publishedMissionIds: readonly MissionId[];
  resources: readonly OfflineResource[];
}>;

// ---------------------------------------------------------------------------
// Disponibilidad offline (inspect)
// ---------------------------------------------------------------------------

/**
 * Lo que la PWA anuncia sin red (req. 23.2). Cuando hay un paquete `current`
 * activo, expone su versión, Versión de reglas y las Misiones jugables offline;
 * `previousVersion` indica si existe un paquete anterior restaurable (rollback).
 */
export type OfflineAvailability =
  | Readonly<{
      kind: "available";
      packageVersion: PackageVersion;
      appVersion: string;
      rulesVersion: RulesVersion;
      publishedMissionIds: readonly MissionId[];
      previousVersion?: PackageVersion;
    }>
  | Readonly<{
      kind: "unavailable";
    }>;

// ---------------------------------------------------------------------------
// Fases del ciclo de vida y desenlaces de stage/activate
// ---------------------------------------------------------------------------

/**
 * Fase del ciclo de vida en la que puede fallar una actualización. La PWA debe
 * identificar la fase fallida al informar un fallo (req. 23.9).
 *
 * - `download`: un recurso no pudo descargarse;
 * - `verification`: un recurso descargado no igualó su longitud/integridad;
 * - `activation`: no se pudo cambiar el puntero de caché a `current`;
 * - `health-check`: la comprobación de arranque falló tras activar.
 */
export type OfflineUpdatePhase =
  | "download"
  | "verification"
  | "activation"
  | "health-check";

/**
 * Motivo por el que un recurso concreto no superó la verificación de
 * completitud durante el `stage` (fail-closed, req. 23.7):
 *
 * - `fetch-failed`: la descarga del recurso no se completó;
 * - `length-mismatch`: los bytes descargados no igualan la longitud declarada;
 * - `integrity-mismatch`: la suma recalculada no coincide con la declarada.
 */
export type ResourceFailureReason =
  | "fetch-failed"
  | "length-mismatch"
  | "integrity-mismatch";

/** Recurso que falló durante `stage`, con su motivo tipado (req. 23.9). */
export type FailedResource = Readonly<{
  url: string;
  reason: ResourceFailureReason;
  detail: string;
}>;

/**
 * Desenlace de `stage`. Éxito SOLO si se descargaron y verificaron TODOS los
 * recursos del manifiesto (completitud, req. 23.7): entonces la caché de
 * staging contiene el paquete íntegro listo para activar. Fallo tipado con la
 * fase (`download`/`verification`) y el recurso pendiente (req. 23.9); en fallo
 * el staging queda incompleto y NUNCA se marca completo ni sirve a clientes.
 */
export type StagedPackageResult =
  | Readonly<{
      ok: true;
      packageVersion: PackageVersion;
      /** Recursos verificados; su cardinalidad iguala la del manifiesto. */
      stagedResourceCount: number;
    }>
  | Readonly<{
      ok: false;
      phase: Extract<OfflineUpdatePhase, "download" | "verification">;
      packageVersion: PackageVersion;
      failed: FailedResource;
    }>;

/**
 * Resultado de la comprobación de arranque (health check) tras activar el
 * puntero (diseño §7): verifica shell, catálogo, migradores necesarios y
 * compatibilidad con guardados. Cualquier componente `false` obliga a restaurar
 * `previous` (req. 23.8).
 */
export type HealthCheckResult = Readonly<{
  shell: boolean;
  catalog: boolean;
  migrators: boolean;
  saveCompatibility: boolean;
}>;

/** ¿Superó la comprobación de arranque TODOS sus componentes? */
export function isHealthy(result: HealthCheckResult): boolean {
  return (
    result.shell &&
    result.catalog &&
    result.migrators &&
    result.saveCompatibility
  );
}

/**
 * Componentes del health check que fallaron. Vacío si todo pasó. Útil para
 * informar con precisión qué comprobación de arranque falló (req. 23.9).
 */
export function failedHealthComponents(
  result: HealthCheckResult,
): readonly (keyof HealthCheckResult)[] {
  const failed: (keyof HealthCheckResult)[] = [];
  if (!result.shell) failed.push("shell");
  if (!result.catalog) failed.push("catalog");
  if (!result.migrators) failed.push("migrators");
  if (!result.saveCompatibility) failed.push("saveCompatibility");
  return Object.freeze(failed);
}

/**
 * Desenlace de `activate`. Éxito tras cambiar el puntero a `current` y superar
 * la comprobación de arranque; se conserva el paquete anterior como `previous`
 * restaurable. Fallo tipado (`activation`/`health-check`) que ya provocó el
 * rollback a `previous` SIN eliminarlo (req. 23.6, 23.8, 23.9); `restoredVersion`
 * indica el paquete que quedó operativo tras restaurar.
 */
export type ActivationResult =
  | Readonly<{
      kind: "activated";
      activatedVersion: PackageVersion;
      previousVersion?: PackageVersion;
      health: HealthCheckResult;
    }>
  | Readonly<{
      kind: "rolled-back";
      phase: Extract<OfflineUpdatePhase, "activation" | "health-check">;
      attemptedVersion: PackageVersion;
      restoredVersion?: PackageVersion;
      failedComponents?: readonly (keyof HealthCheckResult)[];
      detail: string;
    }>;

// ---------------------------------------------------------------------------
// Validación del manifiesto (pura, fail-closed)
// ---------------------------------------------------------------------------

/** Motivos tipados por los que un manifiesto se rechaza-cerrado. */
export type ManifestRejectionReason =
  | "empty-resources"
  | "duplicate-resource-url"
  | "non-positive-bytes"
  | "missing-integrity"
  | "blank-app-version";

/** Rechazo tipado de la validación de un manifiesto. Fail-fast. */
export type ManifestValidationFailure = Readonly<{
  ok: false;
  reason: ManifestRejectionReason;
  detail: string;
}>;

/** Manifiesto válido: la enumeración de recursos es coherente y completa. */
export type ManifestValidationSuccess = Readonly<{ ok: true }>;

/** Resultado de {@link validateManifest}. */
export type ManifestValidation =
  | ManifestValidationSuccess
  | ManifestValidationFailure;

function manifestFailure(
  reason: ManifestRejectionReason,
  detail: string,
): ManifestValidationFailure {
  return Object.freeze({ ok: false, reason, detail });
}

/**
 * Valida un manifiesto de forma PURA antes de descargar nada (fail-closed): al
 * menos un recurso, URLs versionadas únicas, longitudes positivas, integridad
 * presente por recurso y versión de aplicación no vacía. No comprueba red ni
 * bytes reales: eso corresponde al `stage` (descarga + verificación). Devuelve
 * el primer fallo o éxito.
 */
export function validateManifest(
  manifest: OfflinePackageManifest,
): ManifestValidation {
  if (manifest.appVersion.trim().length === 0) {
    return manifestFailure(
      "blank-app-version",
      "el manifiesto no declara una versión de aplicación",
    );
  }
  if (manifest.resources.length === 0) {
    return manifestFailure(
      "empty-resources",
      "el manifiesto no enumera ningún recurso propio",
    );
  }
  const seen = new Set<string>();
  for (const resource of manifest.resources) {
    if (seen.has(resource.url)) {
      return manifestFailure(
        "duplicate-resource-url",
        `el recurso «${resource.url}» aparece más de una vez`,
      );
    }
    seen.add(resource.url);
    if (!Number.isInteger(resource.bytes) || resource.bytes <= 0) {
      return manifestFailure(
        "non-positive-bytes",
        `el recurso «${resource.url}» declara una longitud no positiva`,
      );
    }
    if (
      resource.integrity.algorithm.trim().length === 0 ||
      resource.integrity.value.trim().length === 0
    ) {
      return manifestFailure(
        "missing-integrity",
        `el recurso «${resource.url}» no declara integridad`,
      );
    }
  }
  return Object.freeze({ ok: true });
}
