import { describe, expect, it } from "vitest";
import {
  encodeMorale,
  encodeOrientation,
  encodeResult,
  encodeSelection,
  encodeSide,
  encodeStatus,
  encodeTerrain,
  encodeVisibility,
  hasNonColorChannel,
  type AccessibleEncoding,
} from "../../src/ui/a11y/accessible-encoding.js";
import {
  MESSAGES_ES_ES,
  resolveMessageKey,
} from "../../src/ui/locale/index.js";

/** Toda codificación de una dimensión visual bajo prueba. */
const ALL_ENCODINGS: readonly AccessibleEncoding[] = [
  encodeSide("british"),
  encodeSide("german"),
  encodeSide("neutral"),
  encodeStatus("active"),
  encodeStatus("eliminated"),
  encodeVisibility("hidden"),
  encodeVisibility("revealed"),
  encodeMorale("normal"),
  encodeMorale("low"),
  encodeOrientation("north"),
  encodeTerrain("forest"),
  encodeTerrain("building"),
  encodeTerrain("hill"),
  encodeTerrain("river"),
  encodeTerrain("clear"),
  encodeTerrain("desconocido"),
  encodeSelection("unselected"),
  encodeSelection("selected"),
  encodeSelection("confirmed"),
  encodeResult("hit"),
  encodeResult("miss"),
  encodeResult("blocked"),
];

describe("codificación accesible: nunca depende solo del color (25.1)", () => {
  it("cada dimensión visual aporta al menos un canal no cromático", () => {
    for (const encoding of ALL_ENCODINGS) {
      expect(
        hasNonColorChannel(encoding),
        `codificación con etiqueta ${encoding.labelKey} debe tener forma/patrón/icono`,
      ).toBe(true);
    }
  });

  it("cada codificación expone un nombre accesible es-ES en el catálogo", () => {
    for (const encoding of ALL_ENCODINGS) {
      const resolved = resolveMessageKey(encoding.labelKey);
      // No es una clave ausente: existe redacción es-ES aprobada.
      expect(resolved.startsWith("⟪clave-sin-redacción:")).toBe(false);
      expect(resolved.length).toBeGreaterThan(0);
    }
  });

  it("el color, cuando aparece, es siempre un canal adicional", () => {
    for (const encoding of ALL_ENCODINGS) {
      if (encoding.color !== undefined) {
        expect(hasNonColorChannel(encoding)).toBe(true);
      }
    }
  });
});

describe("hasNonColorChannel — invariante del requisito 25.1", () => {
  it("rechaza una codificación que solo aporta color", () => {
    expect(hasNonColorChannel({ labelKey: "x", color: "rojo" })).toBe(false);
  });

  it("acepta cualquier canal no cromático presente", () => {
    expect(hasNonColorChannel({ labelKey: "x", shape: "circle" })).toBe(true);
    expect(hasNonColorChannel({ labelKey: "x", pattern: "striped" })).toBe(true);
    expect(hasNonColorChannel({ labelKey: "x", icon: "star" })).toBe(true);
  });
});

describe("codificación por dimensión (10.7, 25.1)", () => {
  it("distingue los tres bandos con forma e icono propios", () => {
    const british = encodeSide("british");
    const german = encodeSide("german");
    expect(british.shape).not.toBe(german.shape);
    expect(british.icon).not.toBe(german.icon);
  });

  it("la Orientación se codifica con forma de flecha además del color (10.7)", () => {
    const encoding = encodeOrientation("north");
    expect(encoding.shape).toBe("arrow");
    expect(encoding.icon).toBe("arrow-north");
    expect(hasNonColorChannel(encoding)).toBe(true);
  });

  it("terreno desconocido recibe un patrón distinguible, nunca solo color", () => {
    const encoding = encodeTerrain("terreno-inventado");
    expect(hasNonColorChannel(encoding)).toBe(true);
    expect(MESSAGES_ES_ES[encoding.labelKey]).toBeDefined();
  });

  it("la selección confirmada difiere de la selección pendiente en forma/icono", () => {
    const selected = encodeSelection("selected");
    const confirmed = encodeSelection("confirmed");
    expect(selected.shape).not.toBe(confirmed.shape);
    expect(selected.icon).not.toBe(confirmed.icon);
  });
});
