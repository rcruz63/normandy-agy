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
  acceptanceRun,
  blockedStatus,
  conformanceEntry,
  publishedStatus,
  visualReviewRecord,
} from "../../src/catalog/schemas/publication.js";
import type {
  AcceptanceRun,
  ConformanceEntry,
  VisualReviewRecord,
} from "../../src/catalog/schemas/publication.js";
import { sourceRef } from "../../src/catalog/schemas/source-ref.js";
import type { MaintenanceCatalog } from "../../src/catalog/schemas/build.js";
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
  generateConformanceMatrix,
} from "../../src/catalog/compiler/index.js";
import {
  catalogId,
  missionId,
  rulesVersion,
  saveVersion,
} from "../../src/domain/identity/index.js";

/**
 * Verifica la generación de la Matriz de conformidad y el gate de aceptación
 * del `CatalogCompiler` (Tarea 26.1):
 * - una entrada única por elemento inventariado vinculada a al menos una prueba;
 * - fallo fail-closed ante entradas huérfanas, faltantes, fallidas o no
 *   verificadas necesarias para una Misión;
 * - registro de la Segunda revisión visual (revisor, fecha, resultado,
 *   Referencia de misión) sin páginas ni capturas del PDF;
 * - asociación de cada Partida de aceptación con Versión de reglas, Semilla y
 *   Versión de guardado.
 */

const RV = rulesVersion("FON-ML-2022-r1");
const SAVE = saveVersion("save-1");

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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function missionRefOf(n: number): `FON-ML-2022-M${string}` {
  return `FON-ML-2022-M${pad(n)}` as const;
}

function revealId(n: number): string {
  return `FON-ML-2022-reveal-M${pad(n)}`;
}

function revealTableFor(n: number) {
  return canonicalTable<number, RevealResult>({
    id: catalogId(revealId(n)),
    inputDomain: [1, 2, 3, 4, 5, 6],
    rows: [1, 2, 3, 4, 5, 6].map((input) => ({
      input,
      output: "LMG" as RevealResult,
    })),
    sourceRefs: [
      sourceRef({
        page: 16 + 2 * (n - 1),
        element: "Tabla de revelado",
        missionRef: missionRefOf(n),
      }),
    ],
  });
}

