import { describe, expect, it } from "vitest";
import {
  UnknownHexError,
  buildHexGeometry,
  directionId,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  visualReview,
  type DirectionId,
  type HexDefinition,
  type HexId,
  type MissionSourceRef,
} from "../../src/domain/geometry/index.js";
import { missionId } from "../../src/domain/identity/index.js";

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
 * Grafo canónico:
 *   h1—h2, h2—h3, h3—h4, h2—h5.
 */
function linearMap() {
  return hexMapDefinition({
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
}

describe("HexGeometry — adyacencia simétrica proyectada del grafo canónico", () => {
  it("proyecta vecinos en ambos sentidos desde una arista almacenada una vez", () => {
    const geo = buildHexGeometry(linearMap());
    expect(geo.areAdjacent(hexId("h1"), hexId("h2"))).toBe(true);
    expect(geo.areAdjacent(hexId("h2"), hexId("h1"))).toBe(true);
    expect(geo.neighbors(hexId("h2"))).toEqual(["h1", "h3", "h5"]);
    expect(geo.neighbors(hexId("h1"))).toEqual(["h2"]);
  });

  it("no deduce adyacencia por proximidad de coordenadas fuera del catálogo", () => {
    // h1 y h3 no comparten arista aunque sus coordenadas sean cercanas.
    const geo = buildHexGeometry(linearMap());
    expect(geo.areAdjacent(hexId("h1"), hexId("h3"))).toBe(false);
    expect(geo.neighbors(hexId("h4"))).toEqual(["h3"]);
  });

  it("un Hexágono aislado no tiene vecinos", () => {
    const map = hexMapDefinition({
      missionId: missionId("m01"),
      hexes: buildHexes("h1", "h2", "solo"),
      undirectedEdges: [hexEdge({ a: hexId("h1"), b: hexId("h2") })],
      transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
    });
    const geo = buildHexGeometry(map);
    expect(geo.neighbors(hexId("solo"))).toEqual([]);
    expect(geo.areAdjacent(hexId("solo"), hexId("h1"))).toBe(false);
  });

  it("lanza UnknownHexError al consultar un Hexágono ajeno al Mapa", () => {
    const geo = buildHexGeometry(linearMap());
    expect(() => geo.neighbors(hexId("hX"))).toThrow(UnknownHexError);
    expect(() => geo.distance(hexId("h1"), hexId("hX"))).toThrow(UnknownHexError);
    expect(geo.has(hexId("hX"))).toBe(false);
    expect(geo.has(hexId("h1"))).toBe(true);
  });
});

describe("HexGeometry — distancia y ruta solo sobre el grafo canónico", () => {
  it("calcula la longitud de la ruta más corta en aristas", () => {
    const geo = buildHexGeometry(linearMap());
    expect(geo.distance(hexId("h1"), hexId("h1"))).toBe(0);
    expect(geo.distance(hexId("h1"), hexId("h2"))).toBe(1);
    expect(geo.distance(hexId("h1"), hexId("h4"))).toBe(3);
    expect(geo.distance(hexId("h1"), hexId("h5"))).toBe(2);
  });

  it("devuelve una ruta más corta como secuencia contigua de vecinos", () => {
    const geo = buildHexGeometry(linearMap());
    const route = geo.path(hexId("h1"), hexId("h4"));
    expect(route).toEqual(["h1", "h2", "h3", "h4"]);
    // Cada paso consecutivo es adyacente en el grafo canónico.
    for (let i = 0; i + 1 < (route?.length ?? 0); i += 1) {
      expect(geo.areAdjacent(route![i]!, route![i + 1]!)).toBe(true);
    }
  });

  it("una ruta imposible devuelve Infinity/undefined sin alterar nada", () => {
    const map = hexMapDefinition({
      missionId: missionId("m01"),
      hexes: buildHexes("h1", "h2", "island"),
      undirectedEdges: [hexEdge({ a: hexId("h1"), b: hexId("h2") })],
      transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
    });
    const geo = buildHexGeometry(map);
    expect(geo.distance(hexId("h1"), hexId("island"))).toBe(Number.POSITIVE_INFINITY);
    expect(geo.path(hexId("h1"), hexId("island"))).toBeUndefined();
  });

  it("la ruta a uno mismo es el propio Hexágono", () => {
    const geo = buildHexGeometry(linearMap());
    expect(geo.path(hexId("h3"), hexId("h3"))).toEqual(["h3"]);
  });
});

describe("HexGeometry — Zona de fuego sobre el grafo canónico", () => {
  it("incluye los Hexágonos alcanzables hasta el alcance dado", () => {
    const geo = buildHexGeometry(linearMap());
    expect(geo.fireZone(hexId("h1"), { range: 1 })).toEqual(["h2"]);
    expect(geo.fireZone(hexId("h1"), { range: 2 }).slice().sort()).toEqual(["h2", "h3", "h5"]);
    expect(geo.fireZone(hexId("h2"), { range: 1 })).toEqual(["h1", "h3", "h5"]);
  });

  it("alcance 0 no cubre ningún Hexágono", () => {
    const geo = buildHexGeometry(linearMap());
    expect(geo.fireZone(hexId("h2"), { range: 0 })).toEqual([]);
  });

  it("rechaza alcances no enteros o negativos", () => {
    const geo = buildHexGeometry(linearMap());
    expect(() => geo.fireZone(hexId("h1"), { range: -1 })).toThrow(RangeError);
    expect(() => geo.fireZone(hexId("h1"), { range: 1.5 })).toThrow(RangeError);
  });

  it("restringe el primer salto a las Direcciones hacia delante de la Orientación", () => {
    const geo = buildHexGeometry(linearMap());
    const ne: DirectionId = directionId("NE");
    const so: DirectionId = directionId("SO");
    // Desde h2: h3 en dirección NE (delante), h1/h5 en SO (detrás).
    const arc = {
      forwardDirections: [ne],
      directionOf: {
        [hexId("h3")]: ne,
        [hexId("h1")]: so,
        [hexId("h5")]: so,
      } as Record<HexId, DirectionId>,
    };
    // Solo h3 y su continuación h4 quedan en la Zona de fuego frontal.
    expect(geo.fireZone(hexId("h2"), { range: 2, arc })).toEqual(["h3", "h4"]);
  });

  it("recalcula la Zona de fuego al cambiar la Orientación (derivado no almacenado)", () => {
    const geo = buildHexGeometry(linearMap());
    const ne: DirectionId = directionId("NE");
    const so: DirectionId = directionId("SO");
    const directionOf = {
      [hexId("h3")]: ne,
      [hexId("h1")]: so,
      [hexId("h5")]: so,
    } as Record<HexId, DirectionId>;

    const facingNE = geo.fireZone(hexId("h2"), { range: 1, arc: { forwardDirections: [ne], directionOf } });
    const facingSO = geo.fireZone(hexId("h2"), { range: 1, arc: { forwardDirections: [so], directionOf } });

    expect(facingNE).toEqual(["h3"]);
    expect(facingSO.slice().sort()).toEqual(["h1", "h5"]);
    // Misma posición, distinta Orientación => derivados distintos.
    expect(facingNE).not.toEqual(facingSO);
  });
});
