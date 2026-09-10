import { describe, expect, it } from "vitest";
import {
  CapabilityDetector,
  surfaceFromEnvironment,
  type PlatformSurface,
} from "../../src/adapters/browser/capabilities/index.js";

/** Superficie con todas las capacidades presentes; se sobreescribe por caso. */
function fullSurface(overrides: Partial<PlatformSurface> = {}): PlatformSurface {
  return {
    indexedDbReadable: true,
    serviceWorkerSupported: true,
    cacheApiSupported: true,
    installable: true,
    maxTouchPoints: 5,
    coarsePointer: true,
    ...overrides,
  };
}

describe("CapabilityDetector — matriz de capacidades (31.3, 31.4, 31.7)", () => {
  it("todas presentes: permite iniciar, sin bloqueo, exportación disponible", () => {
    const report = new CapabilityDetector(fullSurface()).detect();
    expect(report.canStartGame).toBe(true);
    expect(report.missingMandatory).toEqual([]);
    expect(report.blockMessageKey).toBeUndefined();
    expect(report.exportAvailable).toBe(true);
    // Comprueba exactamente las cuatro capacidades del diseño §8, en orden.
    expect(report.checks.map((c) => c.id)).toEqual([
      "installability",
      "indexeddb",
      "offline",
      "touch",
    ]);
    expect(report.checks.every((c) => c.mandatory)).toBe(true);
    expect(report.checks.every((c) => c.present)).toBe(true);
  });

  it("falta instalabilidad: bloquea el inicio con explicación (31.4)", () => {
    const report = new CapabilityDetector(fullSurface({ installable: false })).detect();
    expect(report.canStartGame).toBe(false);
    expect(report.missingMandatory).toEqual(["installability"]);
    expect(report.blockMessageKey).toBe("ui.capability.blocked");
    // IndexedDB legible: la exportación permanece disponible (31.7).
    expect(report.exportAvailable).toBe(true);
  });

  it("falta Modo sin conexión (sin service worker): bloquea el inicio", () => {
    const report = new CapabilityDetector(
      fullSurface({ serviceWorkerSupported: false }),
    ).detect();
    expect(report.canStartGame).toBe(false);
    expect(report.missingMandatory).toEqual(["offline"]);
    expect(report.exportAvailable).toBe(true);
  });

  it("falta Modo sin conexión (sin Cache API): bloquea el inicio", () => {
    const report = new CapabilityDetector(
      fullSurface({ cacheApiSupported: false }),
    ).detect();
    expect(report.missingMandatory).toEqual(["offline"]);
    expect(report.canStartGame).toBe(false);
  });

  it("falta tacto (sin puntos ni puntero grueso): bloquea el inicio", () => {
    const report = new CapabilityDetector(
      fullSurface({ maxTouchPoints: 0, coarsePointer: false }),
    ).detect();
    expect(report.missingMandatory).toEqual(["touch"]);
    expect(report.canStartGame).toBe(false);
  });

  it("acepta tacto por puntero grueso aunque maxTouchPoints sea 0", () => {
    const report = new CapabilityDetector(
      fullSurface({ maxTouchPoints: 0, coarsePointer: true }),
    ).detect();
    const touch = report.checks.find((c) => c.id === "touch");
    expect(touch?.present).toBe(true);
  });

  it("falta IndexedDB: bloquea el inicio Y retira la exportación (31.7)", () => {
    const report = new CapabilityDetector(
      fullSurface({ indexedDbReadable: false }),
    ).detect();
    expect(report.canStartGame).toBe(false);
    expect(report.missingMandatory).toEqual(["indexeddb"]);
    // Sin IndexedDB legible no hay datos que exportar.
    expect(report.exportAvailable).toBe(false);
  });

  it("IndexedDB legible pero otra capacidad ausente: exportación preservada (31.7)", () => {
    const report = new CapabilityDetector(
      fullSurface({ installable: false, serviceWorkerSupported: false }),
    ).detect();
    expect(report.canStartGame).toBe(false);
    expect(report.missingMandatory).toEqual(["installability", "offline"]);
    // IndexedDB legible: exportación disponible pese al bloqueo del inicio.
    expect(report.exportAvailable).toBe(true);
  });

  it("cada comprobación aporta una clave de mensaje es-ES", () => {
    const report = new CapabilityDetector(fullSurface()).detect();
    for (const check of report.checks) {
      expect(check.messageKey.startsWith("ui.capability.")).toBe(true);
    }
  });

  it("el informe y sus listas son inmutables (congelados)", () => {
    const report = new CapabilityDetector(fullSurface()).detect();
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.checks)).toBe(true);
    expect(Object.isFrozen(report.missingMandatory)).toBe(true);
  });
});

describe("surfaceFromEnvironment — deriva la superficie de window/navigator", () => {
  it("un entorno vacío no declara ninguna capacidad", () => {
    const surface = surfaceFromEnvironment({});
    expect(surface.indexedDbReadable).toBe(false);
    expect(surface.serviceWorkerSupported).toBe(false);
    expect(surface.cacheApiSupported).toBe(false);
    expect(surface.installable).toBe(false);
    expect(surface.maxTouchPoints).toBe(0);
    expect(surface.coarsePointer).toBe(false);
  });

  it("detecta capacidades presentes desde globals inyectados", () => {
    const surface = surfaceFromEnvironment({
      window: {
        indexedDB: {},
        caches: {},
        matchMedia: (query: string) => ({
          matches: query.includes("coarse") || query.includes("standalone"),
        }),
      },
      navigator: { serviceWorker: {}, maxTouchPoints: 5 },
    });
    expect(surface.indexedDbReadable).toBe(true);
    expect(surface.serviceWorkerSupported).toBe(true);
    expect(surface.cacheApiSupported).toBe(true);
    expect(surface.installable).toBe(true);
    expect(surface.maxTouchPoints).toBe(5);
    expect(surface.coarsePointer).toBe(true);
  });

  it("una superficie derivada de un entorno vacío bloquea el inicio", () => {
    const report = new CapabilityDetector(surfaceFromEnvironment({})).detect();
    expect(report.canStartGame).toBe(false);
    expect(report.missingMandatory).toEqual([
      "installability",
      "indexeddb",
      "offline",
      "touch",
    ]);
    expect(report.exportAvailable).toBe(false);
  });
});
