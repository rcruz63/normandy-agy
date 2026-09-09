import { describe, expect, it } from "vitest";
import {
  applyCoverOrder,
  canScout,
  declareAttackOrder,
  resolveAdvance,
  resolveScout,
  type ForwardArc,
} from "../../src/domain/rules/order-effects.js";
import {
  buildHexGeometry,
  directionId,
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

/**
 * Mapa lineal h1 — h2 — h3 — h4 con una rama h2 — h5.
 * Distancias desde h1: h2=1, h3=2, h5=2, h4=3.
 */
function linearGeometry(): HexGeometry {
  const map = hexMapDefinition({
    missionId: missionId("m01"),
    hexes: buildHexes("h1", "h2", "h3", "h4", "h5"),
    undirectedEdges: [
      hexEdge({ a: hexId("h1"), b: hexId("h2") }),
      hexEdge({ a: hexId("h2"), b: hexId("h3") }),
      hexEdge({ a: hexId("h3"), b: hexId("h4") }),
      hexEdge({ a: hexId("h2"), b: hexId("h5") }),
    ],
    transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
  });
  return buildHexGeometry(map);
}

// --- Fixtures de Fichas ---

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

function germanAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("german-rifle"),
    side: "german",
    hexId: hexId(hex),
    visibility: "revealed",
    status: "active",
  });
}

function hiddenUnknownAt(id: string, hex: string): PieceState {
  return pieceState({
    id: pieceId(id),
    definitionId: catalogId("unknown-marker"),
    side: "german",
    hexId: hexId(hex),
    visibility: "hidden",
    status: "active",
  });
}

/** Arco frontal que declara a h2 hacia delante desde h1 (Dirección canónica). */
function forwardArcToH2(): ForwardArc {
  return {
    forwardDirections: [directionId("N")],
    directionOf: { [hexId("h2")]: directionId("N") } as ForwardArc["directionOf"],
  };
}

// --- Avanzar (35.1, 35.2, 35.3, 35.4, 35.10) ---

describe("resolveAdvance — mover un Hexágono hacia delante", () => {
  it("mueve la Unidad exactamente un Hexágono en una Dirección hacia delante", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [],
    });
    expect(outcome.kind).toBe("advanced");
    if (outcome.kind !== "advanced") return;
    expect(outcome.destination).toBe("h2");
    expect(outcome.piece.hexId).toBe("h2");
  });

  it("elimina toda la Cobertura acumulada al avanzar", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1", 3),
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [],
    });
    expect(outcome.kind).toBe("advanced");
    if (outcome.kind !== "advanced") return;
    expect(outcome.piece.cover).toBe(0);
  });

  it("señala las Incógnitas adyacentes al destino para su Revelado", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [hiddenUnknownAt("u1", "h3"), hiddenUnknownAt("u2", "h5")],
    });
    expect(outcome.kind).toBe("advanced");
    if (outcome.kind !== "advanced") return;
    expect(outcome.revealTriggers).toEqual(["h3", "h5"]);
  });

  it("permite apilar sobre un Hexágono ocupado solo por Unidades británicas", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [britishAt("br2", "h2"), britishAt("br3", "h2")],
    });
    expect(outcome.kind).toBe("advanced");
  });

  it("conserva la posición si el destino contiene una Unidad alemana", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [germanAt("de1", "h2")],
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe(
      "rules.orders.advance.destinationOccupiedByGerman",
    );
  });

  it("rechaza un destino que no está en una Dirección hacia delante", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h2"),
      forwardArc: { forwardDirections: [], directionOf: {} },
      board: [],
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe(
      "rules.orders.advance.notForwardNeighbor",
    );
  });

  it("rechaza un destino no adyacente aunque esté declarado hacia delante", () => {
    const geometry = linearGeometry();
    const outcome = resolveAdvance(geometry, {
      mover: britishAt("br1", "h1"),
      destination: hexId("h3"),
      forwardArc: {
        forwardDirections: [directionId("N")],
        directionOf: {
          [hexId("h3")]: directionId("N"),
        } as ForwardArc["directionOf"],
      },
      board: [],
    });
    expect(outcome.kind).toBe("rejected");
  });

  it("rechaza cuando la Unidad que avanza no tiene Hexágono de origen", () => {
    const geometry = linearGeometry();
    const mover = pieceState({
      id: pieceId("br1"),
      definitionId: catalogId("british-rifle-squad"),
      side: "british",
      cover: 0,
    });
    const outcome = resolveAdvance(geometry, {
      mover,
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [],
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe("rules.orders.advance.missingOrigin");
  });

  it("no muta la Ficha recibida", () => {
    const geometry = linearGeometry();
    const mover = britishAt("br1", "h1", 2);
    resolveAdvance(geometry, {
      mover,
      destination: hexId("h2"),
      forwardArc: forwardArcToH2(),
      board: [],
    });
    expect(mover.hexId).toBe("h1");
    expect(mover.cover).toBe(2);
  });
});

// --- Explorar (35.13, 35.15) ---

