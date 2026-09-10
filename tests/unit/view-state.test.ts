import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_LIMITS,
  InvalidViewStateError,
  clearSelection,
  panBy,
  panTo,
  resizeViewport,
  select,
  setOrientation,
  setReadingPosition,
  setZoom,
  switchLog,
  viewState,
  zoomBy,
  type ViewState,
} from "../../src/ui/views/index.js";
import { hexId, pieceId } from "../../src/domain/geometry/index.js";

function baseState(): ViewState {
  return viewState({
    viewport: { width: 1024, height: 768 },
    selection: { hexId: hexId("h1"), pieceId: pieceId("p1") },
    readingPositions: { simple: 5, detailed: 12 },
  });
}

describe("viewState constructor", () => {
  it("deriva la orientación del tamaño cuando no se indica", () => {
    expect(viewState({ viewport: { width: 800, height: 600 } }).orientation).toBe(
      "landscape",
    );
    expect(viewState({ viewport: { width: 600, height: 900 } }).orientation).toBe(
      "portrait",
    );
  });

  it("acota el zoom inicial a los límites", () => {
    const state = viewState({ viewport: { width: 10, height: 10 }, camera: { zoom: 100, panX: 0, panY: 0 } });
    expect(state.camera.zoom).toBe(DEFAULT_VIEW_LIMITS.maxZoom);
  });

  it("rechaza un viewport no positivo", () => {
    expect(() => viewState({ viewport: { width: 0, height: 10 } })).toThrow(
      InvalidViewStateError,
    );
  });
});

describe("operaciones de cámara conservan la selección (req. 24.6)", () => {
  it("setZoom/zoomBy no tocan selección ni registros", () => {
    const s = baseState();
    const zoomed = zoomBy(s, 2);
    expect(zoomed.camera.zoom).toBe(2);
    expect(zoomed.selection).toEqual(s.selection);
    expect(zoomed.readingPositions).toEqual(s.readingPositions);

    const abs = setZoom(s, 3);
    expect(abs.camera.zoom).toBe(3);
    expect(abs.selection).toEqual(s.selection);
  });

  it("panBy/panTo desplazan sin perder selección", () => {
    const s = baseState();
    const moved = panBy(s, 10, -5);
    expect(moved.camera.panX).toBe(10);
    expect(moved.camera.panY).toBe(-5);
    expect(moved.selection).toEqual(s.selection);

    const to = panTo(s, 100, 200);
    expect(to.camera).toMatchObject({ panX: 100, panY: 200 });
    expect(to.selection).toEqual(s.selection);
  });

  it("acota el zoom por debajo del mínimo", () => {
    const s = baseState();
    expect(setZoom(s, 0.001).camera.zoom).toBe(DEFAULT_VIEW_LIMITS.minZoom);
  });
});

describe("orientación y redimensionado conservan estado (req. 24.7, 24.8, 24.9)", () => {
  it("setOrientation conserva selección, cámara y registros", () => {
    const s = panBy(baseState(), 3, 4);
    const rotated = setOrientation(s, "portrait");
    expect(rotated.orientation).toBe("portrait");
    expect(rotated.selection).toEqual(s.selection);
    expect(rotated.camera).toEqual(s.camera);
    expect(rotated.readingPositions).toEqual(s.readingPositions);
  });

  it("setOrientation devuelve el mismo objeto si no cambia", () => {
    const s = baseState();
    expect(setOrientation(s, s.orientation)).toBe(s);
  });

  it("resizeViewport adapta sin tocar selección ni cámara", () => {
    const s = baseState();
    const resized = resizeViewport(s, { width: 500, height: 900 });
    expect(resized.viewport).toEqual({ width: 500, height: 900 });
    expect(resized.orientation).toBe("portrait");
    expect(resized.selection).toEqual(s.selection);
    expect(resized.camera).toEqual(s.camera);
  });
});

describe("registros y posición de lectura (req. 20.8)", () => {
  it("switchLog conserva la posición de lectura de ambos registros", () => {
    const s = baseState();
    const toDetailed = switchLog(s, "detailed");
    expect(toDetailed.activeLog).toBe("detailed");
    expect(toDetailed.readingPositions).toEqual(s.readingPositions);
    expect(toDetailed.selection).toEqual(s.selection);
  });

  it("setReadingPosition actualiza solo el registro indicado", () => {
    const s = baseState();
    const next = setReadingPosition(s, "simple", 42);
    expect(next.readingPositions.simple).toBe(42);
    expect(next.readingPositions.detailed).toBe(s.readingPositions.detailed);
  });

  it("recuerda la posición al alternar y volver", () => {
    let s = baseState();
    s = setReadingPosition(s, "simple", 7);
    s = switchLog(s, "detailed");
    s = setReadingPosition(s, "detailed", 30);
    s = switchLog(s, "simple");
    expect(s.readingPositions.simple).toBe(7);
    expect(s.readingPositions.detailed).toBe(30);
  });
});

describe("selección", () => {
  it("select es la única operación que cambia la selección", () => {
    const s = baseState();
    const changed = select(s, { hexId: hexId("h9") });
    expect(changed.selection).toEqual({ hexId: hexId("h9") });
    expect(changed.camera).toEqual(s.camera);

    const cleared = clearSelection(changed);
    expect(cleared.selection).toEqual({});
  });
});
