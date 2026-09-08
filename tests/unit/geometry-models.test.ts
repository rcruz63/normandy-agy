import { describe, expect, it } from "vitest";
import {
  InvalidGeometryModelError,
  canonicalEdgeKey,
  directionId,
  edgeFeatureId,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  isMapPublishable,
  pieceId,
  pieceState,
  terrainId,
  visualReview,
  type HexDefinition,
  type HexId,
  type MissionSourceRef,
} from "../../src/domain/geometry/index.js";
import { catalogId, missionId } from "../../src/domain/identity/index.js";

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

describe("HexDefinition", () => {
  it("construye un Hexágono inmutable con terreno y elementos por defecto vacíos", () => {
    const hex = hexDefinition({ id: hexId("h1"), coordinate: { label: "H1", q: 1, r: 2 } });
    expect(hex.id).toBe("h1");
    expect(hex.coordinate).toEqual({ label: "H1", q: 1, r: 2 });
    expect(hex.terrain).toEqual([]);
    expect(hex.printedElements).toEqual([]);
    expect(Object.isFrozen(hex)).toBe(true);
    expect(Object.isFrozen(hex.terrain)).toBe(true);
  });

  it("conserva terrenos y elementos impresos aportados", () => {
    const hex = hexDefinition({
      id: hexId("h2"),
      coordinate: { label: "H2", q: 0, r: 0 },
      terrain: [terrainId("bosque"), terrainId("colina")],
      printedElements: [catalogId("FON-ML-2022-elem-1")],
    });
    expect(hex.terrain).toHaveLength(2);
    expect(hex.printedElements).toEqual(["FON-ML-2022-elem-1"]);
  });

  it("rechaza etiquetas vacías y coordenadas no finitas", () => {
    expect(() => hexDefinition({ id: hexId("h3"), coordinate: { label: "", q: 0, r: 0 } })).toThrow(
      InvalidGeometryModelError,
    );
    expect(() =>
      hexDefinition({ id: hexId("h3"), coordinate: { label: "H3", q: Number.NaN, r: 0 } }),
    ).toThrow(InvalidGeometryModelError);
  });
});

describe("HexEdge", () => {
  it("almacena una arista no dirigida con características", () => {
    const edge = hexEdge({ a: hexId("h1"), b: hexId("h2"), features: [edgeFeatureId("rio")] });
    expect(edge.a).toBe("h1");
    expect(edge.b).toBe("h2");
    expect(edge.features).toEqual(["rio"]);
    expect(Object.isFrozen(edge)).toBe(true);
  });

  it("rechaza bucles sobre el mismo Hexágono", () => {
    expect(() => hexEdge({ a: hexId("h1"), b: hexId("h1") })).toThrow(InvalidGeometryModelError);
  });

  it("genera la misma clave canónica sin importar el orden de extremos", () => {
    expect(canonicalEdgeKey(hexId("h1"), hexId("h2"))).toBe(
      canonicalEdgeKey(hexId("h2"), hexId("h1")),
    );
  });
});

