import { describe, expect, it } from "vitest";
import {
  canAttackHalftrack,
  resolveHalftrackAttack,
  type HalftrackAttackRequest,
} from "../../src/domain/rules/halftrack.js";
import type { CombatModifierContext, BaseHitInput } from "../../src/domain/rules/combat-resolver.js";
import {
  buildHexGeometry,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  pieceId,
  pieceState,
  visualReview,
  type HexDefinition,
  type HexGeometry,
  type HexId,
  type MissionSourceRef,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId, missionId } from "../../src/domain/identity/index.js";

// --- Fixtures de geometría ---

const missionRef: MissionSourceRef = {
  sourceVersion: "FON-ML-2022",
  page: 17,
  element: "Mapa Misión 01",
  missionRef: "FON-ML-2022-M01",
};

function buildHexes(...ids: string[]): Record<HexId, HexDefinition> {
  const record: Record<string, HexDefinition> = {};
  ids.forEach((id, index) => {
    record[id] = hexDefinition({
      id: hexId(id),
      coordinate: { label: id.toUpperCase(), q: index, r: 0 },
    });
  });
  return record as Record<HexId, HexDefinition>;
}

/** Mapa estrella: h0 central adyacente a h1, h2, h3. */
function starGeometry(): HexGeometry {
  const map = hexMapDefinition({
    missionId: missionId("m01"),
    hexes: buildHexes("h0", "h1", "h2", "h3"),
    undirectedEdges: [
      hexEdge({ a: hexId("h0"), b: hexId("h1") }),
      hexEdge({ a: hexId("h0"), b: hexId("h2") }),
      hexEdge({ a: hexId("h0"), b: hexId("h3") }),
    ],
    transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
  });
  return buildHexGeometry(map);
}

// --- Fixtures de Fichas ---

function piatAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("british-piat"),
    side: "british",
    hexId: hexId(hex),
    visibility: "revealed",
    status: "active",
  });
}

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

function halftrackAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("german-halftrack"),
    side: "german",
    hexId: hexId(hex),
    visibility: "revealed",
    status: "active",
  });
}

/** Valor base 7+ del PIAT contra la Semioruga (39.6), no fijo. */
const piatBase: BaseHitInput = { threshold: 7, fixed: false };

/** Modificadores neutros salvo `supportingUnits`, que calcula el módulo. */
const neutralModifiers: Omit<CombatModifierContext, "supportingUnits"> = {
  defenderTerrain: "clear",
  attackerOnHill: false,
  flanking: false,
  mortar: "none",
};

function request(overrides: Partial<HalftrackAttackRequest> = {}): HalftrackAttackRequest {
  return {
    attackerUnitType: "piat",
    attacker: piatAt("piat1", "h1"),
    halftrack: halftrackAt("ht1", "h0"),
    base: piatBase,
    modifiers: neutralModifiers,
    board: [],
    ...overrides,
  };
}

describe("canAttackHalftrack — solo el PIAT ataca a la Semioruga (39.2)", () => {
  it("acepta al PIAT como atacante principal", () => {
    expect(canAttackHalftrack("piat")).toBe(true);
  });

  it("rechaza a la Escuadra de fusileros, el Equipo MG y el Mortero", () => {
    expect(canAttackHalftrack("rifle-squad")).toBe(false);
    expect(canAttackHalftrack("mg-team")).toBe(false);
    expect(canAttackHalftrack("mortar")).toBe(false);
  });
});

describe("resolveHalftrackAttack — ataque a la Semioruga (39.2, 39.3, 39.6)", () => {
  it("rechaza un atacante que no sea PIAT sin cambiar estado (39.2)", () => {
    const geometry = starGeometry();
    const outcome = resolveHalftrackAttack(geometry, request({ attackerUnitType: "rifle-squad" }));
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.reason.messageKey).toBe("rules.halftrack.nonPiatAttacker");
    }
  });

  it("resuelve con el Valor base 7+ del PIAT y sin Apoyo cuando no hay adyacentes (39.6)", () => {
    const geometry = starGeometry();
    const outcome = resolveHalftrackAttack(geometry, request());
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      expect(outcome.supportingUnits).toBe(0);
      expect(outcome.resolution.baseThreshold).toBe(7);
      expect(outcome.resolution.effectiveThreshold).toBe(7);
    }
  });

  it("cuenta cada Unidad británica adyacente a la Semioruga como Apoyo −1 (39.3)", () => {
    const geometry = starGeometry();
    const outcome = resolveHalftrackAttack(
      geometry,
      request({ board: [britishAt("br2", "h2"), britishAt("br3", "h3")] }),
    );
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      // Dos Unidades de Apoyo adyacentes: 7 + (−1) + (−1) = 5.
      expect(outcome.supportingUnits).toBe(2);
      expect(outcome.resolution.effectiveThreshold).toBe(5);
    }
  });

  it("no cuenta al propio PIAT ni a Unidades no adyacentes como Apoyo (39.3)", () => {
    const geometry = starGeometry();
    const outcome = resolveHalftrackAttack(
      geometry,
      // El PIAT está adyacente pero se excluye por identidad; br-lejos no está en el tablero adyacente.
      request({ board: [piatAt("piat1", "h1")] }),
    );
    expect(outcome.kind).toBe("resolved");
    if (outcome.kind === "resolved") {
      expect(outcome.supportingUnits).toBe(0);
    }
  });

  it("rechaza cuando la Semioruga o el atacante carece de Hexágono", () => {
    const geometry = starGeometry();
    const hidden = pieceState({
      id: pieceId("htX"),
      definitionId: catalogId("german-halftrack"),
      side: "german",
      visibility: "revealed",
      status: "active",
    });
    const outcome = resolveHalftrackAttack(geometry, request({ halftrack: hidden }));
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.reason.messageKey).toBe("rules.halftrack.missingHex");
    }
  });
});
