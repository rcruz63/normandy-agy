import { beforeEach, describe, expect, it } from "vitest";
import {
  missionId,
  packageVersion,
  rulesVersion,
  type PackageVersion,
} from "../../src/domain/identity/index.js";
import { computeIntegrity } from "../../src/domain/persistence/index.js";
import { cacheName, type OfflinePackageManifest } from "../../src/domain/offline/index.js";
import type {
  CachedResource,
  OfflinePackageCacheStore,
} from "../../src/adapters/browser/cache/index.js";
import type {
  FetchResult,
  OfflineResourceFetcher,
} from "../../src/adapters/browser/cache/index.js";
import {
  ActivationConfirmationRequiredError,
  DefaultOfflinePackageCoordinator,
  PackageNotStagedError,
  type OfflineHealthChecker,
  type OfflinePackagePointer,
  type OfflinePackageState,
  type OpenGamePolicy,
} from "../../src/application/offline/index.js";
import type { HealthCheckResult } from "../../src/domain/offline/index.js";

// --- Fakes en memoria --------------------------------------------------------

/**
 * Almacén de cachés en memoria que registra las operaciones y NUNCA modela
 * datos de Partidas: solo cachés del paquete. Guarda las cachés borradas para
 * afirmar que la limpieza nunca toca nada ajeno al paquete.
 */
class FakeCacheStore implements OfflinePackageCacheStore {
  public readonly caches = new Map<string, Map<string, Uint8Array>>();
  public readonly deleted: string[] = [];
  /** Cachés no-paquete presentes en el Entorno (p. ej. datos de Partidas). */
  public constructor(preexisting: readonly string[] = []) {
    for (const name of preexisting) {
      this.caches.set(name, new Map());
    }
  }

  async putStaged(version: PackageVersion, resource: CachedResource): Promise<void> {
    const name = cacheName("staging", version);
    const cache = this.caches.get(name) ?? new Map<string, Uint8Array>();
    cache.set(resource.url, resource.body);
    this.caches.set(name, cache);
  }

  async hasCurrent(version: PackageVersion): Promise<boolean> {
    return this.caches.has(cacheName("current", version));
  }

  async hasPrevious(version: PackageVersion): Promise<boolean> {
    return this.caches.has(cacheName("previous", version));
  }

  async promoteStagingToCurrent(
    version: PackageVersion,
    previousVersion?: PackageVersion,
  ): Promise<void> {
    if (previousVersion !== undefined) {
      this.copy(cacheName("current", previousVersion), cacheName("previous", previousVersion));
    }
    this.copy(cacheName("staging", version), cacheName("current", version));
  }

  async restorePrevious(previousVersion: PackageVersion): Promise<void> {
    this.copy(cacheName("previous", previousVersion), cacheName("current", previousVersion));
  }

  async discardStaging(version: PackageVersion): Promise<void> {
    const name = cacheName("staging", version);
    this.deleted.push(name);
    this.caches.delete(name);
  }

  async listPackageCaches(): Promise<readonly string[]> {
    return [...this.caches.keys()].filter(
      (name) =>
        name.startsWith("fon-staging") ||
        name.startsWith("fon-current") ||
        name.startsWith("fon-previous"),
    );
  }

  async deletePackageCache(name: string): Promise<void> {
    this.deleted.push(name);
    this.caches.delete(name);
  }

  private copy(from: string, to: string): void {
    const source = this.caches.get(from);
    if (source === undefined) return;
    this.caches.set(to, new Map(source));
  }
}

/** Descargador que devuelve bytes fijos por URL o un fallo. */
class FakeFetcher implements OfflineResourceFetcher {
  public constructor(
    private readonly bodies: Readonly<Record<string, Uint8Array>>,
    private readonly failures: ReadonlySet<string> = new Set(),
  ) {}

  async fetchResource(url: string): Promise<FetchResult> {
    if (this.failures.has(url)) {
      return { ok: false, url, detail: "red no disponible" };
    }
    const body = this.bodies[url];
    if (body === undefined) {
      return { ok: false, url, detail: "recurso desconocido" };
    }
    return { ok: true, resource: { url, body } };
  }
}

/** Puntero mutable en memoria. */
class FakePointer implements OfflinePackagePointer {
  public state: OfflinePackageState;
  public constructor(initial: OfflinePackageState = {}) {
    this.state = initial;
  }
  async read(): Promise<OfflinePackageState> {
    return this.state;
  }
  async setActive(
    activated: OfflinePackageManifest,
    demoted?: OfflinePackageManifest,
  ): Promise<void> {
    this.state = demoted === undefined ? { current: activated } : { current: activated, previous: demoted };
  }
  async restoreTo(restored: OfflinePackageManifest): Promise<void> {
    this.state = { current: restored };
  }
}

class FakeOpenGamePolicy implements OpenGamePolicy {
  public constructor(private readonly open: boolean) {}
  async isGameOpen(): Promise<boolean> {
    return this.open;
  }
}

