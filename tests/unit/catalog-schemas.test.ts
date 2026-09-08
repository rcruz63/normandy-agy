import { describe, expect, it } from "vitest";
import {
  MAX_MISSION_NUMBER,
  MIN_MISSION_NUMBER,
  InvalidSourceRefError,
  formatMissionNumber,
  isMissionRefString,
  missionMapPage,
  missionRefString,
  missionRulesPage,
  parseMissionNumber,
  sourceRef,
} from "../../src/catalog/schemas/source-ref.js";
import {
  InvalidPublicationDataError,
  blockedStatus,
  conformanceEntry,
  decisionAlternative,
  decisionRecord,
  isPublished,
  licenseEntry,
  publishedStatus,
} from "../../src/catalog/schemas/publication.js";
import {
  DURATION_OPTIONS,
  InvalidCatalogModelError,
  canonicalTable,
  catalogItem,
  missionDefinition,
} from "../../src/catalog/schemas/catalog.js";
import {
  catalogId,
  decisionRef,
  missionId,
  rulesVersion,
} from "../../src/domain/identity/index.js";
import type {
  DeclarativeEffect,
  DeclarativePredicate,
  HexMapDefinition,
  ObjectiveDefinition,
  RevealResult,
  SetupDefinition,
} from "../../src/catalog/schemas/placeholders.js";

/**
 * Verifica el esquema de catálogo y fuente (Tarea 2.1): construcción de
 * `SourceRef` con las páginas `16 + 2(N-1)` / `17 + 2(N-1)`, validación de
 * `N=01..15`, estados de publicación y las invariantes locales de
 * `CatalogItem`, `CanonicalTable` y `MissionDefinition`.
 */

const rv = rulesVersion("rules-1");

describe("cálculo de páginas de Misión (requisito 1.4)", () => {
  it("aplica 16 + 2(N-1) para la Página de reglas", () => {
    expect(missionRulesPage(1)).toBe(16);
    expect(missionRulesPage(2)).toBe(18);
    expect(missionRulesPage(15)).toBe(44);
  });

  it("aplica 17 + 2(N-1) para la Página de Mapa", () => {
    expect(missionMapPage(1)).toBe(17);
    expect(missionMapPage(2)).toBe(19);
    expect(missionMapPage(15)).toBe(45);
  });

  it("la Página de Mapa siempre es la de reglas más uno", () => {
    for (let n = MIN_MISSION_NUMBER; n <= MAX_MISSION_NUMBER; n += 1) {
      expect(missionMapPage(n)).toBe(missionRulesPage(n) + 1);
    }
  });

  it("rechaza números de Misión fuera de 1..15", () => {
    expect(() => missionRulesPage(0)).toThrow(InvalidSourceRefError);
    expect(() => missionRulesPage(16)).toThrow(InvalidSourceRefError);
    expect(() => missionMapPage(1.5)).toThrow(InvalidSourceRefError);
  });
});

describe("Referencia de misión FON-ML-2022-Mnn", () => {
  it("formatea el número con dos dígitos", () => {
    expect(formatMissionNumber(1)).toBe("01");
    expect(formatMissionNumber(15)).toBe("15");
    expect(missionRefString(7)).toBe("FON-ML-2022-M07");
  });

  it("parsea solo referencias válidas 01..15", () => {
    expect(parseMissionNumber("FON-ML-2022-M01")).toBe(1);
    expect(parseMissionNumber("FON-ML-2022-M15")).toBe(15);
    expect(parseMissionNumber("FON-ML-2022-M00")).toBeUndefined();
    expect(parseMissionNumber("FON-ML-2022-M16")).toBeUndefined();
    expect(parseMissionNumber("FON-ML-2022-M1")).toBeUndefined();
    expect(parseMissionNumber("otra-cosa")).toBeUndefined();
  });

  it("isMissionRefString concuerda con parseMissionNumber", () => {
    expect(isMissionRefString("FON-ML-2022-M03")).toBe(true);
    expect(isMissionRefString("FON-ML-2022-M99")).toBe(false);
  });
});

