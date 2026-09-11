import { describe, expect, it } from "vitest";
import {
  catalogItem,
  canonicalRule,
  canonicalTable,
  missionDefinition,
  type CanonicalRule,
  type CatalogItem,
  type MissionDefinition,
} from "../../src/catalog/schemas/catalog.js";
import {
  blockedStatus,
  conformanceEntry,
  publishedStatus,
} from "../../src/catalog/schemas/publication.js";
import type { ConformanceEntry } from "../../src/catalog/schemas/publication.js";
import { sourceRef } from "../../src/catalog/schemas/source-ref.js";
import type {
  MaintenanceCatalog,
} from "../../src/catalog/schemas/build.js";
import type {
  DeclarativeEffect,
  DeclarativePredicate,
  HexMapDefinition,
  ObjectiveDefinition,
  OrderTable,
  PieceDefinition,
  RevealResult,
  SetupDefinition,
} from "../../src/catalog/schemas/placeholders.js";
import {
  REQUIRED_MISSION_COUNT,
  createCatalogCompiler,
  validateMaintenanceCatalog,
} from "../../src/catalog/compiler/index.js";
import {
  catalogId,
  missionId,
  rulesVersion,
} from "../../src/domain/identity/index.js";

/**
 * Verifica el `CatalogValidator` y el `CatalogCompiler` fail-closed (Tarea 2.2):
 * identificadores únicos, integridad referencial, cobertura/no solapamiento de
 * tablas, exactamente quince Misiones, relaciones de inventario y la regla de
 * nunca reescribir una Versión de reglas ya publicada.
 */

const RV = rulesVersion("FON-ML-2022-r1");

// Marcadores de sub-tipos que definen otras tareas.
const stubObjective: ObjectiveDefinition = { kind: "eliminate-all-germans" };
const stubSetup: SetupDefinition = {
  britishStart: [],
  fixedGermanStart: [],
  unknowns: [],
};
const stubMap = {} as HexMapDefinition;
const stubPredicate = {} as DeclarativePredicate;
const stubEffect = {} as DeclarativeEffect;
const stubPiece = {} as PieceDefinition;

function revealTableFor(n: number) {
  return canonicalTable<number, RevealResult>({
    id: catalogId(`FON-ML-2022-reveal-M${String(n).padStart(2, "0")}`),
    inputDomain: [1, 2, 3, 4, 5, 6],
    rows: [1, 2, 3, 4, 5, 6].map((input) => ({
      input,
      output: "LMG" as RevealResult,
    })),
    sourceRefs: [
      sourceRef({
        page: 16 + 2 * (n - 1),
        element: "Tabla de revelado",
        missionRef: `FON-ML-2022-M${String(n).padStart(2, "0")}`,
      }),
    ],
  });
}

function buildMission(n: number): MissionDefinition {
  const ref = `FON-ML-2022-M${String(n).padStart(2, "0")}` as const;
  return missionDefinition({
    id: missionId(ref),
    number: n,
    visibleNameEs: `Misión ${n}`,
    originalTitle: `Mission ${n}`,
    rulesVersion: RV,
    publicationStatus: blockedStatus(["DP-001"]),
    baseTurns: 4,
    objective: stubObjective,
    setup: stubSetup,
    map: stubMap,
    revealTable: revealTableFor(n),
    sourceRefs: [
      sourceRef({ page: 16 + 2 * (n - 1), element: "Reglas", missionRef: ref }),
      sourceRef({ page: 17 + 2 * (n - 1), element: "Mapa", missionRef: ref }),
    ],
  });
}

function generalRule(id: string): CatalogItem<CanonicalRule> {
  return catalogItem<CanonicalRule>({
    id: catalogId(id),
    rulesVersion: RV,
    value: canonicalRule({
      id: catalogId(id),
      predicate: stubPredicate,
      effect: stubEffect,
      priority: 1,
    }),
    sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
    status: publishedStatus("2022-01-01"),
  });
}

function orderTableItem(id: string): CatalogItem<OrderTable> {
  return catalogItem<OrderTable>({
    id: catalogId(id),
    rulesVersion: RV,
    value: canonicalTable<1 | 2 | 3 | 4 | 5 | 6, { first: "ADV"; second: "COV" }>({
      id: catalogId(`${id}-table`),
      inputDomain: [1, 2, 3, 4, 5, 6],
      rows: [1, 2, 3, 4, 5, 6].map((input) => ({
        input: input as 1 | 2 | 3 | 4 | 5 | 6,
        output: { first: "ADV", second: "COV" } as const,
      })),
      sourceRefs: [sourceRef({ page: 7, element: "Tabla de órdenes" })],
    }) as unknown as OrderTable,
    sourceRefs: [sourceRef({ page: 7, element: "Tabla de órdenes" })],
    status: publishedStatus("2022-01-01"),
  });
}

