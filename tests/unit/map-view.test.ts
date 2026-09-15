import { describe, expect, it } from "vitest";
import {
  InvalidMapProjectionError,
  buildSemanticLayer,
  projectMapToSvg,
  renderSvgMarkup,
  viewState,
  zoomBy,
} from "../../src/ui/views/index.js";
import {
  buildHexGeometry,
  edgeFeatureId,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  pieceId,
  pieceState,
  terrainId,
  visualReview,
  directionId,
  type HexDefinition,
  type HexId,
  type MissionSourceRef,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId, missionId } from "../../src/domain/identity/index.js";

const missionRef: MissionSourceRef = {
  sourceVersion: "FON-ML-2022",
  page: 17,
  element: "Mapa Misión 01",
  missionRef: "FON-ML-2022-M01",
};

function buildMap() {
  const hexes: Record<HexId, HexDefinition> = {
    [hexId("a")]: hexDefinition({
      id: hexId("a"),
      coordinate: { label: "A1", q: 0, r: 0 },
      terrain: [terrainId("bosque")],
    }),
    [hexId("b")]: hexDefinition({
      id: hexId("b"),
      coordinate: { label: "B1", q: 1, r: 0 },
    }),
    [hexId("c")]: hexDefinition({
      id: hexId("c"),
      coordinate: { label: "C1", q: 1, r: 1 },
      terrain: [terrainId("edificio")],
    }),
  };
  const map = hexMapDefinition({
    missionId: missionId("FON-ML-2022-M01"),
    hexes,
    undirectedEdges: [
      hexEdge({ a: hexId("a"), b: hexId("b") }),
      hexEdge({ a: hexId("b"), b: hexId("c"), features: [edgeFeatureId("rio")] }),
    ],
    entryOptions: [{ id: catalogId("entry-a"), hexId: hexId("a"), label: "Entrada A" }],
    transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
  });
  return { map, geometry: buildHexGeometry(map) };
}

function britishPiece(): PieceState {
  return pieceState({
    id: pieceId("p-brit"),
    definitionId: catalogId("rifles"),
    side: "british",
    hexId: hexId("a"),
    orientation: directionId("N"),
    visibility: "revealed",
    status: "active",
  });
}

describe("projectMapToSvg", () => {
  it("proyecta un polígono de 6 vértices por Hexágono con su terreno", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [], {});
    expect(scene.hexes).toHaveLength(3);
    for (const hex of scene.hexes) {
      expect(hex.vertices).toHaveLength(6);
    }
    const a = scene.hexes.find((h) => String(h.hexId) === "a");
    expect(a?.classes).toContain("terrain-bosque");
    expect(a?.label).toBe("A1");
  });

  it("proyecta solo las aristas canónicas del Catálogo", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [], {});
    expect(scene.edges).toHaveLength(2);
    const rio = scene.edges.find((e) => e.features.includes("rio"));
    expect(rio).toBeDefined();
    expect(rio?.classes).toContain("feature-rio");
  });

  it("calcula un viewBox que engloba el contenido con margen", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [], {});
    expect(scene.viewBox.width).toBeGreaterThan(0);
    expect(scene.viewBox.height).toBeGreaterThan(0);
  });

  it("sitúa la Ficha sobre el centro de su Hexágono y marca su bando/estado", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [britishPiece()], {});
    expect(scene.pieces).toHaveLength(1);
    const marker = scene.pieces[0]!;
    const hexA = scene.hexes.find((h) => String(h.hexId) === "a")!;
    expect(marker.center).toEqual(hexA.center);
    expect(marker.classes).toEqual(
      expect.arrayContaining(["side-british", "status-active", "visibility-revealed", "orientation-N"]),
    );
  });

  it("marca la selección de Hexágono y Ficha (req. 24.6)", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [britishPiece()], {
      hexId: hexId("a"),
      pieceId: pieceId("p-brit"),
    });
    expect(scene.hexes.find((h) => String(h.hexId) === "a")?.selected).toBe(true);
    expect(scene.pieces[0]?.selected).toBe(true);
  });

  it("rechaza una Ficha sobre un Hexágono ausente del mapa", () => {
    const { map, geometry } = buildMap();
    const orphan = pieceState({
      id: pieceId("p-x"),
      definitionId: catalogId("rifles"),
      side: "german",
      hexId: hexId("zzz"),
    });
    expect(() => projectMapToSvg(map, geometry, [orphan], {})).toThrow(
      InvalidMapProjectionError,
    );
  });
});

describe("buildSemanticLayer", () => {
  it("crea un nodo por Hexágono y anida las Fichas como hijas", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [britishPiece()], {});
    const layer = buildSemanticLayer(scene);
    const hexNode = layer.find((n) => n.kind === "hex" && n.refId === "a")!;
    expect(hexNode.childRefIds).toEqual(["p-brit"]);
    expect(hexNode.accessibleName).toContain("Hexágono A1");
    const pieceNode = layer.find((n) => n.kind === "piece")!;
    expect(pieceNode.accessibleName).toContain("británica");
    expect(pieceNode.accessibleName).toContain("Hexágono A1");
  });

  it("un nodo por Hexágono y por Ficha situada", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [britishPiece()], {});
    const layer = buildSemanticLayer(scene);
    expect(layer.filter((n) => n.kind === "hex")).toHaveLength(3);
    expect(layer.filter((n) => n.kind === "piece")).toHaveLength(1);
  });
});

describe("renderSvgMarkup", () => {
  it("emite un SVG responsive con viewBox y aplica zoom/paneo del ViewState", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [britishPiece()], {});
    const view = zoomBy(
      viewState({ viewport: { width: 800, height: 600 } }),
      2,
    );
    const svg = renderSvgMarkup(scene, view);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="');
    expect(svg).toContain('width="100%"');
    expect(svg).toContain("scale(2)");
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<line");
    expect(svg).toContain("<circle");
  });

  it("es determinista para la misma escena y vista", () => {
    const { map, geometry } = buildMap();
    const scene = projectMapToSvg(map, geometry, [], {});
    const view = viewState({ viewport: { width: 800, height: 600 } });
    expect(renderSvgMarkup(scene, view)).toBe(renderSvgMarkup(scene, view));
  });

  it("renderiza anillo de cobertura e insignia de moral baja si la pieza los tiene", () => {
    const { map, geometry } = buildMap();
    const woundedCoveredPiece = pieceState({
      id: pieceId("p-brit"),
      definitionId: catalogId("rifles"),
      side: "british",
      hexId: hexId("a"),
      visibility: "revealed",
      status: "active",
      morale: "low",
      cover: 1,
    });
    const scene = projectMapToSvg(map, geometry, [woundedCoveredPiece], {});
    const view = viewState({ viewport: { width: 800, height: 600 } });
    const svg = renderSvgMarkup(scene, view);
    expect(svg).toContain('class="piece-cover-ring"');
    expect(svg).toContain('class="piece-morale-badge"');
    expect(svg).toContain('morale-low');
    expect(svg).toContain('has-cover');
  });
});

