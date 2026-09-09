import { describe, expect, it } from "vitest";
import { gameId, rulesVersion } from "../../src/domain/identity/index.js";
import {
  appendDetailedEntry,
  appendSimpleEntry,
  detailedLog,
  detailedLogEntry,
  InvalidLogEntryError,
  simpleLog,
  simpleLogEntry,
  type DetailedLogEntry,
  type ModifierBreakdown,
  type SimpleLogEntry,
} from "../../src/domain/logging/log-entries.js";

// --- Fixtures reutilizables ---
const GAME = gameId("g-1");
const OTHER_GAME = gameId("g-2");

function makeSimple(sequence: number): SimpleLogEntry {
  return simpleLogEntry({
    gameId: GAME,
    sequence,
    turn: 3,
    phase: "british-orders",
    actor: "unit-a",
    action: "fire",
    result: "hit",
    messageKey: "log.simple.fire",
  });
}

const COMBAT_BREAKDOWN: ModifierBreakdown = Object.freeze({
  rawValue: 8,
  targetValue: 6,
  baseValues: Object.freeze([4]),
  modifiers: Object.freeze([
    { name: "building", value: 2 },
    { name: "support", value: -2, count: 2 },
  ]),
  formula: "base + Σ modificadores",
  comparison: ">=",
  finalResult: "log.result.hit",
});

function makeDetailedRoll(sequence: number): DetailedLogEntry {
  return detailedLogEntry({
    gameId: GAME,
    sequence,
    roll: COMBAT_BREAKDOWN,
    rulesVersion: rulesVersion("rv-1"),
    sourceRefs: Object.freeze([
      { sourceVersion: "FON-ML-2022", page: 12, element: "combate" },
    ]),
    consumptions: Object.freeze([{ position: 7, algorithmVersion: "rav-1" }]),
    messageKey: "log.detailed.combat",
  });
}

describe("simpleLogEntry (20.1)", () => {
  it("construye una entrada con gameId, secuencia, turno, fase, actor, acción y resultado", () => {
    const entry = makeSimple(1);
    expect(entry.gameId).toBe(GAME);
    expect(entry.sequence).toBe(1);
    expect(entry.turn).toBe(3);
    expect(entry.phase).toBe("british-orders");
    expect(entry.actor).toBe("unit-a");
    expect(entry.action).toBe("fire");
    expect(entry.result).toBe("hit");
    expect(entry.messageKey).toBe("log.simple.fire");
  });

  it("rechaza una secuencia negativa", () => {
    expect(() => makeSimple(-1)).toThrow(InvalidLogEntryError);
  });

  it("rechaza una fase vacía", () => {
    expect(() =>
      simpleLogEntry({
        gameId: GAME,
        sequence: 1,
        turn: 0,
        phase: "  ",
        actor: "a",
        action: "b",
        result: "c",
        messageKey: "k",
      }),
    ).toThrow(InvalidLogEntryError);
  });
});

describe("detailedLogEntry con tirada (20.2, 20.4)", () => {
  it("recoge valor bruto, objetivo, valores base, modificadores con signo, fórmula, comparación y resultado", () => {
    const entry = makeDetailedRoll(1);
    expect(entry.roll?.rawValue).toBe(8);
    expect(entry.roll?.targetValue).toBe(6);
    expect(entry.roll?.baseValues).toStrictEqual([4]);
    expect(entry.roll?.modifiers[0]).toStrictEqual({ name: "building", value: 2 });
    expect(entry.roll?.modifiers[1]).toStrictEqual({
      name: "support",
      value: -2,
      count: 2,
    });
    expect(entry.roll?.comparison).toBe(">=");
    expect(entry.roll?.finalResult).toBe("log.result.hit");
  });

  it("incluye la Versión de reglas y las Referencias de fuente aplicables (20.4)", () => {
    const entry = makeDetailedRoll(1);
    expect(entry.rulesVersion).toBe(rulesVersion("rv-1"));
    expect(entry.sourceRefs).toHaveLength(1);
    expect(entry.sourceRefs?.[0]?.page).toBe(12);
  });

  it("conserva los Consumos aleatorios efectuados (8.7, 12.3, 12.5, 14.5, 16.4, 38.8)", () => {
    const entry = makeDetailedRoll(1);
    expect(entry.consumptions).toStrictEqual([
      { position: 7, algorithmVersion: "rav-1" },
    ]);
  });
});