describe("HexMapDefinition — aristas almacenadas una sola vez", () => {
  it("acepta un mapa con aristas canónicas únicas", () => {
    const map = hexMapDefinition({
      missionId: missionId("m01"),
      hexes: buildHexes("h1", "h2", "h3"),
      undirectedEdges: [
        hexEdge({ a: hexId("h1"), b: hexId("h2") }),
        hexEdge({ a: hexId("h2"), b: hexId("h3") }),
      ],
      transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
    });
    expect(map.undirectedEdges).toHaveLength(2);
    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map.undirectedEdges)).toBe(true);
  });

  it("rechaza la arista recíproca duplicada {a,b} y {b,a}", () => {
    expect(() =>
      hexMapDefinition({
        missionId: missionId("m01"),
        hexes: buildHexes("h1", "h2"),
        undirectedEdges: [
          hexEdge({ a: hexId("h1"), b: hexId("h2") }),
          hexEdge({ a: hexId("h2"), b: hexId("h1") }),
        ],
        transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
      }),
    ).toThrow(/una sola vez/);
  });

  it("rechaza la misma arista repetida", () => {
    expect(() =>
      hexMapDefinition({
        missionId: missionId("m01"),
        hexes: buildHexes("h1", "h2"),
        undirectedEdges: [
          hexEdge({ a: hexId("h1"), b: hexId("h2") }),
          hexEdge({ a: hexId("h1"), b: hexId("h2") }),
        ],
        transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
      }),
    ).toThrow(InvalidGeometryModelError);
  });

  it("rechaza aristas hacia Hexágonos inexistentes", () => {
    expect(() =>
      hexMapDefinition({
        missionId: missionId("m01"),
        hexes: buildHexes("h1"),
        undirectedEdges: [hexEdge({ a: hexId("h1"), b: hexId("hX") })],
        transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
      }),
    ).toThrow(/inexistente/);
  });

  it("ordena las aristas de forma determinista por clave canónica", () => {
    const map = hexMapDefinition({
      missionId: missionId("m01"),
      hexes: buildHexes("h1", "h2", "h3"),
      undirectedEdges: [
        hexEdge({ a: hexId("h2"), b: hexId("h3") }),
        hexEdge({ a: hexId("h1"), b: hexId("h2") }),
      ],
      transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
    });
    const keys = map.undirectedEdges.map((e) => canonicalEdgeKey(e.a, e.b));
    expect(keys).toEqual([...keys].sort((x, y) => x.localeCompare(y)));
  });

  it("conserva dos opciones de entrada distintas (req. 40.3)", () => {
    const map = hexMapDefinition({
      missionId: missionId("m01"),
      hexes: buildHexes("h1", "h2"),
      undirectedEdges: [],
      entryOptions: [
        { id: catalogId("entrada-a"), hexId: hexId("h1"), label: "Entrada A" },
        { id: catalogId("entrada-b"), hexId: hexId("h2"), label: "Entrada B" },
      ],
      transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
    });
    expect(map.entryOptions).toHaveLength(2);
  });

  it("rechaza opciones de entrada hacia Hexágonos inexistentes", () => {
    expect(() =>
      hexMapDefinition({
        missionId: missionId("m01"),
        hexes: buildHexes("h1"),
        undirectedEdges: [],
        entryOptions: [{ id: catalogId("entrada-x"), hexId: hexId("hX"), label: "X" }],
        transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
      }),
    ).toThrow(/inexistente/);
  });
});

describe("VisualReview y publicabilidad (req. 40.4, 40.6, 40.13)", () => {
  it("mantiene no publicable un mapa con DP-001 pendiente", () => {
    const review = visualReview({ dp001Status: "pending", missionRef });
    expect(isMapPublishable(review)).toBe(false);
  });

  it("mantiene no publicable un mapa resuelto pero sin aprobar", () => {
    const review = visualReview({ dp001Status: "resolved", missionRef });
    expect(isMapPublishable(review)).toBe(false);
  });

  it("publica solo tras DP-001 resuelto y segunda revisión aprobada con trazabilidad", () => {
    const review = visualReview({
      dp001Status: "resolved",
      missionRef,
      reviewerId: "rcruz63",
      reviewedAt: "2024-01-01T00:00:00.000Z",
      result: "approved",
    });
    expect(isMapPublishable(review)).toBe(true);
    expect(review.reviewerId).toBe("rcruz63");
  });

  it("rechaza aprobar con DP-001 pendiente o sin revisor/fecha", () => {
    expect(() =>
      visualReview({ dp001Status: "pending", missionRef, result: "approved" }),
    ).toThrow(InvalidGeometryModelError);
    expect(() =>
      visualReview({ dp001Status: "resolved", missionRef, result: "approved" }),
    ).toThrow(/revisor/);
  });
});

describe("PieceState", () => {
  it("construye una Ficha con valores por defecto seguros", () => {
    const piece = pieceState({
      id: pieceId("p1"),
      definitionId: catalogId("FON-ML-2022-fusilero"),
      side: "british",
    });
    expect(piece.cover).toBe(0);
    expect(piece.visibility).toBe("hidden");
    expect(piece.status).toBe("active");
    expect(piece.hexId).toBeUndefined();
    expect(Object.isFrozen(piece)).toBe(true);
  });

  it("conserva Hexágono, Orientación, Moral y Cobertura", () => {
    const piece = pieceState({
      id: pieceId("p2"),
      definitionId: catalogId("FON-ML-2022-lmg"),
      side: "german",
      hexId: hexId("h5"),
      orientation: directionId("NE"),
      morale: "low",
      cover: 2,
      visibility: "revealed",
      status: "active",
    });
    expect(piece.hexId).toBe("h5");
    expect(piece.orientation).toBe("NE");
    expect(piece.morale).toBe("low");
    expect(piece.cover).toBe(2);
    expect(piece.visibility).toBe("revealed");
  });

  it("rechaza bando inválido y Cobertura negativa", () => {
    expect(() =>
      pieceState({
        id: pieceId("p3"),
        definitionId: catalogId("x"),
        // @ts-expect-error bando inválido en tiempo de compilación
        side: "soviet",
      }),
    ).toThrow(InvalidGeometryModelError);
    expect(() =>
      pieceState({
        id: pieceId("p4"),
        definitionId: catalogId("x"),
        side: "neutral",
        cover: -1,
      }),
    ).toThrow(/Cobertura/);
  });
});
