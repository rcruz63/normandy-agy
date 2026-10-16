import { describe, expect, it } from "vitest";
import {
  MISSION_CONFIGS,
  getMissionConfigByNumber,
  getMissionConfigById,
} from "../../src/catalog/FON-ML-2022/mission-registry.js";
import { buildHexGeometry } from "../../src/domain/geometry/index.js";

describe("Registro y configuración de misiones oficiales (FON-ML-2022 M01-M06)", () => {
  it("contiene las primeras 6 misiones oficiales del libro", () => {
    expect(MISSION_CONFIGS).toHaveLength(6);
    expect(MISSION_CONFIGS.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("Misión 1 tiene 4 turnos, escuadras A y B, y 1 incógnita en el bosque", () => {
    const m1 = getMissionConfigByNumber(1)!;
    expect(m1).toBeDefined();
    expect(m1.name).toBe("Control del bosque I");
    expect(m1.baseTurns).toBe(4);
    expect(m1.initialPieces["GB-A"]).toBeDefined();
    expect(m1.initialPieces["GB-B"]).toBeDefined();
    expect(m1.initialPieces["DE-UNK-1"]).toBeDefined();
    expect(Object.keys(m1.initialUnknowns)).toHaveLength(1);
  });

  it("Misión 2 tiene 5 turnos, escuadras A y B, y 2 incógnitas", () => {
    const m2 = getMissionConfigByNumber(2)!;
    expect(m2).toBeDefined();
    expect(m2.name).toBe("Control del bosque II");
    expect(m2.baseTurns).toBe(5);
    expect(m2.initialPieces["GB-A"]).toBeDefined();
    expect(m2.initialPieces["GB-B"]).toBeDefined();
    expect(m2.initialPieces["DE-UNK-1"]).toBeDefined();
    expect(m2.initialPieces["DE-UNK-2"]).toBeDefined();
    expect(Object.keys(m2.initialUnknowns)).toHaveLength(2);
  });

  it("Misión 3 tiene 6 turnos, escuadras A, B y C, y 3 incógnitas", () => {
    const m3 = getMissionConfigByNumber(3)!;
    expect(m3).toBeDefined();
    expect(m3.name).toBe("Control del edificio");
    expect(m3.baseTurns).toBe(6);
    expect(m3.initialPieces["GB-A"]).toBeDefined();
    expect(m3.initialPieces["GB-B"]).toBeDefined();
    expect(m3.initialPieces["GB-C"]).toBeDefined();
    expect(Object.keys(m3.initialUnknowns)).toHaveLength(3);
  });

  it("Misión 4 tiene 6 turnos, escuadras A, B y C, y 3 incógnitas", () => {
    const m4 = getMissionConfigByNumber(4)!;
    expect(m4).toBeDefined();
    expect(m4.name).toBe("Control de la colina");
    expect(m4.baseTurns).toBe(6);
    expect(m4.initialPieces["GB-A"]).toBeDefined();
    expect(m4.initialPieces["GB-B"]).toBeDefined();
    expect(m4.initialPieces["GB-C"]).toBeDefined();
    expect(Object.keys(m4.initialUnknowns)).toHaveLength(3);
  });

  it("Misión 5 despliega el Equipo MG británico (GB-MG) y 4 incógnitas", () => {
    const m5 = getMissionConfigByNumber(5)!;
    expect(m5).toBeDefined();
    expect(m5.name).toBe("Control de la zona I");
    expect(m5.baseTurns).toBe(6);
    expect(m5.initialPieces["GB-A"]).toBeDefined();
    expect(m5.initialPieces["GB-B"]).toBeDefined();
    expect(m5.initialPieces["GB-MG"]).toBeDefined();
    expect(m5.initialPieces["GB-MG"]!.definitionId).toBe("mg-team");
    expect(Object.keys(m5.initialUnknowns)).toHaveLength(4);
  });

  it("Misión 6 cuenta con 2 accesos de entrada, 4 unidades británicas y 4 incógnitas", () => {
    const m6 = getMissionConfigByNumber(6)!;
    expect(m6).toBeDefined();
    expect(m6.name).toBe("Control de la zona II");
    expect(m6.baseTurns).toBe(6);
    expect(m6.map.entryOptions).toHaveLength(2);
    expect(m6.initialPieces["GB-A"]).toBeDefined();
    expect(m6.initialPieces["GB-B"]).toBeDefined();
    expect(m6.initialPieces["GB-C"]).toBeDefined();
    expect(m6.initialPieces["GB-MG"]).toBeDefined();
    expect(Object.keys(m6.initialUnknowns)).toHaveLength(4);
  });

  it("todos los mapas de 10 hexágonos tienen topología conexa y 19 aristas canónicas", () => {
    for (const mission of MISSION_CONFIGS) {
      expect(Object.keys(mission.map.hexes)).toHaveLength(10);
      expect(mission.map.undirectedEdges).toHaveLength(19);
      const geometry = buildHexGeometry(mission.map);
      for (const hexId of Object.keys(mission.map.hexes)) {
        expect(geometry.neighbors(hexId as any).length).toBeGreaterThan(0);
      }
    }
  });

  it("getMissionConfigById localiza correctamente cada misión por su MissionId", () => {
    for (const mission of MISSION_CONFIGS) {
      const found = getMissionConfigById(mission.id);
      expect(found).toBeDefined();
      expect(found?.number).toBe(mission.number);
    }
  });
});
