import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_MISSION_NUMBER,
  MIN_MISSION_NUMBER,
  InvalidSourceRefError,
  missionMapPage,
  missionRefString,
  missionRulesPage,
  parseMissionNumber,
  sourceRef,
} from "../../src/catalog/schemas/source-ref.js";

/**
 * Propiedades del esquema de fuente (Tarea 2.1): las páginas de cada Misión
 * cumplen `16 + 2(N-1)` / `17 + 2(N-1)`, la Referencia de misión es un
 * round-trip para `N=01..15` y `sourceRef` solo acepta esas dos páginas cuando
 * se aporta la Misión. Validates: Requirements 1.1, 1.2, 1.4, 4.2, 4.3, 32.3.
 */

const missionNumber = fc.integer({
  min: MIN_MISSION_NUMBER,
  max: MAX_MISSION_NUMBER,
});

describe("propiedades de páginas y Referencia de misión", () => {
  it("las páginas siguen las fórmulas y no se solapan entre Misiones", () => {
    fc.assert(
      fc.property(missionNumber, (n) => {
        const rules = missionRulesPage(n);
        const map = missionMapPage(n);
        expect(rules).toBe(16 + 2 * (n - 1));
        expect(map).toBe(17 + 2 * (n - 1));
        expect(map).toBe(rules + 1);
        // La página de reglas es par y la de Mapa impar.
        expect(rules % 2).toBe(0);
        expect(map % 2).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("las páginas de Misiones distintas nunca coinciden", () => {
    fc.assert(
      fc.property(missionNumber, missionNumber, (a, b) => {
        fc.pre(a !== b);
        const pagesA = new Set([missionRulesPage(a), missionMapPage(a)]);
        const pagesB = [missionRulesPage(b), missionMapPage(b)];
        for (const page of pagesB) {
          expect(pagesA.has(page)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("missionRefString es un round-trip con parseMissionNumber", () => {
    fc.assert(
      fc.property(missionNumber, (n) => {
        const ref = missionRefString(n);
        expect(ref).toMatch(/^FON-ML-2022-M\d{2}$/);
        expect(parseMissionNumber(ref)).toBe(n);
      }),
      { numRuns: 100 },
    );
  });

  it("sourceRef acepta exactamente las páginas de reglas y de Mapa de la Misión", () => {
    fc.assert(
      fc.property(missionNumber, (n) => {
        const ref = missionRefString(n);
        const rules = missionRulesPage(n);
        const map = missionMapPage(n);
        expect(
          sourceRef({ page: rules, element: "reglas", missionRef: ref }).page,
        ).toBe(rules);
        expect(
          sourceRef({ page: map, element: "mapa", missionRef: ref }).page,
        ).toBe(map);
      }),
      { numRuns: 100 },
    );
  });

  it("sourceRef rechaza cualquier página distinta a las dos de la Misión", () => {
    fc.assert(
      fc.property(
        missionNumber,
        fc.integer({ min: 1, max: 60 }),
        (n, page) => {
          const rules = missionRulesPage(n);
          const map = missionMapPage(n);
          fc.pre(page !== rules && page !== map);
          expect(() =>
            sourceRef({
              page,
              element: "x",
              missionRef: missionRefString(n),
            }),
          ).toThrow(InvalidSourceRefError);
        },
      ),
      { numRuns: 100 },
    );
  });
});
