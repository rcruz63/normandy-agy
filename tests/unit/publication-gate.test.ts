import { describe, expect, it } from "vitest";
import {
  canonicalTable,
  missionDefinition,
  type MissionDefinition,
} from "../../src/catalog/schemas/catalog.js";
import {
  blockedStatus,
  conformanceEntry,
  decisionAlternative,
  decisionRecord,
  licenseEntry,
  visualReviewRecord,
  type ConformanceEntry,
  type DecisionRecord,
  type LicenseEntry,
  type VisualReviewRecord,
} from "../../src/catalog/schemas/publication.js";
import { sourceRef } from "../../src/catalog/schemas/source-ref.js";
import type { MaintenanceCatalog } from "../../src/catalog/schemas/build.js";
import type {
  HexMapDefinition,
  ObjectiveDefinition,
  RevealResult,
  SetupDefinition,
} from "../../src/catalog/schemas/placeholders.js";
import { createPublicationGate } from "../../src/catalog/publication/index.js";
import {
  catalogId,
  decisionRef,
  missionId,
  rulesVersion,
  type MissionId,
} from "../../src/domain/identity/index.js";

/**
 * Verifica el `PublicationGate` fail-closed (Tarea 2.3): agrega DP-001/DP-002/
 * DP-003, Segunda revisión visual, licencias y conformidad y solo entrega al
 * selector las Misiones cuyo contexto completo está resuelto y aprobado.
 */

const RV = rulesVersion("FON-ML-2022-r1");

const stubObjective: ObjectiveDefinition = { kind: "eliminate-all-germans" };
const stubSetup: SetupDefinition = {
  britishStart: [],
  fixedGermanStart: [],
  unknowns: [],
};
const stubMap = {} as HexMapDefinition;

function ref(n: number): string {
  return `FON-ML-2022-M${String(n).padStart(2, "0")}`;
}

function revealTableFor(n: number) {
  return canonicalTable<number, RevealResult>({
    id: catalogId(`reveal-M${String(n).padStart(2, "0")}`),
    inputDomain: [1, 2, 3, 4, 5, 6],
    rows: [1, 2, 3, 4, 5, 6].map((input) => ({
      input,
      output: "LMG" as RevealResult,
    })),
    sourceRefs: [
      sourceRef({
        page: 16 + 2 * (n - 1),
        element: "Tabla de revelado",
        missionRef: ref(n) as `FON-ML-2022-M${string}`,
      }),
    ],
  });
}

function buildMission(n: number): MissionDefinition {
  const m = ref(n) as `FON-ML-2022-M${string}`;
  return missionDefinition({
    id: missionId(m),
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
      sourceRef({ page: 16 + 2 * (n - 1), element: "Reglas", missionRef: m }),
      sourceRef({ page: 17 + 2 * (n - 1), element: "Mapa", missionRef: m }),
    ],
  });
}

/** Revisión visual aprobada para la Misión `n`. */
function approvedReview(n: number): VisualReviewRecord {
  const m = ref(n) as `FON-ML-2022-M${string}`;
  return visualReviewRecord({
    missionId: missionId(m),
    missionRef: sourceRef({ page: 17 + 2 * (n - 1), element: "Mapa", missionRef: m }),
    dp001Status: "resolved",
    result: "approved",
    reviewerId: "revisor-2",
    reviewedAt: "2022-02-01",
  });
}

/** Conformidad aprobada de un elemento. */
function approvedConformance(id: string): ConformanceEntry {
  return conformanceEntry({
    catalogId: catalogId(id),
    testIds: ["t1"],
    status: "approved",
    sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
  });
}

/** Decisión DP aprobada. */
function approvedDecision(id: string): DecisionRecord {
  return decisionRecord({
    id: decisionRef(id),
    status: "approved",
    alternatives: [
      decisionAlternative({ id: "a1", summary: "elegida", chosen: true }),
    ],
    sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
    approvedAt: "2022-02-01",
  });
}

/** Licencia de recurso propio (sin permiso requerido). */
function ownLicense(id: string): LicenseEntry {
  return licenseEntry({
    resourceId: id,
    ownership: "own",
    author: "Autor propio",
    provenance: "Creación original",
  });
}

/** Catálogo mínimo publicable: una Misión, con revisión aprobada. */
function publishableCatalog(): MaintenanceCatalog {
  return {
    rulesVersionCandidate: RV,
    missions: [buildMission(1)],
    pieceTypes: {},
    orderTables: {},
    generalRules: [],
    decisions: [approvedDecision("DP-001-M01"), approvedDecision("DP-002-M01")],
    conformance: [approvedConformance("regla-1")],
    licenses: [ownLicense("mapa-propio-M01")],
    visualReviews: [approvedReview(1)],
  };
}

describe("PublicationGate — Misión publicable", () => {
  it("entrega al selector una Misión con todo resuelto y aprobado", () => {
    const report = createPublicationGate().evaluate(publishableCatalog());
    expect(report.publishableMissionIds).toEqual([missionId(ref(1))]);
    expect(report.blockers).toEqual([]);
    expect(report.rulesVersionCandidate).toBe("FON-ML-2022-r1");
  });

  it("el informe es inmutable", () => {
    const report = createPublicationGate().evaluate(publishableCatalog());
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.publishableMissionIds)).toBe(true);
    expect(Object.isFrozen(report.blockers)).toBe(true);
  });
});

