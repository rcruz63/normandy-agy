import { describe, expect, it } from "vitest";
import {
  QuotaProbe,
  type StorageEstimate,
  type StorageEstimator,
} from "../../src/application/games/index.js";

/** Estimador falso que devuelve una estimación fija sin tocar Partidas. */
function fakeEstimator(estimate: StorageEstimate): StorageEstimator {
  return { estimate: (): Promise<StorageEstimate> => Promise.resolve(estimate) };
}

describe("QuotaProbe — estimación de capacidad sin bloquear", () => {
  it("calcula bytes disponibles como quota menos usage", async () => {
    const probe = new QuotaProbe(fakeEstimator({ usage: 300, quota: 1000 }));
    const result = await probe.probe();
    expect(result.usedBytes).toBe(300);
    expect(result.availableBytes).toBe(700);
    expect(result.fits).toBeUndefined();
  });

  it("indica que cabe cuando lo requerido no supera lo disponible", async () => {
    const probe = new QuotaProbe(fakeEstimator({ usage: 200, quota: 1000 }));
    const result = await probe.probe(500);
    expect(result.requiredBytes).toBe(500);
    expect(result.fits).toBe(true);
  });

  it("indica que no cabe cuando lo requerido supera lo disponible", async () => {
    const probe = new QuotaProbe(fakeEstimator({ usage: 900, quota: 1000 }));
    const result = await probe.probe(500);
    expect(result.availableBytes).toBe(100);
    expect(result.fits).toBe(false);
  });

  it("deja la capacidad y fits indefinidos cuando el Entorno no la expone", async () => {
    const probe = new QuotaProbe(fakeEstimator({}));
    const result = await probe.probe(500);
    expect(result.availableBytes).toBeUndefined();
    expect(result.fits).toBeUndefined();
    expect(result.requiredBytes).toBe(500);
  });

  it("acota a cero los bytes disponibles cuando el uso supera la cuota", async () => {
    const probe = new QuotaProbe(fakeEstimator({ usage: 1200, quota: 1000 }));
    const result = await probe.probe();
    expect(result.availableBytes).toBe(0);
  });
});
