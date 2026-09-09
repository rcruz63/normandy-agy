import { describe, expect, it } from "vitest";
import { gameId, rulesVersion } from "../../src/domain/identity/index.js";
import {
  detailedLogEntry,
  simpleLogEntry,
  type ModifierBreakdown,
} from "../../src/domain/logging/log-entries.js";
import {
  projectDetailedEntry,
  projectDetailedLog,
  projectSimpleEntry,
  projectSimpleLog,
} from "../../src/domain/logging/log-projector.js";

const GAME = gameId("g-1");

const COMBAT_BREAKDOWN: ModifierBreakdown = Object.freeze({
  rawValue: 8,
  targetValue: 6,
  baseValues: Object.freeze([4]),
  modifiers: Object.freeze([
    { name: "building", value: 2 },
    { name: "hill", value: -1 },
    { name: "support", value: -2, count: 2 },
  ]),
  formula: "base + Σ modificadores",
  comparison: ">=",
  finalResult: "log.result.hit",
});

describe("projectSimpleEntry (20.1)", () => {
  it("proyecta la clave messageKey conservándola sin traducir", () => {
    const message = projectSimpleEntry(
      simpleLogEntry({
        gameId: GAME,
        sequence: 1,
        turn: 3,
        phase: "british-orders",
        actor: "unit-a",
        action: "fire",
        result: "hit",
        messageKey: "log.simple.fire",
      }),
    );
    expect(message.messageKey).toBe("log.simple.fire");
  });

  it("interpola turno, fase, actor, acción y resultado como parámetros", () => {
    const message = projectSimpleEntry(
      simpleLogEntry({
        gameId: GAME,
        sequence: 1,
        turn: 3,
        phase: "british-orders",
        actor: "unit-a",
        action: "fire",
        result: "hit",
        messageKey: "log.simple.fire",
      }),
    );
    expect(message.params).toStrictEqual({
      turn: 3,
      phase: "british-orders",
      actor: "unit-a",
      action: "fire",
      result: "hit",
    });
  });
});

describe("projectDetailedEntry con tirada (20.2)", () => {
  it("interpola cada modificador con su signo explícito y su multiplicidad", () => {
    const message = projectDetailedEntry(
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        roll: COMBAT_BREAKDOWN,
        messageKey: "log.detailed.combat",
      }),
    );
    // 20.2: cada modificador con nombre y signo; el positivo lleva "+".
    expect(message.params?.["modifiers"]).toBe("building+2, hill-1, support-2×2");
  });

  it("interpola valor bruto, objetivo, valores base, fórmula, comparación y resultado", () => {
    const message = projectDetailedEntry(
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        roll: COMBAT_BREAKDOWN,
        messageKey: "log.detailed.combat",
      }),
    );
    expect(message.params?.["rawValue"]).toBe(8);
    expect(message.params?.["targetValue"]).toBe(6);
    expect(message.params?.["baseValues"]).toBe("4");
    expect(message.params?.["formula"]).toBe("base + Σ modificadores");
    expect(message.params?.["comparison"]).toBe(">=");
    expect(message.params?.["finalResult"]).toBe("log.result.hit");
  });

  it("añade la Versión de reglas y el recuento de Referencias de fuente (20.4)", () => {
    const message = projectDetailedEntry(
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        roll: COMBAT_BREAKDOWN,
        rulesVersion: rulesVersion("rv-1"),
        sourceRefs: Object.freeze([
          { sourceVersion: "FON-ML-2022", page: 12, element: "combate" },
        ]),
        messageKey: "log.detailed.combat",
      }),
    );
    expect(message.params?.["rulesVersion"]).toBe("rv-1");
    expect(message.params?.["sourceRefCount"]).toBe(1);
  });
});

describe("projectDetailedEntry determinista (20.3)", () => {
  it("interpola entradas, reglas, prioridades y cálculos", () => {
    const message = projectDetailedEntry(
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        deterministic: {
          inputs: ["terrain.building"],
          rules: ["rule.36.13"],
          priorities: ["priority.specific-over-generic"],
          computations: ["exclude.building"],
        },
        messageKey: "log.detailed.deterministic",
      }),
    );
    expect(message.params?.["rules"]).toBe("rule.36.13");
    expect(message.params?.["priorities"]).toBe("priority.specific-over-generic");
  });
});

describe("proyección de registros completos", () => {
  it("proyecta un Registro simple en orden (20.6)", () => {
    const messages = projectSimpleLog([
      simpleLogEntry({
        gameId: GAME,
        sequence: 1,
        turn: 1,
        phase: "p",
        actor: "a",
        action: "move",
        result: "ok",
        messageKey: "log.simple.move",
      }),
      simpleLogEntry({
        gameId: GAME,
        sequence: 2,
        turn: 1,
        phase: "p",
        actor: "a",
        action: "fire",
        result: "hit",
        messageKey: "log.simple.fire",
      }),
    ]);
    expect(messages.map((message) => message.messageKey)).toStrictEqual([
      "log.simple.move",
      "log.simple.fire",
    ]);
  });

  it("proyecta un Registro detallado en orden (20.7)", () => {
    const messages = projectDetailedLog([
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        roll: COMBAT_BREAKDOWN,
        messageKey: "log.detailed.combat",
      }),
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageKey).toBe("log.detailed.combat");
  });
});