describe("resolveScout — Explorar a distancia 2 solo Escuadras", () => {
  it("alcanza Incógnitas a distancia hexagonal 1 y 2 para una Escuadra de fusileros", () => {
    const geometry = linearGeometry();
    const outcome = resolveScout(geometry, {
      scout: britishAt("br1", "h1"),
      unitType: "rifle-squad",
      board: [
        hiddenUnknownAt("u1", "h2"),
        hiddenUnknownAt("u2", "h3"),
        hiddenUnknownAt("u3", "h4"),
      ],
    });
    expect(outcome.kind).toBe("scouted");
    if (outcome.kind !== "scouted") return;
    // h2 (dist 1) y h3 (dist 2) sí; h4 (dist 3) no.
    expect(outcome.reachableUnknowns).toEqual(["h2", "h3"]);
  });

  it("excluye del alcance las Incógnitas más allá de distancia 2", () => {
    const geometry = linearGeometry();
    const outcome = resolveScout(geometry, {
      scout: britishAt("br1", "h1"),
      unitType: "rifle-squad",
      board: [hiddenUnknownAt("u3", "h4")],
    });
    expect(outcome.kind).toBe("scouted");
    if (outcome.kind !== "scouted") return;
    expect(outcome.reachableUnknowns).toEqual([]);
  });

  it("rechaza Explorar para un Equipo MG sin cambiar estado", () => {
    const geometry = linearGeometry();
    const outcome = resolveScout(geometry, {
      scout: britishAt("mg1", "h1"),
      unitType: "mg-team",
      board: [hiddenUnknownAt("u1", "h2")],
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe(
      "rules.orders.scout.excludedUnitType",
    );
  });

  it("rechaza Explorar para un Mortero", () => {
    const geometry = linearGeometry();
    const outcome = resolveScout(geometry, {
      scout: britishAt("mo1", "h1"),
      unitType: "mortar",
      board: [],
    });
    expect(outcome.kind).toBe("rejected");
  });

  it("rechaza Explorar para un PIAT", () => {
    const geometry = linearGeometry();
    const outcome = resolveScout(geometry, {
      scout: britishAt("pi1", "h1"),
      unitType: "piat",
      board: [],
    });
    expect(outcome.kind).toBe("rejected");
  });

  it("canScout autoriza solo a la Escuadra de fusileros", () => {
    expect(canScout("rifle-squad")).toBe(true);
    expect(canScout("mg-team")).toBe(false);
    expect(canScout("mortar")).toBe(false);
    expect(canScout("piat")).toBe(false);
  });
});

// --- Cobertura (35.9) ---

describe("applyCoverOrder — acumular Cobertura", () => {
  it("añade +1 a la Cobertura de la Unidad", () => {
    const covered = applyCoverOrder(britishAt("br1", "h1", 0));
    expect(covered.cover).toBe(1);
  });

  it("acumula la Cobertura sobre un valor previo", () => {
    const covered = applyCoverOrder(britishAt("br1", "h1", 2));
    expect(covered.cover).toBe(3);
  });

  it("no muta la Ficha recibida", () => {
    const original = britishAt("br1", "h1", 1);
    applyCoverOrder(original);
    expect(original.cover).toBe(1);
  });
});

// --- Fuego y Granada (35.5, 35.7) ---

describe("declareAttackOrder — declarar Fuego o Granada", () => {
  it("declara un ataque de Fuego contra una Unidad alemana adyacente", () => {
    const geometry = linearGeometry();
    const outcome = declareAttackOrder(geometry, {
      order: "fire",
      attacker: britishAt("br1", "h1"),
      target: germanAt("de1", "h2"),
    });
    expect(outcome.kind).toBe("attack-declared");
    if (outcome.kind !== "attack-declared") return;
    expect(outcome.intent).toEqual({
      order: "fire",
      attackerId: "br1",
      targetId: "de1",
    });
  });

  it("declara un ataque de Granada contra una Unidad alemana adyacente", () => {
    const geometry = linearGeometry();
    const outcome = declareAttackOrder(geometry, {
      order: "grenade",
      attacker: britishAt("br1", "h1"),
      target: germanAt("de1", "h2"),
    });
    expect(outcome.kind).toBe("attack-declared");
    if (outcome.kind !== "attack-declared") return;
    expect(outcome.intent.order).toBe("grenade");
  });

  it("rechaza un objetivo alemán no adyacente", () => {
    const geometry = linearGeometry();
    const outcome = declareAttackOrder(geometry, {
      order: "fire",
      attacker: britishAt("br1", "h1"),
      target: germanAt("de1", "h3"),
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe("rules.orders.attack.invalidTarget");
  });

  it("rechaza un objetivo que no es una Unidad alemana", () => {
    const geometry = linearGeometry();
    const outcome = declareAttackOrder(geometry, {
      order: "fire",
      attacker: britishAt("br1", "h1"),
      target: britishAt("br2", "h2"),
    });
    expect(outcome.kind).toBe("rejected");
  });

  it("rechaza cuando el atacante no tiene Hexágono", () => {
    const geometry = linearGeometry();
    const attacker = pieceState({
      id: pieceId("br1"),
      definitionId: catalogId("british-rifle-squad"),
      side: "british",
      cover: 0,
    });
    const outcome = declareAttackOrder(geometry, {
      order: "fire",
      attacker,
      target: germanAt("de1", "h2"),
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") return;
    expect(outcome.reason.messageKey).toBe("rules.orders.attack.missingHex");
  });
});
