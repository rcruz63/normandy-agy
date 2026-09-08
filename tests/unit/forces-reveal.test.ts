import { describe, expect, it } from "vitest";
import {
  BRITISH_FORCES_BY_MISSION,
  FIXED_GERMAN_FORCES_BY_MISSION,
  MISSION_KEYS,
  REVEAL_TABLE_BY_MISSION,
  missionPage,
  missionRef,
  type BritishForceKind,
  type D6,
  type FixedGermanUnitKind,
  type RevealResult,
} from "../../src/catalog/FON-ML-2022/forces-reveal.js";

// Etiquetas de fuerza británica compactas para comparar filas del req. 33.
function forceTokens(missionKey: string): string[] {
  const fixture = BRITISH_FORCES_BY_MISSION[missionKey];
  if (fixture === undefined) {
    throw new Error(`Falta fixture de fuerzas para ${missionKey}`);
  }
  return fixture.forces.map((entry) => {
    const kind: BritishForceKind = entry.kind;
    return entry.squad === undefined ? kind : `${kind}:${entry.squad}`;
  });
}

// Salida d6->RevealResult como tupla de 6 posiciones (índice 0 => d6 1).
function revealVector(missionKey: string): RevealResult[] {
  const table = REVEAL_TABLE_BY_MISSION[missionKey];
  if (table === undefined) {
    throw new Error(`Falta tabla de revelado para ${missionKey}`);
  }
  const out: RevealResult[] = [];
  for (let value = 1 as D6; value <= 6; value = (value + 1) as D6) {
    const row = table.rows.find((r) => r.input === value);
    if (row === undefined) {
      throw new Error(`Falta fila d6=${String(value)} en ${missionKey}`);
    }
    out.push(row.output);
  }
  return out;
}

describe("requisito 33 — cobertura del conjunto exacto de Misiones", () => {
  it("cubre exactamente M01..M15 en cada tabla del requisito", () => {
    const expected = Array.from({ length: 15 }, (_u, i) => `M${String(i + 1).padStart(2, "0")}`);
    expect(MISSION_KEYS).toEqual(expected);
    expect(Object.keys(BRITISH_FORCES_BY_MISSION).sort()).toEqual([...expected].sort());
    expect(Object.keys(REVEAL_TABLE_BY_MISSION).sort()).toEqual([...expected].sort());
    expect(Object.keys(FIXED_GERMAN_FORCES_BY_MISSION).sort()).toEqual([...expected].sort());
  });
});