describe("constructor sourceRef", () => {
  it("crea una referencia sin misión con página válida", () => {
    const ref = sourceRef({ page: 5, element: "Terreno" });
    expect(ref.sourceVersion).toBe("FON-ML-2022");
    expect(ref.page).toBe(5);
    expect("missionRef" in ref).toBe(false);
  });

  it("acepta la página de reglas o de Mapa cuando hay missionRef", () => {
    const rules = sourceRef({
      page: 16,
      element: "Reglas M01",
      missionRef: "FON-ML-2022-M01",
    });
    const map = sourceRef({
      page: 17,
      element: "Mapa M01",
      missionRef: "FON-ML-2022-M01",
    });
    expect(rules.missionRef).toBe("FON-ML-2022-M01");
    expect(map.page).toBe(17);
  });

  it("rechaza una página incoherente con la missionRef", () => {
    expect(() =>
      sourceRef({ page: 18, element: "x", missionRef: "FON-ML-2022-M01" }),
    ).toThrow(InvalidSourceRefError);
  });

  it("rechaza páginas no positivas y elementos vacíos", () => {
    expect(() => sourceRef({ page: 0, element: "x" })).toThrow(
      InvalidSourceRefError,
    );
    expect(() => sourceRef({ page: 5, element: "  " })).toThrow(
      InvalidSourceRefError,
    );
  });
});

describe("estados de publicación", () => {
  it("published expone la marca temporal y pasa el guardia", () => {
    const st = publishedStatus("2022-01-01");
    expect(isPublished(st)).toBe(true);
  });

  it("blocked deduplica causas y exige al menos una", () => {
    const st = blockedStatus(["DP-001", "DP-001", "test"]);
    expect(isPublished(st)).toBe(false);
    if (st.kind === "blocked") {
      expect(st.blockers).toEqual(["DP-001", "test"]);
    }
    expect(() => blockedStatus([])).toThrow(InvalidPublicationDataError);
  });
});

describe("decisionRecord", () => {
  it("aprobada requiere exactamente una alternativa elegida y fecha", () => {
    const rec = decisionRecord({
      id: decisionRef("DP-002"),
      status: "approved",
      alternatives: [
        decisionAlternative({ id: "a", summary: "A", chosen: true }),
        decisionAlternative({ id: "b", summary: "B", chosen: false }),
      ],
      approvedAt: "2022-02-02",
    });
    expect(rec.status).toBe("approved");
  });

  it("rechaza aprobada sin alternativa elegida o sin fecha", () => {
    expect(() =>
      decisionRecord({
        id: decisionRef("DP-002"),
        status: "approved",
        alternatives: [decisionAlternative({ id: "a", summary: "A", chosen: false })],
        approvedAt: "2022-02-02",
      }),
    ).toThrow(InvalidPublicationDataError);

    expect(() =>
      decisionRecord({
        id: decisionRef("DP-002"),
        status: "approved",
        alternatives: [decisionAlternative({ id: "a", summary: "A", chosen: true })],
      }),
    ).toThrow(InvalidPublicationDataError);
  });

  it("pending admite ausencia de alternativa elegida", () => {
    const rec = decisionRecord({ id: decisionRef("DP-001"), status: "pending" });
    expect(rec.alternatives).toEqual([]);
    expect("approvedAt" in rec).toBe(false);
  });
});

describe("conformanceEntry y licenseEntry", () => {
  it("conserva estado y trazabilidad", () => {
    const entry = conformanceEntry({
      catalogId: catalogId("regla-1"),
      status: "unverified",
      testIds: ["t1"],
    });
    expect(entry.status).toBe("unverified");
    expect("expected" in entry).toBe(false);
  });

  it("licencia propia omite campos opcionales ausentes", () => {
    const entry = licenseEntry({
      resourceId: "icono-1",
      ownership: "own",
      author: "Raul",
      provenance: "propio",
    });
    expect(entry.ownership).toBe("own");
    expect("license" in entry).toBe(false);
  });

  it("rechaza campos obligatorios vacíos en licencia", () => {
    expect(() =>
      licenseEntry({
        resourceId: "",
        ownership: "own",
        author: "Raul",
        provenance: "propio",
      }),
    ).toThrow(InvalidPublicationDataError);
  });
});

