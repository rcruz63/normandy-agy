import { describe, expect, it } from "vitest";
import {
  artilleryAllowsFlanking,
  eliminateArtillery,
  isArtilleryTargetEligible,
  resolveArtilleryAttack,
  selectArtilleryTargets,
  type ArtilleryCandidate,
} from "../../src/domain/rules/artillery.js";
import type { BaseHitInput } from "../../src/domain/rules/combat-resolver.js";
import {
  hexId,
  pieceId,
  pieceState,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId } from "../../src/domain/identity/index.js";

function britishAt(id: string, hex: string, cover = 0): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("british-rifle-squad"),
    side: "british",
    hexId: hexId(hex),
    cover,
    visibility: "revealed",
    status: "active",
  });
}

function artilleryAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("german-artillery"),
    side: "german",
    hexId: hexId(hex),
    visibility: "revealed",
    status: "active",
  });
}

/** Valor de Artillería 10+ FIJO (16.2, 39.17). */
const artilleryBase: BaseHitInput = { threshold: 10, fixed: true };

describe("artilleryAllowsFlanking — Flanqueo excluido contra la Artillería (39.14)", () => {
  it("nunca permite el Flanqueo contra la Artillería", () => {
    expect(artilleryAllowsFlanking()).toBe(false);
  });
});

describe("isArtilleryTargetEligible — exclusiones de objetivo (39.15, 39.16)", () => {
  it("es elegible una Unidad británica en terreno despejado sin Cobertura", () => {
    expect(isArtilleryTargetEligible({ piece: britishAt("br1", "h1"), terrain: "clear" })).toBe(true);
  });

  it("excluye a la Unidad británica en bosque o en edificio (39.16)", () => {
    expect(isArtilleryTargetEligible({ piece: britishAt("br1", "h1"), terrain: "forest" })).toBe(false);
    expect(isArtilleryTargetEligible({ piece: britishAt("br1", "h1"), terrain: "building" })).toBe(false);
  });

  it("excluye a la Unidad británica con Cobertura acumulada (39.16)", () => {
    expect(isArtilleryTargetEligible({ piece: britishAt("br1", "h1", 1), terrain: "clear" })).toBe(false);
  });
});

describe("selectArtilleryTargets — un objetivo por Unidad elegible (39.15)", () => {
  it("selecciona solo las Unidades no excluidas por bosque, edificio o Cobertura", () => {
    const candidates: readonly ArtilleryCandidate[] = [
      { piece: britishAt("br1", "h1"), terrain: "clear" },
      { piece: britishAt("br2", "h2"), terrain: "forest" },
      { piece: britishAt("br3", "h3", 2), terrain: "clear" },
      { piece: britishAt("br4", "h4"), terrain: "building" },
      { piece: britishAt("br5", "h5"), terrain: "clear" },
    ];
    const targets = selectArtilleryTargets(candidates);
    expect(targets.map((piece) => piece.id)).toEqual([pieceId("br1"), pieceId("br5")]);
  });
});

describe("resolveArtilleryAttack — Valor fijo 10+ sin Flanqueo (16.2, 39.17)", () => {
  it("resuelve un Valor para impactar fijo 10+ sin modificadores", () => {
    const outcome = resolveArtilleryAttack(artilleryBase);
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      expect(outcome.resolution.fixed).toBe(true);
      expect(outcome.resolution.baseThreshold).toBe(10);
      expect(outcome.resolution.effectiveThreshold).toBe(10);
      expect(outcome.resolution.operands).toHaveLength(0);
    }
  });
});

describe("eliminateArtillery — Artillería eliminable (39.18)", () => {
  it("elimina la Artillería sin mutar la Ficha recibida", () => {
    const artillery = artilleryAt("art1", "h1");
    const eliminated = eliminateArtillery(artillery);
    expect(eliminated.status).toBe("eliminated");
    expect(artillery.status).toBe("active");
  });
});