function pieceItem(id: string): CatalogItem<PieceDefinition> {
  return catalogItem<PieceDefinition>({
    id: catalogId(id),
    rulesVersion: RV,
    value: stubPiece,
    sourceRefs: [sourceRef({ page: 47, element: "Contadores" })],
    status: publishedStatus("2022-01-01"),
  });
}

/** Entrada de conformidad `approved` con una prueba vinculada. */
function approvedConformance(id: string): ConformanceEntry {
  return conformanceEntry({
    catalogId: catalogId(id),
    testIds: [`test-${id}`],
    status: "approved",
  });
}

/**
 * Matriz de conformidad completa para el catálogo válido: una entrada
 * `approved` por cada elemento inventariado (Fichas, Tablas de órdenes, reglas
 * generales, Misiones y sus tablas de revelado).
 */
function fullConformance(): ConformanceEntry[] {
  const entries: ConformanceEntry[] = [
    approvedConformance("piece-rifle-squad"),
    approvedConformance("order-rifle-squad"),
    approvedConformance("rule-turn-order"),
  ];
  for (let n = 1; n <= REQUIRED_MISSION_COUNT; n += 1) {
    const nn = String(n).padStart(2, "0");
    entries.push(approvedConformance(`FON-ML-2022-M${nn}`));
    entries.push(approvedConformance(`FON-ML-2022-reveal-M${nn}`));
  }
  return entries;
}

/** Construye una MaintenanceCatalog válida con las quince Misiones. */
function validCatalog(): MaintenanceCatalog {
  const missions = Array.from({ length: REQUIRED_MISSION_COUNT }, (_u, i) =>
    buildMission(i + 1),
  );
  return {
    rulesVersionCandidate: RV,
    missions,
    pieceTypes: { "rifle-squad": pieceItem("piece-rifle-squad") },
    orderTables: { "rifle-squad": orderTableItem("order-rifle-squad") },
    generalRules: [generalRule("rule-turn-order")],
    conformance: fullConformance(),
  };
}

describe("CatalogValidator — catálogo válido", () => {
  it("no reporta ningún fallo para un catálogo bien formado", () => {
    expect(validateMaintenanceCatalog(validCatalog())).toEqual([]);
  });

  it("exige exactamente quince Misiones", () => {
    expect(REQUIRED_MISSION_COUNT).toBe(15);
  });
});

describe("CatalogValidator — identificadores únicos (req. 4.2/4.10)", () => {
  it("detecta un identificador de catálogo duplicado", () => {
    const base = validCatalog();
    // Duplica el id de un tipo de Ficha con el de la Tabla de órdenes.
    const catalog: MaintenanceCatalog = {
      ...base,
      pieceTypes: { dup: pieceItem("shared-id") },
      orderTables: { dup: orderTableItem("shared-id") },
    };
    const errors = validateMaintenanceCatalog(catalog);
    expect(errors.some((e) => e.code === "duplicate-id")).toBe(true);
  });
});

describe("CatalogValidator — integridad referencial", () => {
  it("rechaza una regla especial sin regla general correspondiente", () => {
    const base = validCatalog();
    const [first, ...rest] = base.missions;
    const patched = missionDefinition({
      id: missionId("FON-ML-2022-M01"),
      number: 1,
      visibleNameEs: "Misión 1",
      originalTitle: "Mission 1",
      rulesVersion: RV,
      publicationStatus: blockedStatus(["DP-001"]),
      baseTurns: 4,
      objective: stubObjective,
      setup: stubSetup,
      map: stubMap,
      revealTable: revealTableFor(1),
      specialRules: [catalogId("regla-inexistente")],
      sourceRefs: [
        sourceRef({ page: 16, element: "Reglas", missionRef: "FON-ML-2022-M01" }),
        sourceRef({ page: 17, element: "Mapa", missionRef: "FON-ML-2022-M01" }),
      ],
    });
    void first;
    const catalog: MaintenanceCatalog = { ...base, missions: [patched, ...rest] };
    const errors = validateMaintenanceCatalog(catalog);
    expect(errors.some((e) => e.code === "inventory-relation")).toBe(true);
  });

  it("rechaza una fuente distinta de FON-ML-2022", () => {
    const base = validCatalog();
    const foreignRule = catalogItem<CanonicalRule>({
      id: catalogId("regla-foránea"),
      rulesVersion: RV,
      value: canonicalRule({
        id: catalogId("regla-foránea"),
        predicate: stubPredicate,
        effect: stubEffect,
        priority: 1,
      }),
      // SourceRef con autoridad ajena, forzado para la prueba.
      sourceRefs: [
        { sourceVersion: "OTRA-FUENTE", page: 1, element: "x" } as never,
      ],
      status: publishedStatus("2022-01-01"),
    });
    const catalog: MaintenanceCatalog = {
      ...base,
      generalRules: [...base.generalRules, foreignRule],
    };
    const errors = validateMaintenanceCatalog(catalog);
    expect(errors.some((e) => e.code === "source-authority")).toBe(true);
  });
});