describe("detailedLogEntry determinista sin tirada (20.3)", () => {
  it("recoge entradas, reglas, prioridades y cálculos deterministas", () => {
    const entry = detailedLogEntry({
      gameId: GAME,
      sequence: 1,
      deterministic: {
        inputs: ["terrain.building"],
        rules: ["rule.36.13"],
        priorities: ["priority.specific-over-generic"],
        computations: ["exclude.building.modifier"],
      },
      messageKey: "log.detailed.deterministic",
    });
    expect(entry.deterministic?.rules).toStrictEqual(["rule.36.13"]);
    expect(entry.deterministic?.priorities).toStrictEqual([
      "priority.specific-over-generic",
    ]);
    expect(entry.roll).toBeUndefined();
  });

  it("rechaza una entrada sin naturaleza (ni tirada ni determinista)", () => {
    expect(() =>
      detailedLogEntry({ gameId: GAME, sequence: 1, messageKey: "k" }),
    ).toThrow(InvalidLogEntryError);
  });

  it("rechaza una entrada con ambas naturalezas a la vez", () => {
    expect(() =>
      detailedLogEntry({
        gameId: GAME,
        sequence: 1,
        roll: COMBAT_BREAKDOWN,
        deterministic: { inputs: [], rules: [], priorities: [], computations: [] },
        messageKey: "k",
      }),
    ).toThrow(InvalidLogEntryError);
  });
});

describe("aislamiento por Partida (20.5)", () => {
  it("rechaza mezclar gameId distintos en el Registro simple", () => {
    const mixed: readonly SimpleLogEntry[] = [
      makeSimple(1),
      { ...makeSimple(2), gameId: OTHER_GAME },
    ];
    expect(() => simpleLog(GAME, mixed)).toThrow(InvalidLogEntryError);
  });

  it("rechaza mezclar gameId distintos en el Registro detallado", () => {
    const mixed: readonly DetailedLogEntry[] = [
      makeDetailedRoll(1),
      { ...makeDetailedRoll(2), gameId: OTHER_GAME },
    ];
    expect(() => detailedLog(GAME, mixed)).toThrow(InvalidLogEntryError);
  });

  it("acepta un Registro simple homogéneo de la misma Partida", () => {
    const entries = [makeSimple(1), makeSimple(2)];
    expect(simpleLog(GAME, entries)).toHaveLength(2);
  });
});

describe("orden y secuencia consecutiva (20.6, 20.7)", () => {
  it("acepta secuencias consecutivas empezando en 1", () => {
    const entries = [makeSimple(1), makeSimple(2), makeSimple(3)];
    expect(simpleLog(GAME, entries)).toHaveLength(3);
  });

  it("rechaza un hueco en la secuencia del Registro simple", () => {
    const entries = [makeSimple(1), makeSimple(3)];
    expect(() => simpleLog(GAME, entries)).toThrow(InvalidLogEntryError);
  });

  it("rechaza que el Registro detallado no empiece en 1", () => {
    const entries = [makeDetailedRoll(0)];
    expect(() => detailedLog(GAME, entries)).toThrow(InvalidLogEntryError);
  });
});

describe("appendSimpleEntry / appendDetailedEntry", () => {
  it("asigna la siguiente secuencia consecutiva al Registro simple (20.6)", () => {
    const first = appendSimpleEntry(GAME, [], {
      turn: 1,
      phase: "british-orders",
      actor: "a",
      action: "move",
      result: "ok",
      messageKey: "log.simple.move",
    });
    const second = appendSimpleEntry(GAME, first, {
      turn: 1,
      phase: "british-orders",
      actor: "a",
      action: "fire",
      result: "hit",
      messageKey: "log.simple.fire",
    });
    expect(second.map((entry) => entry.sequence)).toStrictEqual([1, 2]);
    expect(second[1]?.gameId).toBe(GAME);
  });

  it("no muta la lista recibida", () => {
    const original: readonly SimpleLogEntry[] = [makeSimple(1)];
    appendSimpleEntry(GAME, original, {
      turn: 1,
      phase: "p",
      actor: "a",
      action: "b",
      result: "c",
      messageKey: "k",
    });
    expect(original).toHaveLength(1);
  });

  it("asigna la siguiente secuencia consecutiva al Registro detallado (20.7)", () => {
    const first = appendDetailedEntry(GAME, [], {
      roll: COMBAT_BREAKDOWN,
      messageKey: "log.detailed.combat",
    });
    const second = appendDetailedEntry(GAME, first, {
      deterministic: { inputs: [], rules: ["r"], priorities: [], computations: [] },
      messageKey: "log.detailed.deterministic",
    });
    expect(second.map((entry) => entry.sequence)).toStrictEqual([1, 2]);
  });
});