class FakeHealthChecker implements OfflineHealthChecker {
  public constructor(private readonly result: HealthCheckResult) {}
  async check(): Promise<HealthCheckResult> {
    return this.result;
  }
}

const HEALTHY: HealthCheckResult = {
  shell: true,
  catalog: true,
  migrators: true,
  saveCompatibility: true,
};

// --- Ayudas de manifiesto ----------------------------------------------------

function resourceBody(bytes: number): Uint8Array {
  return new Uint8Array(Array.from({ length: bytes }, (_v, index) => index % 251));
}

/**
 * Construye un manifiesto cuya integridad declarada coincide con la que el
 * coordinador recalcula sobre los bytes (misma convención de canonicalización).
 */
function manifestFor(
  version: string,
  resources: readonly Readonly<{ url: string; body: Uint8Array }>[],
): { manifest: OfflinePackageManifest; bodies: Record<string, Uint8Array> } {
  const bodies: Record<string, Uint8Array> = {};
  const declared = resources.map((resource) => {
    bodies[resource.url] = resource.body;
    return {
      url: resource.url,
      bytes: resource.body.byteLength,
      integrity: computeIntegrity(Array.from(resource.body)),
    };
  });
  const manifest: OfflinePackageManifest = {
    packageVersion: packageVersion(version),
    appVersion: version,
    rulesVersion: rulesVersion("rv-1"),
    publishedMissionIds: [missionId("FON-ML-2022-M01")],
    resources: declared,
  };
  return { manifest, bodies };
}

// --- Pruebas -----------------------------------------------------------------

describe("DefaultOfflinePackageCoordinator.stage (fail-closed)", () => {
  it("descarga y verifica todos los recursos antes de marcar completitud", async () => {
    const { manifest, bodies } = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(12) },
      { url: "/rules.json?v=pkg-1", body: resourceBody(30) },
    ]);
    const cache = new FakeCacheStore();
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache,
      fetcher: new FakeFetcher(bodies),
      pointer: new FakePointer(),
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });

    const result = await coordinator.stage(manifest);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.stagedResourceCount).toBe(2);
    // Los bytes verificados quedan en la caché de STAGING, no en current.
    expect(cache.caches.get("fon-staging-pkg-1")?.size).toBe(2);
    expect(cache.caches.has("fon-current-pkg-1")).toBe(false);
  });

  it("falla en fase download si un recurso no se descarga y no marca completo", async () => {
    const { manifest, bodies } = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(12) },
      { url: "/rules.json?v=pkg-1", body: resourceBody(30) },
    ]);
    const cache = new FakeCacheStore();
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache,
      fetcher: new FakeFetcher(bodies, new Set(["/rules.json?v=pkg-1"])),
      pointer: new FakePointer(),
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });

    const result = await coordinator.stage(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("download");
      expect(result.failed.url).toBe("/rules.json?v=pkg-1");
      expect(result.failed.reason).toBe("fetch-failed");
    }
    // Activar una versión no completada debe fallar-cerrado.
    await expect(coordinator.activate(packageVersion("pkg-1"))).rejects.toBeInstanceOf(
      PackageNotStagedError,
    );
  });

  it("falla en verificación por longitud distinta de la declarada", async () => {
    const { manifest } = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(12) },
    ]);
    // El descargador devuelve MENOS bytes de los declarados.
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache: new FakeCacheStore(),
      fetcher: new FakeFetcher({ "/shell.js?v=pkg-1": resourceBody(8) }),
      pointer: new FakePointer(),
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });

    const result = await coordinator.stage(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("verification");
      expect(result.failed.reason).toBe("length-mismatch");
    }
  });

  it("falla en verificación por integridad distinta de la declarada", async () => {
    const { manifest } = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(12) },
    ]);
    // Bytes de la misma longitud pero contenido distinto: suma no coincide.
    const tampered = new Uint8Array(12).fill(9);
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache: new FakeCacheStore(),
      fetcher: new FakeFetcher({ "/shell.js?v=pkg-1": tampered }),
      pointer: new FakePointer(),
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });

    const result = await coordinator.stage(manifest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe("verification");
      expect(result.failed.reason).toBe("integrity-mismatch");
    }
  });
});