describe("CatalogValidator — cobertura y no solapamiento de tablas (req. 4.7/17.7)", () => {
  it("detecta una tabla de revelado con dominio incompleto", () => {
    const base = validCatalog();
    // Tabla de revelado con una fila fuera de dominio y cobertura parcial.
    const brokenTable = {
      id: catalogId("revelado-roto"),
      rows: [
        { input: 1, output: "LMG" as RevealResult },
        { input: 9, output: "HMG" as RevealResult },
      ],
      inputDomain: [1, 2, 3, 4, 5, 6],
      sourceRefs: [sourceRef({ page: 16, element: "Tabla" })],
    };
    const [, ...rest] = base.missions;
    const patched = {
      ...buildMission(1),
      revealTable: brokenTable,
    } as unknown as MissionDefinition;
    const catalog: MaintenanceCatalog = { ...base, missions: [patched, ...rest] };
    const errors = validateMaintenanceCatalog(catalog);
    expect(
      errors.some(
        (e) => e.code === "table-coverage" || e.code === "table-overlap",
      ),
    ).toBe(true);
  });
});

describe("CatalogValidator — exactamente quince Misiones (req. 4.1)", () => {
  it("falla con menos de quince Misiones", () => {
    const base = validCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      missions: base.missions.slice(0, 14),
    };
    const errors = validateMaintenanceCatalog(catalog);
    expect(errors.some((e) => e.code === "mission-count")).toBe(true);
  });

  it("falla con un número de Misión repetido (hueco en 1..15)", () => {
    const base = validCatalog();
    const missions = [...base.missions];
    missions[14] = buildMission(1); // dos Misiones número 1, falta la 15
    const catalog: MaintenanceCatalog = { ...base, missions };
    const errors = validateMaintenanceCatalog(catalog);
    expect(errors.some((e) => e.code === "mission-number")).toBe(true);
    expect(errors.some((e) => e.code === "mission-count")).toBe(true);
  });
});

describe("CatalogCompiler — emisión inmutable y fail-closed", () => {
  it("emite un catálogo inmutable estampado con la rulesVersion nueva", () => {
    const compiler = createCatalogCompiler();
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("built");
    if (result.kind === "built") {
      expect(result.catalog.rulesVersion).toBe(RV);
      expect(result.catalog.sourceVersion).toBe("FON-ML-2022");
      expect(result.catalog.missions).toHaveLength(15);
      expect(Object.isFrozen(result.catalog)).toBe(true);
      expect(Object.isFrozen(result.catalog.missions)).toBe(true);
    }
  });

  it("no emite catálogo si la validación falla (fail-closed)", () => {
    const compiler = createCatalogCompiler();
    const base = validCatalog();
    const result = compiler.compile({ ...base, missions: base.missions.slice(0, 10) });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("nunca reescribe una Versión de reglas ya publicada (req. 1.10)", () => {
    const compiler = createCatalogCompiler({ publishedVersions: [RV] });
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.errors.some((e) => e.code === "version-rewrite")).toBe(true);
    }
  });

  it("permite emitir una versión nueva distinta de las publicadas", () => {
    const compiler = createCatalogCompiler({
      publishedVersions: [rulesVersion("FON-ML-2022-r0")],
    });
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("built");
  });

  it("no muta la entrada", () => {
    const compiler = createCatalogCompiler();
    const input = validCatalog();
    const before = input.missions.length;
    compiler.compile(input);
    expect(input.missions.length).toBe(before);
  });
});
