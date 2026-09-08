import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gameId, randomAlgorithmVersion } from "../../src/domain/identity/index.js";
import type {
  RandomRequest,
  RandomState,
} from "../../src/domain/random/index.js";
import {
  ALGORITHM_SPLITMIX64_V1,
  PureVersionedRandom,
  RandomError,
  initialRandomState,
  pureVersionedRandom,
} from "../../src/domain/random/index.js";

const GAME = gameId("game-1");

function d6Request(label = "tirada"): RandomRequest {
  return {
    gameId: GAME,
    domain: { kind: "dice", sides: 6, count: 1 },
    context: { label },
  };
}

describe("PureVersionedRandom.supports()", () => {
  it("refleja el registro inmutable de algoritmos", () => {
    expect(pureVersionedRandom.supports(ALGORITHM_SPLITMIX64_V1)).toBe(true);
    expect(
      pureVersionedRandom.supports(randomAlgorithmVersion("inexistente-v9")),
    ).toBe(false);
  });
});

describe("initialRandomState()", () => {
  it("crea un estado en posición 0 con la versión pedida", () => {
    const state = initialRandomState("semilla-abc");
    expect(state.position).toBe(0);
    expect(state.seed).toBe("semilla-abc");
    expect(state.algorithmVersion).toBe(ALGORITHM_SPLITMIX64_V1);
  });

  it("rechaza semilla vacía", () => {
    expect(() => initialRandomState("")).toThrow(RandomError);
    expect(() => initialRandomState("   ")).toThrow(RandomError);
  });

  it("rechaza una versión de algoritmo no registrada", () => {
    expect(() =>
      initialRandomState("s", randomAlgorithmVersion("desconocida")),
    ).toThrow(RandomError);
  });
});

describe("PureVersionedRandom.next() — determinismo", () => {
  it("misma (state, request) produce el mismo RandomStep", () => {
    const state = initialRandomState("semilla");
    const req = d6Request();
    const a = pureVersionedRandom.next(state, req);
    const b = pureVersionedRandom.next(state, req);
    expect(a).toEqual(b);
    expect(a.consumption.rawResult).toEqual(b.consumption.rawResult);
    expect(a.consumption.interpretedResult).toBe(b.consumption.interpretedResult);
  });

  it("dos máquinas independientes producen la misma secuencia", () => {
    const m1 = new PureVersionedRandom();
    const m2 = new PureVersionedRandom();
    let s1: RandomState = initialRandomState("misma-semilla");
    let s2: RandomState = initialRandomState("misma-semilla");
    const req = d6Request();
    for (let i = 0; i < 20; i += 1) {
      const r1 = m1.next(s1, req);
      const r2 = m2.next(s2, req);
      expect(r1.consumption.rawResult).toEqual(r2.consumption.rawResult);
      expect(r1.state.position).toBe(r2.state.position);
      s1 = r1.state;
      s2 = r2.state;
    }
  });

  it("semillas distintas divergen en algún punto de la secuencia", () => {
    let sa: RandomState = initialRandomState("semilla-A");
    let sb: RandomState = initialRandomState("semilla-B");
    const req = d6Request();
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const ra = pureVersionedRandom.next(sa, req);
      const rb = pureVersionedRandom.next(sb, req);
      seqA.push(ra.consumption.interpretedResult as number);
      seqB.push(rb.consumption.interpretedResult as number);
      sa = ra.state;
      sb = rb.state;
    }
    expect(seqA).not.toEqual(seqB);
  });
});

describe("PureVersionedRandom.next() — posiciones e identificadores", () => {
  it("las posiciones avanzan de forma estrictamente creciente y consecutiva", () => {
    let state: RandomState = initialRandomState("semilla");
    const req = d6Request();
    let previous = state.position;
    const ids = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const step = pureVersionedRandom.next(state, req);
      expect(step.state.position).toBeGreaterThan(previous);
      expect(step.consumption.position).toBe(step.state.position);
      ids.add(step.consumption.id as unknown as string);
      previous = step.state.position;
      state = step.state;
    }
    // Identificadores únicos dentro de la Partida.
    expect(ids.size).toBe(50);
  });

  it("una tirada 2d6 consume al menos dos posiciones y suma dos caras", () => {
    const state = initialRandomState("semilla");
    const step = pureVersionedRandom.next(state, {
      gameId: GAME,
      domain: { kind: "dice", sides: 6, count: 2 },
      context: { label: "2d6" },
    });
    expect(step.consumption.rawResult).toHaveLength(2);
    for (const face of step.consumption.rawResult) {
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
    }
    const sum = step.consumption.rawResult.reduce((a, b) => a + b, 0);
    expect(step.consumption.interpretedResult).toBe(sum);
    expect(step.state.position).toBeGreaterThanOrEqual(2);
  });

  it("el dominio uniforme respeta el intervalo inclusivo", () => {
    let state: RandomState = initialRandomState("semilla");
    for (let i = 0; i < 100; i += 1) {
      const step = pureVersionedRandom.next(state, {
        gameId: GAME,
        domain: { kind: "uniform", min: 3, max: 5 },
        context: { label: "u" },
      });
      const v = step.consumption.interpretedResult as number;
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      state = step.state;
    }
  });
});

describe("PureVersionedRandom.next() — validación y pureza", () => {
  it("no muta el estado recibido", () => {
    const state = initialRandomState("semilla");
    const snapshot = { ...state };
    pureVersionedRandom.next(state, d6Request());
    expect(state).toEqual(snapshot);
  });

  it("rechaza un estado con versión no soportada", () => {
    const bad: RandomState = {
      seed: "s",
      position: 0,
      algorithmVersion: randomAlgorithmVersion("desconocida"),
    };
    expect(() => pureVersionedRandom.next(bad, d6Request())).toThrow(RandomError);
  });

  it("rechaza dominios inválidos", () => {
    const state = initialRandomState("semilla");
    expect(() =>
      pureVersionedRandom.next(state, {
        gameId: GAME,
        domain: { kind: "dice", sides: 0, count: 1 },
        context: { label: "x" },
      }),
    ).toThrow(RandomError);
    expect(() =>
      pureVersionedRandom.next(state, {
        gameId: GAME,
        domain: { kind: "uniform", min: 5, max: 1 },
        context: { label: "x" },
      }),
    ).toThrow(RandomError);
  });
});

describe("determinismo con fast-check", () => {
  it("dos ejecuciones desde el mismo estado producen iguales consumos", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 6 }),
        (seed, count) => {
          const state = initialRandomState(seed);
          const req: RandomRequest = {
            gameId: GAME,
            domain: { kind: "dice", sides: 6, count },
            context: { label: "fc" },
          };
          const a = pureVersionedRandom.next(state, req);
          const b = pureVersionedRandom.next(state, req);
          expect(a.consumption.rawResult).toEqual(b.consumption.rawResult);
          expect(a.state.position).toBe(b.state.position);
          expect(a.state.position).toBeGreaterThan(state.position);
        },
      ),
      { numRuns: 100 },
    );
  });
});
