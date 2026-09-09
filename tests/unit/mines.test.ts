import { describe, expect, it } from "vitest";
import {
  britishUnitsOnMines,
  evaluateMineHexAction,
  mineRevealTriggersImmediateTest,
  resolveMineTest,
} from "../../src/domain/rules/mines.js";
import type { BaseHitInput } from "../../src/domain/rules/combat-resolver.js";
import {
  hexId,
  pieceId,
  pieceState,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId } from "../../src/domain/identity/index.js";

function britishAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("british-rifle-squad"),
    side: "british",
    hexId: hexId(hex),
    visibility: "revealed",
    status: "active",
  });
}

/** Valor de prueba de Mina 7+ FIJO (16.1). */
const mineBase: BaseHitInput = { threshold: 7, fixed: true };

describe("mineRevealTriggersImmediateTest — disparo por revelación (39.7, 39.9)", () => {
  it("dispara prueba inmediata por adyacencia desde la Misión 7", () => {
    expect(mineRevealTriggersImmediateTest("adjacency", 7)).toBe(true);
    expect(mineRevealTriggersImmediateTest("adjacency", 12)).toBe(true);
  });

  it("no dispara prueba por adyacencia por debajo de la Misión 7", () => {
    expect(mineRevealTriggersImmediateTest("adjacency", 6)).toBe(false);
    expect(mineRevealTriggersImmediateTest("adjacency", 1)).toBe(false);
  });

  it("no dispara prueba inmediata cuando la Mina se revela mediante Explorar (39.9)", () => {
    expect(mineRevealTriggersImmediateTest("scout", 7)).toBe(false);
    expect(mineRevealTriggersImmediateTest("scout", 15)).toBe(false);
  });
});

describe("resolveMineTest — prueba fija 7+ sin modificadores (16.1, 39.8)", () => {
  it("resuelve un Valor para impactar fijo 7+ que excluye todo modificador", () => {
    const outcome = resolveMineTest(mineBase);
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      expect(outcome.resolution.fixed).toBe(true);
      expect(outcome.resolution.baseThreshold).toBe(7);
      expect(outcome.resolution.effectiveThreshold).toBe(7);
      expect(outcome.resolution.operands).toHaveLength(0);
    }
  });
});

describe("britishUnitsOnMines — Unidades a comprobar en fase alemana (39.10)", () => {
  it("selecciona cada Unidad británica situada en un Hexágono con Mina", () => {
    const onMine = britishAt("br1", "h1");
    const offMine = britishAt("br2", "h9");
    const units = britishUnitsOnMines([onMine, offMine], [hexId("h1")]);
    expect(units.map((piece) => piece.id)).toEqual([pieceId("br1")]);
  });

  it("no incluye Unidades eliminadas ni fuera de Hexágonos con Mina", () => {
    const eliminated = pieceState({
      id: pieceId("br3"),
      definitionId: catalogId("british-rifle-squad"),
      side: "british",
      hexId: hexId("h1"),
      visibility: "revealed",
      status: "eliminated",
    });
    const units = britishUnitsOnMines([eliminated, britishAt("br2", "h2")], [hexId("h1")]);
    expect(units).toHaveLength(0);
  });
});

describe("evaluateMineHexAction — persistencia de la Mina (39.11, 39.12)", () => {
  it("permite avanzar a un Hexágono con Mina (39.11)", () => {
    expect(evaluateMineHexAction("advance")).toEqual({ kind: "allowed" });
  });

  it("excluye retirar una Mina colocada porque es persistente (39.12)", () => {
    const outcome = evaluateMineHexAction("remove-mine");
    expect(outcome.kind).toBe("excluded");
    if (outcome.kind === "excluded") {
      expect(outcome.reason.messageKey).toBe("rules.mine.removalExcluded");
    }
  });
});