function buildMission(n: number): MissionDefinition {
  const ref = missionRefOf(n);
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

const PIECE_ID = "piece-rifle-squad";
const ORDER_ID = "order-rifle-squad";
const RULE_ID = "rule-turn-order";

/** Ids de todos los elementos inventariados del catálogo base. */
function inventoriedIds(): readonly string[] {
  const ids = [PIECE_ID, ORDER_ID, RULE_ID];
  for (let n = 1; n <= REQUIRED_MISSION_COUNT; n += 1) {
    ids.push(missionRefOf(n));
    ids.push(revealId(n));
  }
  return ids;
}

function approved(id: string): ConformanceEntry {
  return conformanceEntry({
    catalogId: catalogId(id),
    testIds: [`test-${id}`],
    status: "approved",
  });
}

/** Matriz de conformidad completa: una entrada `approved` por elemento. */
function fullConformance(): ConformanceEntry[] {
  return inventoriedIds().map((id) => approved(id));
}

/** Segunda revisión visual aprobada para cada Misión (sin páginas del PDF). */
function fullVisualReviews(): VisualReviewRecord[] {
  const reviews: VisualReviewRecord[] = [];
  for (let n = 1; n <= REQUIRED_MISSION_COUNT; n += 1) {
    reviews.push(
      visualReviewRecord({
        missionId: missionId(missionRefOf(n)),
        missionRef: sourceRef({
          page: 17 + 2 * (n - 1),
          element: "Mapa",
          missionRef: missionRefOf(n),
        }),
        dp001Status: "resolved",
        result: "approved",
        reviewerId: "mantenedor-1",
        reviewedAt: "2022-02-02",
      }),
    );
  }
  return reviews;
}

/** Partida de aceptación por Misión asociada a reglas, Semilla y guardado. */
function fullAcceptanceRuns(): AcceptanceRun[] {
  const runs: AcceptanceRun[] = [];
  for (let n = 1; n <= REQUIRED_MISSION_COUNT; n += 1) {
    runs.push(
      acceptanceRun({
        missionId: missionId(missionRefOf(n)),
        rulesVersion: RV,
        seed: `seed-M${pad(n)}`,
        saveVersion: SAVE,
        outcome: "victory",
        runAt: "2022-03-03",
      }),
    );
  }
  return runs;
}

function validCatalog(): MaintenanceCatalog {
  const missions = Array.from({ length: REQUIRED_MISSION_COUNT }, (_u, i) =>
    buildMission(i + 1),
  );
  return {
    rulesVersionCandidate: RV,
    missions,
    pieceTypes: { "rifle-squad": pieceItem(PIECE_ID) },
    orderTables: { "rifle-squad": orderTableItem(ORDER_ID) },
    generalRules: [generalRule(RULE_ID)],
    conformance: fullConformance(),
    visualReviews: fullVisualReviews(),
    acceptanceRuns: fullAcceptanceRuns(),
  };
}

describe("generateConformanceMatrix — generación (req. 2.1, 2.3)", () => {
  it("genera una entrada única por cada elemento inventariado", () => {
    const { matrix, errors } = generateConformanceMatrix(validCatalog());
    expect(errors).toEqual([]);

    const ids = inventoriedIds();
    expect(matrix).toHaveLength(ids.length);

    const matrixIds = matrix.map((e) => e.catalogId as unknown as string).sort();
    expect(matrixIds).toEqual([...ids].sort());

    // Sin duplicados: cada id aparece exactamente una vez.
    expect(new Set(matrixIds).size).toBe(matrixIds.length);
  });

  it("cada entrada vincula al menos una prueba", () => {
    const { matrix } = generateConformanceMatrix(validCatalog());
    for (const entry of matrix) {
      expect(entry.testIds.length).toBeGreaterThan(0);
    }
  });

  it("es puro: no muta la entrada", () => {
    const catalog = validCatalog();
    const before = (catalog.conformance ?? []).length;
    generateConformanceMatrix(catalog);
    expect((catalog.conformance ?? []).length).toBe(before);
  });
});

describe("generateConformanceMatrix — ramas fail-closed", () => {
  it("falla ante una entrada huérfana (req. 2.8)", () => {
    const base = validCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [...fullConformance(), approved("elemento-inexistente")],
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-orphan")).toBe(true);
  });

  it("falla ante un elemento inventariado sin entrada (req. 2.7)", () => {
    const base = validCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      // Se omite la entrada del tipo de Ficha inventariado.
      conformance: fullConformance().filter(
        (e) => (e.catalogId as unknown as string) !== PIECE_ID,
      ),
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-missing")).toBe(true);
  });

  it("falla ante una prueba fallida (req. 2.6, 30.9, 30.10, 40.4, 40.5)", () => {
    const base = validCatalog();
    const failing = conformanceEntry({
      catalogId: catalogId(missionRefOf(1)),
      testIds: [`test-${missionRefOf(1)}`],
      status: "failed",
      expected: { topology: "canónica" },
      actual: { topology: "divergente" },
      sourceRefs: [
        sourceRef({ page: 17, element: "Mapa", missionRef: missionRefOf(1) }),
      ],
    });
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [
        failing,
        ...fullConformance().filter(
          (e) => (e.catalogId as unknown as string) !== missionRefOf(1),
        ),
      ],
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-failed")).toBe(true);
  });

  it("falla ante una entrada no verificada necesaria para una Misión (req. 2.5)", () => {
    const base = validCatalog();
    const unverified = conformanceEntry({
      catalogId: catalogId(revealId(3)),
      testIds: [`test-${revealId(3)}`],
      status: "unverified",
    });
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [
        unverified,
        ...fullConformance().filter(
          (e) => (e.catalogId as unknown as string) !== revealId(3),
        ),
      ],
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-unverified")).toBe(true);
  });

  it("falla ante una entrada sin prueba vinculada (req. 2.3)", () => {
    const base = validCatalog();
    const noTest = conformanceEntry({
      catalogId: catalogId(RULE_ID),
      testIds: [],
      status: "approved",
    });
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [
        noTest,
        ...fullConformance().filter(
          (e) => (e.catalogId as unknown as string) !== RULE_ID,
        ),
      ],
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-test-link")).toBe(true);
  });

  it("falla ante entradas duplicadas para el mismo elemento (req. 2.1)", () => {
    const base = validCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [...fullConformance(), approved(PIECE_ID)],
    };
    const { errors } = generateConformanceMatrix(catalog);
    expect(errors.some((e) => e.code === "conformance-duplicate")).toBe(true);
  });

  it("genera una entrada `unverified` derivada para el elemento faltante", () => {
    const base = validCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: fullConformance().filter(
        (e) => (e.catalogId as unknown as string) !== ORDER_ID,
      ),
    };
    const { matrix } = generateConformanceMatrix(catalog);
    const derived = matrix.find(
      (e) => (e.catalogId as unknown as string) === ORDER_ID,
    );
    expect(derived).toBeDefined();
    expect(derived?.status).toBe("unverified");
  });
});

