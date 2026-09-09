import { describe, expect, it } from "vitest";
import { packageVersion, type PackageVersion } from "../../src/domain/identity/index.js";
import {
  resolveFromCurrent,
  type CurrentVersionSource,
  type WorkerCacheLike,
  type WorkerCacheStorageLike,
} from "../../src/service-worker/index.js";

/** CacheStorage falso que registra qué cachés se abrieron para servir. */
class SpyCacheStorage implements WorkerCacheStorageLike {
  public readonly opened: string[] = [];
  public constructor(
    private readonly entries: Readonly<Record<string, Readonly<Record<string, Response>>>>,
  ) {}

  async open(name: string): Promise<WorkerCacheLike> {
    this.opened.push(name);
    const cache = this.entries[name] ?? {};
    return {
      match: async (request: string) => cache[request],
    };
  }
}

function source(version: PackageVersion | undefined): CurrentVersionSource {
  return { currentVersion: async () => version };
}

describe("service worker: servir solo desde current, nunca desde staging", () => {
  it("resuelve un recurso desde la caché current activa", async () => {
    const response = new Response("shell");
    const caches = new SpyCacheStorage({
      "fon-current-pkg-1": { "/shell.js": response },
      "fon-staging-pkg-1": { "/shell.js": new Response("staging") },
    });

    const result = await resolveFromCurrent(
      "/shell.js",
      source(packageVersion("pkg-1")),
      caches,
    );

    expect(result).toBe(response);
    // Solo se abrió la caché current; jamás la de staging.
    expect(caches.opened).toEqual(["fon-current-pkg-1"]);
    expect(caches.opened).not.toContain("fon-staging-pkg-1");
  });

  it("devuelve undefined si no hay paquete current activo", async () => {
    const caches = new SpyCacheStorage({});
    const result = await resolveFromCurrent("/shell.js", source(undefined), caches);
    expect(result).toBeUndefined();
    expect(caches.opened).toEqual([]);
  });

  it("devuelve undefined si el recurso no está en current", async () => {
    const caches = new SpyCacheStorage({ "fon-current-pkg-1": {} });
    const result = await resolveFromCurrent(
      "/missing.js",
      source(packageVersion("pkg-1")),
      caches,
    );
    expect(result).toBeUndefined();
  });
});
