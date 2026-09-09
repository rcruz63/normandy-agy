import { describe, expect, it } from "vitest";
import {
  BrowserStorageEstimator,
  type StorageManagerLike,
} from "../../src/adapters/browser/capabilities/index.js";

function manager(result: { usage?: number; quota?: number }): StorageManagerLike {
  return { estimate: () => Promise.resolve(result) };
}

describe("BrowserStorageEstimator — normaliza la estimación de plataforma", () => {
  it("copia usage y quota cuando son números finitos", async () => {
    const estimator = new BrowserStorageEstimator(manager({ usage: 10, quota: 100 }));
    const estimate = await estimator.estimate();
    expect(estimate).toEqual({ usage: 10, quota: 100 });
  });

  it("omite campos ausentes (capacidad desconocida)", async () => {
    const estimator = new BrowserStorageEstimator(manager({}));
    const estimate = await estimator.estimate();
    expect(estimate.usage).toBeUndefined();
    expect(estimate.quota).toBeUndefined();
  });

  it("omite valores no finitos sin propagar NaN/Infinity", async () => {
    const estimator = new BrowserStorageEstimator(
      manager({ usage: Number.NaN, quota: Number.POSITIVE_INFINITY }),
    );
    const estimate = await estimator.estimate();
    expect(estimate.usage).toBeUndefined();
    expect(estimate.quota).toBeUndefined();
  });
});