describe("requisito 33 — fuerzas británicas verificadas", () => {
  const cases: ReadonlyArray<readonly [string, string[]]> = [
    ["M01", ["rifle-squad:A", "rifle-squad:B"]],
    ["M02", ["rifle-squad:A", "rifle-squad:B"]],
    ["M03", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C"]],
    ["M04", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C"]],
    ["M05", ["rifle-squad:A", "rifle-squad:B", "mg-team"]],
    ["M06", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mg-team"]],
    ["M07", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mortar", "piat"]],
    ["M08", ["rifle-squad:A", "rifle-squad:B", "mg-team", "mortar"]],
    ["M09", ["rifle-squad:A", "rifle-squad:B", "mg-team", "mortar", "piat"]],
    ["M10", ["rifle-squad:A", "rifle-squad:B", "mg-team", "piat"]],
    ["M11", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mg-team"]],
    ["M12", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mortar", "piat"]],
    ["M13", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mg-team", "mortar"]],
    ["M14", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mg-team", "piat"]],
    ["M15", ["rifle-squad:A", "rifle-squad:B", "rifle-squad:C", "mg-team", "piat"]],
  ];

  it.each(cases)("%s tiene las fuerzas exactas de la fuente", (key, expected) => {
    expect(forceTokens(key)).toEqual(expected);
  });
});

describe("requisito 33 — tablas de revelado d6", () => {
  const cases: ReadonlyArray<readonly [string, RevealResult[]]> = [
    ["M01", ["HMG", "HMG", "LMG", "LMG", "LMG", "LMG"]],
    ["M02", ["HMG", "HMG", "LMG", "LMG", "LMG", "LMG"]],
    ["M03", ["HMG", "HMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M04", ["HMG", "HMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M05", ["HMG", "HMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M06", ["HMG", "HMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M07", ["HMG", "LMG", "LMG", "german-rifles", "german-rifles", "mine"]],
    ["M08", ["HMG", "LMG", "LMG", "LMG", "german-rifles", "mine"]],
    ["M09", ["HMG", "HMG", "LMG", "german-rifles", "german-rifles", "mine"]],
    ["M10", ["HMG", "HMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M11", ["HMG", "LMG", "LMG", "german-rifles", "german-rifles", "mine"]],
    ["M12", ["HMG", "HMG", "LMG", "german-rifles", "german-rifles", "mine"]],
    ["M13", ["HMG", "LMG", "LMG", "LMG", "german-rifles", "german-rifles"]],
    ["M14", ["HMG", "LMG", "LMG", "LMG", "german-rifles", "mine"]],
    ["M15", ["HMG", "LMG", "LMG", "LMG", "german-rifles", "mine"]],
  ];

  it.each(cases)("%s transforma d6 1..6 exactamente", (key, expected) => {
    expect(revealVector(key)).toEqual(expected);
  });

  it("cada tabla cubre el dominio completo 1..6 con salida única", () => {
    for (const key of MISSION_KEYS) {
      const table = REVEAL_TABLE_BY_MISSION[key];
      expect(table).toBeDefined();
      const inputs = table!.rows.map((r) => r.input).sort((a, b) => a - b);
      expect(inputs).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });
});

describe("requisito 33 — unidades alemanas fijas adicionales", () => {
  function kinds(missionKey: string): FixedGermanUnitKind[] {
    const fx = FIXED_GERMAN_FORCES_BY_MISSION[missionKey];
    if (fx === undefined) {
      throw new Error(`Falta fixture fija para ${missionKey}`);
    }
    return fx.present ? fx.units.map((u) => u.kind) : [];
  }

  it("registra ausencia explícita en las Misiones sin unidad fija (req. 33.6)", () => {
    for (const key of ["M01", "M02", "M03", "M04", "M05", "M06"]) {
      const fx = FIXED_GERMAN_FORCES_BY_MISSION[key];
      expect(fx?.present).toBe(false);
      if (fx && fx.present === false) {
        expect(fx.absenceNote.length).toBeGreaterThan(0);
      }
    }
  });

  const cases: ReadonlyArray<readonly [string, FixedGermanUnitKind[]]> = [
    ["M07", ["half-track"]],
    ["M08", ["LMG"]],
    ["M09", ["half-track"]],
    ["M10", ["half-track", "artillery"]],
    ["M11", ["artillery", "LMG"]],
    ["M12", ["half-track"]],
    ["M13", ["artillery", "HMG"]],
    ["M14", ["half-track", "artillery", "HMG"]],
    ["M15", ["artillery", "LMG"]],
  ];

  it.each(cases)("%s tiene las unidades fijas exactas de la fuente", (key, expected) => {
    expect(kinds(key)).toEqual(expected);
  });

  it("Misión 8: LMG fija anclada al Hexágono de la iglesia (req. 33.4)", () => {
    const fx = FIXED_GERMAN_FORCES_BY_MISSION["M08"];
    expect(fx?.present).toBe(true);
    if (fx && fx.present) {
      expect(fx.units).toHaveLength(1);
      expect(fx.units[0]?.kind).toBe("LMG");
      expect(fx.units[0]?.semanticAnchorEs).toBe("Hexágono de la iglesia");
    }
  });

  it("Misión 11: Artillería y LMG fijas reveladas (req. 33.5)", () => {
    expect(kinds("M11")).toEqual(["artillery", "LMG"]);
  });

  it("marca como Estado no publicable la posición/Orientación de toda unidad fija (req. 33.8)", () => {
    for (const key of MISSION_KEYS) {
      const fx = FIXED_GERMAN_FORCES_BY_MISSION[key];
      if (fx && fx.present) {
        for (const unit of fx.units) {
          expect(unit.visual.blockedBy).toBe("DP-001");
          expect(unit.visual.aspect).toBe("position-and-orientation");
        }
      }
    }
  });
});

describe("requisito 33 — referencias de misión", () => {
  it("asocia cada Misión con la página par 16..44 y su Referencia de misión (req. 33.7)", () => {
    const expectedPages = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44];
    MISSION_KEYS.forEach((key, index) => {
      const number = index + 1;
      expect(missionPage(number)).toBe(expectedPages[index]);
      expect(missionRef(number)).toBe(`FON-ML-2022-${key}`);

      const forces = BRITISH_FORCES_BY_MISSION[key];
      const reveal = REVEAL_TABLE_BY_MISSION[key];
      const fixed = FIXED_GERMAN_FORCES_BY_MISSION[key];
      expect(forces?.sourceRefs[0]?.page).toBe(expectedPages[index]);
      expect(forces?.sourceRefs[0]?.missionRef).toBe(`FON-ML-2022-${key}`);
      expect(reveal?.sourceRefs[0]?.page).toBe(expectedPages[index]);
      expect(fixed?.sourceRefs[0]?.missionRef).toBe(`FON-ML-2022-${key}`);
    });
  });
});
