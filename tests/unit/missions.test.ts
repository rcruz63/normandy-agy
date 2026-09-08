import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DURATION_OPTIONS,
  MISSIONS,
  getMissionByNumber,
  missionMapPage,
  missionRulesPage,
} from "../../src/catalog/FON-ML-2022/missions.js";

/**
 * Verifica los fixtures de identidad de las quince Misiones contra los datos
 * de aceptación del requisito 32 (nombres es-ES, título inglés como metadato,
 * turnos base, objetivo, referencias `FON-ML-2022-Mnn` y páginas 16+2(N-1) /
 * 17+2(N-1)), y las tres opciones de duración.
 */

// Filas verbatim de la tabla del requisito 32: [nº, nombre es-ES, título inglés, turnos base, objetivo].
const EXPECTED: readonly (readonly [number, string, string, number, string])[] = [
  [1, "Control del bosque I", "Secure the Woods (1)", 4, "Eliminar la única Unidad alemana revelada"],
  [2, "Control del bosque II", "Secure the Woods (2)", 5, "Revelar y eliminar todas las Unidades alemanas"],
  [3, "Control del edificio", "Secure the Building", 6, "Revelar y eliminar todas las Unidades alemanas"],
  [4, "Control de la colina", "Secure the Hill", 6, "Revelar y eliminar todas las Unidades alemanas"],
  [5, "Control de la zona I", "Secure the Area (1)", 6, "Revelar y eliminar todas las Unidades alemanas"],
  [6, "Control de la zona II", "Secure the Area (2)", 6, "Revelar y eliminar todas las Unidades alemanas"],
  [7, "Control de la aldea I", "Secure the Village (1)", 7, "Revelar y eliminar todas las Unidades alemanas"],
  [
    8,
    "Entrada en la iglesia",
    "Enter the Church",
    8,
    "Ocupar el Hexágono de la iglesia con cualquier Unidad británica, sin exigir eliminar las demás Unidades alemanas",
  ],
  [9, "Control de la aldea II", "Secure the Village (2)", 8, "Revelar y eliminar todas las Unidades alemanas"],
  [10, "Control del bosque III", "Secure the Woods (3)", 8, "Revelar y eliminar todas las Unidades alemanas"],
  [11, "Neutralizar la artillería alemana", "Destroy the German Artillery", 8, "Destruir la Artillería alemana"],
  [12, "Control de la aldea III", "Secure the Village (3)", 8, "Revelar y eliminar todas las Unidades alemanas"],
  [13, "Jornada adversa", "Unlucky for Some", 8, "Revelar y eliminar todas las Unidades alemanas"],
  [
    14,
    "Periferia de Caen",
    "On the Outskirts of the City of Caen",
    8,
    "Ocupar el Hexágono de la iglesia con cualquier Unidad británica",
  ],
  [15, "Control de la ciudad de Caen", "Secure the City of Caen", 8, "Revelar y eliminar todas las Unidades alemanas"],
] as const;

describe("catálogo de identidad de Misiones (requisito 32)", () => {
  it("contiene exactamente las quince Misiones M01..M15 en orden", () => {
    expect(MISSIONS).toHaveLength(15);
    expect(MISSIONS.map((m) => m.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(MISSIONS.map((m) => m.missionRef)).toEqual([
      "FON-ML-2022-M01",
      "FON-ML-2022-M02",
      "FON-ML-2022-M03",
      "FON-ML-2022-M04",
      "FON-ML-2022-M05",
      "FON-ML-2022-M06",
      "FON-ML-2022-M07",
      "FON-ML-2022-M08",
      "FON-ML-2022-M09",
      "FON-ML-2022-M10",
      "FON-ML-2022-M11",
      "FON-ML-2022-M12",
      "FON-ML-2022-M13",
      "FON-ML-2022-M14",
      "FON-ML-2022-M15",
    ]);
  });

  it.each(EXPECTED)(
    "M%i tiene nombre es-ES, título inglés, turnos base y objetivo verificados",
    (number, visibleNameEs, originalTitle, baseTurns, objectiveEs) => {
      const mission = getMissionByNumber(number);
      expect(mission).toBeDefined();
      if (mission === undefined) return;
      expect(mission.visibleNameEs).toBe(visibleNameEs);
      expect(mission.maintenanceMetadata.originalTitle).toBe(originalTitle);
      expect(mission.baseTurns).toBe(baseTurns);
      expect(mission.objectiveEs).toBe(objectiveEs);
    },
  );

  it("modela exactamente tres opciones de duración base−1, base, base+1", () => {
    expect(DURATION_OPTIONS).toEqual(["base-minus-one", "base", "base-plus-one"]);
    for (const mission of MISSIONS) {
      expect(mission.durationOptions).toEqual([
        "base-minus-one",
        "base",
        "base-plus-one",
      ]);
      expect(mission.durationOptions).toHaveLength(3);
    }
  });

  it.each(EXPECTED)(
    "M%i referencia las páginas 16+2(N-1) y 17+2(N-1)",
    (number) => {
      const mission = getMissionByNumber(number);
      expect(mission).toBeDefined();
      if (mission === undefined) return;
      const rulesPage = 16 + 2 * (number - 1);
      const mapPage = 17 + 2 * (number - 1);
      expect(missionRulesPage(number)).toBe(rulesPage);
      expect(missionMapPage(number)).toBe(mapPage);
      const [rulesRef, mapRef] = mission.sourceRefs;
      expect(rulesRef.page).toBe(rulesPage);
      expect(rulesRef.sourceVersion).toBe("FON-ML-2022");
      expect(mapRef.page).toBe(mapPage);
      expect(rulesRef.missionRef).toBe(mission.missionRef);
      expect(mapRef.missionRef).toBe(mission.missionRef);
    },
  );

  it("mantiene el título inglés fuera del nombre visible (requisito 32.12)", () => {
    for (const mission of MISSIONS) {
      expect(mission.visibleNameEs).not.toBe(
        mission.maintenanceMetadata.originalTitle,
      );
    }
  });

  it("las páginas de reglas y de mapa son consecutivas para toda N válida", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 15 }), (n) => {
        expect(missionMapPage(n)).toBe(missionRulesPage(n) + 1);
      }),
      { numRuns: 100 },
    );
  });
});
