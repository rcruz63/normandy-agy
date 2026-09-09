import { describe, expect, it } from "vitest";
import {
  missionId,
  packageVersion,
  rulesVersion,
} from "../../src/domain/identity/index.js";
import {
  cacheName,
  failedHealthComponents,
  isCurrentCacheName,
  isHealthy,
  isOfflinePackageCacheName,
  isPreviousCacheName,
  isStagingCacheName,
  validateManifest,
  type HealthCheckResult,
  type OfflinePackageManifest,
} from "../../src/domain/offline/index.js";

function makeManifest(
  overrides: Partial<OfflinePackageManifest> = {},
): OfflinePackageManifest {
  return {
    packageVersion: packageVersion("pkg-1"),
    appVersion: "1.0.0",
    rulesVersion: rulesVersion("rv-1"),
    publishedMissionIds: [missionId("FON-ML-2022-M01")],
    resources: [
      {
        url: "/app/shell.js?v=pkg-1",
        bytes: 10,
        integrity: { algorithm: "fnv1a-32", value: "deadbeef" },
      },
    ],
    ...overrides,
  };
}

describe("nombres de caché deterministas (diseño §7)", () => {
  it("compone fon-{role}-{version} para cada rol", () => {
    const v = packageVersion("pkg-42");
    expect(cacheName("staging", v)).toBe("fon-staging-pkg-42");
    expect(cacheName("current", v)).toBe("fon-current-pkg-42");
    expect(cacheName("previous", v)).toBe("fon-previous-pkg-42");
  });

  it("clasifica cachés de staging/current/previous por prefijo", () => {
    expect(isStagingCacheName("fon-staging-pkg-1")).toBe(true);
    expect(isStagingCacheName("fon-current-pkg-1")).toBe(false);
    expect(isCurrentCacheName("fon-current-pkg-1")).toBe(true);
    expect(isPreviousCacheName("fon-previous-pkg-1")).toBe(true);
  });

  it("reconoce solo cachés del paquete, no datos ajenos", () => {
    expect(isOfflinePackageCacheName("fon-staging-pkg-1")).toBe(true);
    expect(isOfflinePackageCacheName("fon-current-pkg-1")).toBe(true);
    expect(isOfflinePackageCacheName("fon-previous-pkg-1")).toBe(true);
    // Nombres que no son del paquete (p. ej. otra caché o índice) se excluyen:
    // la limpieza nunca debe tocarlos.
    expect(isOfflinePackageCacheName("games-store")).toBe(false);
    expect(isOfflinePackageCacheName("workbox-precache")).toBe(false);
  });
});

describe("validateManifest (fail-closed)", () => {
  it("acepta un manifiesto bien formado", () => {
    expect(validateManifest(makeManifest())).toEqual({ ok: true });
  });

  it("rechaza versión de aplicación en blanco", () => {
    const result = validateManifest(makeManifest({ appVersion: "  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blank-app-version");
  });

  it("rechaza un manifiesto sin recursos", () => {
    const result = validateManifest(makeManifest({ resources: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty-resources");
  });

  it("rechaza URLs de recurso duplicadas", () => {
    const dup = {
      url: "/a?v=1",
      bytes: 3,
      integrity: { algorithm: "fnv1a-32", value: "00000001" },
    };
    const result = validateManifest(makeManifest({ resources: [dup, dup] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("duplicate-resource-url");
  });

  it("rechaza longitudes no positivas", () => {
    const result = validateManifest(
      makeManifest({
        resources: [
          {
            url: "/a?v=1",
            bytes: 0,
            integrity: { algorithm: "fnv1a-32", value: "00000001" },
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("non-positive-bytes");
  });

  it("rechaza integridad ausente", () => {
    const result = validateManifest(
      makeManifest({
        resources: [
          {
            url: "/a?v=1",
            bytes: 5,
            integrity: { algorithm: "", value: "" },
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing-integrity");
  });
});

describe("comprobación de arranque (health check)", () => {
  const healthy: HealthCheckResult = {
    shell: true,
    catalog: true,
    migrators: true,
    saveCompatibility: true,
  };

  it("isHealthy exige TODOS los componentes", () => {
    expect(isHealthy(healthy)).toBe(true);
    expect(isHealthy({ ...healthy, catalog: false })).toBe(false);
  });

  it("failedHealthComponents lista solo los fallidos", () => {
    expect(failedHealthComponents(healthy)).toEqual([]);
    expect(
      failedHealthComponents({ ...healthy, shell: false, migrators: false }),
    ).toEqual(["shell", "migrators"]);
  });
});