describe("DefaultOfflinePackageCoordinator.activate", () => {
  it("exige confirmación cuando hay una Partida abierta (req. 23.6)", async () => {
    const { manifest, bodies } = manifestFor("pkg-2", [
      { url: "/shell.js?v=pkg-2", body: resourceBody(10) },
    ]);
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache: new FakeCacheStore(),
      fetcher: new FakeFetcher(bodies),
      pointer: new FakePointer(),
      openGames: new FakeOpenGamePolicy(true),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });
    await coordinator.stage(manifest);

    await expect(coordinator.activate(manifest.packageVersion)).rejects.toBeInstanceOf(
      ActivationConfirmationRequiredError,
    );

    // Con confirmación explícita, activa correctamente.
    const confirmed = await coordinator.activate(manifest.packageVersion, {
      confirmed: true,
    });
    expect(confirmed.kind).toBe("activated");
  });

  it("activa y conserva el saliente como previous restaurable", async () => {
    // current previo pkg-1; se activa pkg-2.
    const previous = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(10) },
    ]).manifest;
    const { manifest, bodies } = manifestFor("pkg-2", [
      { url: "/shell.js?v=pkg-2", body: resourceBody(11) },
    ]);
    const cache = new FakeCacheStore(["fon-current-pkg-1"]);
    const pointer = new FakePointer({ current: previous });
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache,
      fetcher: new FakeFetcher(bodies),
      pointer,
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });
    await coordinator.stage(manifest);

    const result = await coordinator.activate(manifest.packageVersion);
    expect(result.kind).toBe("activated");
    if (result.kind === "activated") {
      expect(result.activatedVersion).toBe("pkg-2");
      expect(result.previousVersion).toBe("pkg-1");
    }
    expect(pointer.state.current?.packageVersion).toBe("pkg-2");
    expect(pointer.state.previous?.packageVersion).toBe("pkg-1");
  });

  it("restaura previous sin borrarlo si el health check falla (req. 23.8)", async () => {
    const previous = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(10) },
    ]).manifest;
    const { manifest, bodies } = manifestFor("pkg-2", [
      { url: "/shell.js?v=pkg-2", body: resourceBody(11) },
    ]);
    const cache = new FakeCacheStore(["fon-current-pkg-1"]);
    const pointer = new FakePointer({ current: previous });
    const coordinator = new DefaultOfflinePackageCoordinator({
      cache,
      fetcher: new FakeFetcher(bodies),
      pointer,
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker({ ...HEALTHY, catalog: false }),
    });
    await coordinator.stage(manifest);

    const result = await coordinator.activate(manifest.packageVersion);
    expect(result.kind).toBe("rolled-back");
    if (result.kind === "rolled-back") {
      expect(result.phase).toBe("health-check");
      expect(result.attemptedVersion).toBe("pkg-2");
      expect(result.restoredVersion).toBe("pkg-1");
      expect(result.failedComponents).toContain("catalog");
    }
    // El puntero vuelve al paquete anterior operativo.
    expect(pointer.state.current?.packageVersion).toBe("pkg-1");
    // El paquete que falló NO se elimina.
    expect(cache.deleted).not.toContain("fon-current-pkg-2");
    expect(cache.deleted).not.toContain("fon-staging-pkg-2");
  });
});

describe("DefaultOfflinePackageCoordinator.rollback y cleanup", () => {
  let cache: FakeCacheStore;
  let pointer: FakePointer;
  let coordinator: DefaultOfflinePackageCoordinator;

  beforeEach(() => {
    const current = manifestFor("pkg-2", [
      { url: "/shell.js?v=pkg-2", body: resourceBody(11) },
    ]).manifest;
    const previous = manifestFor("pkg-1", [
      { url: "/shell.js?v=pkg-1", body: resourceBody(10) },
    ]).manifest;
    cache = new FakeCacheStore([
      "fon-current-pkg-2",
      "fon-current-pkg-1",
      "fon-previous-pkg-1",
      "fon-staging-pkg-3",
      // Caché ajena al paquete (p. ej. datos/index): jamás debe borrarse.
      "games-store",
    ]);
    pointer = new FakePointer({ current, previous });
    coordinator = new DefaultOfflinePackageCoordinator({
      cache,
      fetcher: new FakeFetcher({}),
      pointer,
      openGames: new FakeOpenGamePolicy(false),
      healthChecker: new FakeHealthChecker(HEALTHY),
    });
  });

  it("rollback restaura previous sin borrar el paquete abandonado", async () => {
    await coordinator.rollback(packageVersion("pkg-3"));
    // Restaura al previous vigente.
    expect(pointer.state.current?.packageVersion).toBe("pkg-1");
    // Solo descarta el staging del abandonado; no borra current/previous.
    expect(cache.deleted).toContain("fon-staging-pkg-3");
    expect(cache.deleted).not.toContain("fon-current-pkg-1");
    expect(cache.deleted).not.toContain("fon-previous-pkg-1");
  });

  it("cleanup elimina cachés obsoletas del paquete pero nunca datos de Partidas", async () => {
    const removed = await coordinator.cleanup();
    // Conserva current activa (pkg-2) y las del previous (pkg-1).
    expect(cache.caches.has("fon-current-pkg-2")).toBe(true);
    expect(cache.caches.has("fon-current-pkg-1")).toBe(true);
    expect(cache.caches.has("fon-previous-pkg-1")).toBe(true);
    // Elimina el staging obsoleto de otra versión.
    expect(removed).toContain("fon-staging-pkg-3");
    // NUNCA toca datos ajenos al paquete (Partidas viven en IndexedDB).
    expect(cache.deleted).not.toContain("games-store");
    expect(cache.caches.has("games-store")).toBe(true);
  });
});