describe("PublicationGate — bloqueo por DP-001 / revisión visual", () => {
  it("bloquea una Misión sin Segunda revisión visual", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = { ...base, visualReviews: [] };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(report.blockers.some((b) => b.kind === "DP-001")).toBe(true);
  });

  it("bloquea si la revisión existe pero no está aprobada", () => {
    const base = publishableCatalog();
    const m = ref(1) as `FON-ML-2022-M${string}`;
    const pending = visualReviewRecord({
      missionId: missionId(m),
      missionRef: sourceRef({ page: 17, element: "Mapa", missionRef: m }),
      dp001Status: "pending",
    });
    const catalog: MaintenanceCatalog = { ...base, visualReviews: [pending] };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(report.blockers.some((b) => b.kind === "DP-001")).toBe(true);
  });

  it("bloquea si una decisión DP-001 del Registro no está resuelta", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      decisions: [
        decisionRecord({ id: decisionRef("DP-001-M01"), status: "pending" }),
        approvedDecision("DP-002-M01"),
      ],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(
      report.blockers.some(
        (b) => b.kind === "DP-001" && b.decisionId === "DP-001-M01",
      ),
    ).toBe(true);
  });
});

describe("PublicationGate — bloqueo por DP-002", () => {
  it("bloquea todo el contenido dependiente si DP-002 está pendiente", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      decisions: [
        approvedDecision("DP-001-M01"),
        decisionRecord({ id: decisionRef("DP-002-M01"), status: "pending" }),
      ],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(report.blockers.some((b) => b.kind === "DP-002")).toBe(true);
  });
});

describe("PublicationGate — bloqueo por DP-003 / licencias", () => {
  it("bloquea un recurso licenciado sin permiso concreto documentado", () => {
    const base = publishableCatalog();
    const licensedNoPermit = licenseEntry({
      resourceId: "tipografia-X",
      ownership: "licensed",
      author: "Terceros",
      provenance: "Distribución externa",
    });
    const catalog: MaintenanceCatalog = {
      ...base,
      licenses: [licensedNoPermit],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(
      report.blockers.some(
        (b) => b.kind === "DP-003" && b.resourceId === "tipografia-X",
      ),
    ).toBe(true);
  });

  it("no bloquea un recurso propio", () => {
    const report = createPublicationGate().evaluate(publishableCatalog());
    expect(report.blockers.some((b) => b.kind === "DP-003")).toBe(false);
  });

  it("bloquea si una decisión DP-003 no está resuelta", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      decisions: [
        approvedDecision("DP-001-M01"),
        approvedDecision("DP-002-M01"),
        decisionRecord({ id: decisionRef("DP-003-fuente"), status: "pending" }),
      ],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(report.blockers.some((b) => b.kind === "DP-003")).toBe(true);
  });
});

describe("PublicationGate — bloqueo por prueba/conformidad", () => {
  it("bloquea un elemento con conformidad no verificada", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [
        conformanceEntry({
          catalogId: catalogId("regla-1"),
          status: "unverified",
          sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
        }),
      ],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(
      report.blockers.some(
        (b) => b.kind === "test" && b.catalogId === catalogId("regla-1"),
      ),
    ).toBe(true);
  });

  it("bloquea un elemento con prueba fallida", () => {
    const base = publishableCatalog();
    const catalog: MaintenanceCatalog = {
      ...base,
      conformance: [
        conformanceEntry({
          catalogId: catalogId("regla-1"),
          status: "failed",
          sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
        }),
      ],
    };
    const report = createPublicationGate().evaluate(catalog);
    expect(report.publishableMissionIds).toEqual([]);
    expect(report.blockers.some((b) => b.kind === "test")).toBe(true);
  });

  it("expone la Matriz de conformidad considerada en inventoryCoverage", () => {
    const report = createPublicationGate().evaluate(publishableCatalog());
    expect(report.inventoryCoverage).toHaveLength(1);
    expect(report.inventoryCoverage[0]?.status).toBe("approved");
  });
});

describe("PublicationGate — no muta la entrada", () => {
  it("no altera el catálogo evaluado", () => {
    const input = publishableCatalog();
    const missionsBefore = input.missions.length;
    createPublicationGate().evaluate(input);
    expect(input.missions.length).toBe(missionsBefore);
  });

  it("publica solo las Misiones cuyo Mapa pasó revisión", () => {
    const base = publishableCatalog();
    const missions = [buildMission(1), buildMission(2)];
    const catalog: MaintenanceCatalog = {
      ...base,
      missions,
      // Solo la Misión 1 tiene revisión aprobada.
      visualReviews: [approvedReview(1)],
    };
    const report = createPublicationGate().evaluate(catalog);
    const ids: readonly MissionId[] = report.publishableMissionIds;
    expect(ids).toEqual([missionId(ref(1))]);
  });
});
