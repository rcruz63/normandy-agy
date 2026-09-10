import { describe, expect, it } from "vitest";
import {
  collapseDetailedEntry,
  createLogViewState,
  expandDetailedEntry,
  isDetailedEntryExpanded,
  setReadingPosition,
  switchLogTab,
  toggleDetailedEntry,
} from "../../src/ui/views/log-view.js";

describe("LogViewState: alternar registros conservando la lectura (20.8)", () => {
  it("arranca en el Registro simple con ambos registros al inicio", () => {
    const state = createLogViewState();
    expect(state.activeTab).toBe("simple");
    expect(state.readingPosition.simple).toBe(0);
    expect(state.readingPosition.detailed).toBe(0);
    expect(state.expandedDetailedSequences).toHaveLength(0);
  });

  it("conserva la posición de lectura de cada registro al alternar (20.8)", () => {
    let state = createLogViewState("simple");
    state = setReadingPosition(state, 42); // posición en el simple
    state = switchLogTab(state, "detailed");
    state = setReadingPosition(state, 7); // posición en el detallado
    // Al volver al simple, se restaura su posición exacta.
    state = switchLogTab(state, "simple");
    expect(state.readingPosition.simple).toBe(42);
    expect(state.readingPosition.detailed).toBe(7);
    expect(state.activeTab).toBe("simple");
  });

  it("cambiar a la pestaña ya activa devuelve el mismo estado", () => {
    const state = createLogViewState("simple");
    expect(switchLogTab(state, "simple")).toBe(state);
  });

  it("no aplica una posición de lectura inválida", () => {
    const state = setReadingPosition(createLogViewState(), -1);
    expect(state.readingPosition.simple).toBe(0);
  });

  it("no muta el estado recibido y devuelve estados congelados", () => {
    const state = createLogViewState();
    const next = setReadingPosition(state, 5);
    expect(next).not.toBe(state);
    expect(state.readingPosition.simple).toBe(0);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe("LogViewState: expandir y contraer entradas detalladas (20.9)", () => {
  it("expande una entrada sin eliminar contenido", () => {
    const state = expandDetailedEntry(createLogViewState("detailed"), 3);
    expect(isDetailedEntryExpanded(state, 3)).toBe(true);
  });

  it("mantiene las secuencias expandidas ordenadas", () => {
    let state = createLogViewState("detailed");
    state = expandDetailedEntry(state, 5);
    state = expandDetailedEntry(state, 2);
    expect(state.expandedDetailedSequences).toStrictEqual([2, 5]);
  });

  it("contrae una entrada previamente expandida", () => {
    let state = expandDetailedEntry(createLogViewState("detailed"), 4);
    state = collapseDetailedEntry(state, 4);
    expect(isDetailedEntryExpanded(state, 4)).toBe(false);
  });

  it("alterna expandir/contraer", () => {
    let state = createLogViewState("detailed");
    state = toggleDetailedEntry(state, 1);
    expect(isDetailedEntryExpanded(state, 1)).toBe(true);
    state = toggleDetailedEntry(state, 1);
    expect(isDetailedEntryExpanded(state, 1)).toBe(false);
  });

  it("conserva la expansión al alternar de registro (20.8, 20.9)", () => {
    let state = expandDetailedEntry(createLogViewState("detailed"), 9);
    state = switchLogTab(state, "simple");
    state = switchLogTab(state, "detailed");
    expect(isDetailedEntryExpanded(state, 9)).toBe(true);
  });

  it("expandir una entrada ya expandida devuelve el mismo estado", () => {
    const state = expandDetailedEntry(createLogViewState("detailed"), 2);
    expect(expandDetailedEntry(state, 2)).toBe(state);
  });
});