describe("catalogItem y canonicalTable", () => {
  it("catalogItem exige al menos una Referencia de fuente", () => {
    expect(() =>
      catalogItem({
        id: catalogId("x"),
        rulesVersion: rv,
        value: 1,
        sourceRefs: [],
        status: publishedStatus("2022-01-01"),
      }),
    ).toThrow(InvalidCatalogModelError);
  });

  it("canonicalTable exige una fila por entrada del dominio, sin sobrantes", () => {
    const table = canonicalTable<number, string>({
      id: catalogId("tabla-d6"),
      inputDomain: [1, 2, 3, 4, 5, 6],
      rows: [1, 2, 3, 4, 5, 6].map((input) => ({ input, output: `r${input}` })),
    });
    expect(table.rows).toHaveLength(6);

    // Falta la fila para 6.
    expect(() =>
      canonicalTable<number, string>({
        id: catalogId("incompleta"),
        inputDomain: [1, 2, 3, 4, 5, 6],
        rows: [1, 2, 3, 4, 5].map((input) => ({ input, output: `r${input}` })),
      }),
    ).toThrow(InvalidCatalogModelError);

    // Entrada duplicada.
    expect(() =>
      canonicalTable<number, string>({
        id: catalogId("dup"),
        inputDomain: [1, 2],
        rows: [
          { input: 1, output: "a" },
          { input: 1, output: "b" },
        ],
      }),
    ).toThrow(InvalidCatalogModelError);

    // Fila fuera del dominio.
    expect(() =>
      canonicalTable<number, string>({
        id: catalogId("fuera"),
        inputDomain: [1, 2],
        rows: [
          { input: 1, output: "a" },
          { input: 9, output: "b" },
        ],
      }),
    ).toThrow(InvalidCatalogModelError);
  });
});

// Marcadores mínimos de tipos que definen otras tareas, solo para tipar.
const stubObjective = {} as ObjectiveDefinition;
const stubSetup = {} as SetupDefinition;
const stubMap = {} as HexMapDefinition;
const stubPredicate = {} as DeclarativePredicate;
const stubEffect = {} as DeclarativeEffect;
void stubPredicate;
void stubEffect;

function buildRevealTable(missionNumber: number) {
  return canonicalTable<number, RevealResult>({
    id: catalogId(`revelado-M${missionNumber}`),
    inputDomain: [1, 2, 3, 4, 5, 6],
    rows: [1, 2, 3, 4, 5, 6].map((input) => ({
      input,
      output: {} as RevealResult,
    })),
  });
}

describe("missionDefinition", () => {
  it("conserva el nombre es-ES y el título inglés como metadato", () => {
    const mission = missionDefinition({
      id: missionId("M01"),
      number: 1,
      visibleNameEs: "Control del bosque I",
      originalTitle: "Secure the Woods (1)",
      rulesVersion: rv,
      publicationStatus: blockedStatus(["DP-001"]),
      baseTurns: 4,
      objective: stubObjective,
      setup: stubSetup,
      map: stubMap,
      revealTable: buildRevealTable(1),
      sourceRefs: [
        sourceRef({ page: 16, element: "Reglas", missionRef: "FON-ML-2022-M01" }),
        sourceRef({ page: 17, element: "Mapa", missionRef: "FON-ML-2022-M01" }),
      ],
    });
    expect(mission.visibleNameEs).toBe("Control del bosque I");
    expect(mission.maintenanceMetadata.originalTitle).toBe("Secure the Woods (1)");
    expect(mission.durationOptions).toEqual(DURATION_OPTIONS);
  });

  it("exige referencias a la página de reglas y de Mapa de la Misión", () => {
    expect(() =>
      missionDefinition({
        id: missionId("M02"),
        number: 2,
        visibleNameEs: "Control del bosque II",
        originalTitle: "Secure the Woods (2)",
        rulesVersion: rv,
        publicationStatus: blockedStatus(["DP-001"]),
        baseTurns: 5,
        objective: stubObjective,
        setup: stubSetup,
        map: stubMap,
        revealTable: buildRevealTable(2),
        // Solo la página de reglas (18); falta la de Mapa (19).
        sourceRefs: [
          sourceRef({ page: 18, element: "Reglas", missionRef: "FON-ML-2022-M02" }),
        ],
      }),
    ).toThrow(InvalidCatalogModelError);
  });

  it("rechaza número fuera de 1..15 y turnos no positivos", () => {
    expect(() =>
      missionDefinition({
        id: missionId("M99"),
        number: 99,
        visibleNameEs: "x",
        originalTitle: "x",
        rulesVersion: rv,
        publicationStatus: blockedStatus(["DP-001"]),
        baseTurns: 4,
        objective: stubObjective,
        setup: stubSetup,
        map: stubMap,
        revealTable: buildRevealTable(1),
        sourceRefs: [sourceRef({ page: 16, element: "x" })],
      }),
    ).toThrow(InvalidCatalogModelError);
  });
});