describe("CatalogCompiler — gate de aceptación (Tarea 26.1)", () => {
  it("emite un catálogo con la Matriz de conformidad generada", () => {
    const compiler = createCatalogCompiler();
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("built");
    if (result.kind === "built") {
      expect(result.catalog.conformance).toHaveLength(inventoriedIds().length);
      expect(Object.isFrozen(result.catalog.conformance)).toBe(true);
    }
  });

  it("no emite catálogo cuando falta una entrada de conformidad (fail-closed)", () => {
    const compiler = createCatalogCompiler();
    const base = validCatalog();
    const result = compiler.compile({
      ...base,
      conformance: fullConformance().filter(
        (e) => (e.catalogId as unknown as string) !== PIECE_ID,
      ),
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.errors.some((e) => e.code === "conformance-missing")).toBe(
        true,
      );
    }
  });

  it("no emite catálogo ante una prueba fallida (fail-closed)", () => {
    const compiler = createCatalogCompiler();
    const base = validCatalog();
    const failing = conformanceEntry({
      catalogId: catalogId(PIECE_ID),
      testIds: [`test-${PIECE_ID}`],
      status: "failed",
    });
    const result = compiler.compile({
      ...base,
      conformance: [
        failing,
        ...fullConformance().filter(
          (e) => (e.catalogId as unknown as string) !== PIECE_ID,
        ),
      ],
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.errors.some((e) => e.code === "conformance-failed")).toBe(
        true,
      );
    }
  });
});

describe("CatalogCompiler — segunda revisión visual (req. 30.9, 30.10, 40.4, 40.5)", () => {
  it("conserva revisor, fecha, resultado y Referencia de misión sin páginas del PDF", () => {
    const compiler = createCatalogCompiler();
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("built");
    if (result.kind === "built") {
      expect(result.catalog.visualReviews).toHaveLength(REQUIRED_MISSION_COUNT);
      const review = result.catalog.visualReviews[0];
      expect(review?.reviewerId).toBe("mantenedor-1");
      expect(review?.reviewedAt).toBe("2022-02-02");
      expect(review?.result).toBe("approved");
      expect(review?.missionRef.missionRef).toBe(missionRefOf(1));
      // No se guardan páginas ni capturas del PDF: solo la Referencia de misión.
      expect(Object.keys(review ?? {}).sort()).toEqual(
        ["dp001Status", "missionId", "missionRef", "result", "reviewedAt", "reviewerId"].sort(),
      );
    }
  });

  it("una revisión aprobada sin revisor no es trazable (fail-closed)", () => {
    expect(() =>
      visualReviewRecord({
        missionId: missionId(missionRefOf(1)),
        missionRef: sourceRef({
          page: 17,
          element: "Mapa",
          missionRef: missionRefOf(1),
        }),
        dp001Status: "resolved",
        result: "approved",
        reviewedAt: "2022-02-02",
      }),
    ).toThrow();
  });
});

describe("acceptanceRun — asociación con reglas/Semilla/guardado (req. 31.8)", () => {
  it("asocia cada Partida de aceptación con Versión de reglas, Semilla y Versión de guardado", () => {
    const run = acceptanceRun({
      missionId: missionId(missionRefOf(7)),
      rulesVersion: RV,
      seed: "seed-abc",
      saveVersion: SAVE,
      outcome: "victory",
    });
    expect(run.rulesVersion).toBe(RV);
    expect(run.seed).toBe("seed-abc");
    expect(run.saveVersion).toBe(SAVE);
    expect(run.missionId).toBe(missionRefOf(7));
    expect(Object.isFrozen(run)).toBe(true);
  });

  it("rechaza una Semilla vacía (fail-closed)", () => {
    expect(() =>
      acceptanceRun({
        missionId: missionId(missionRefOf(1)),
        rulesVersion: RV,
        seed: "   ",
        saveVersion: SAVE,
        outcome: "pending",
      }),
    ).toThrow();
  });

  it("el compilador conserva las Partidas de aceptación en el catálogo emitido", () => {
    const compiler = createCatalogCompiler();
    const result = compiler.compile(validCatalog());
    expect(result.kind).toBe("built");
    if (result.kind === "built") {
      expect(result.catalog.acceptanceRuns).toHaveLength(REQUIRED_MISSION_COUNT);
      const run = result.catalog.acceptanceRuns[0];
      expect(run?.rulesVersion).toBe(RV);
      expect(run?.saveVersion).toBe(SAVE);
      expect(typeof run?.seed).toBe("string");
    }
  });
});
