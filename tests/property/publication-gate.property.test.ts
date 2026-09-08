import { describe, expect, it } from "vitest";
import fc from "fast-check";
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
} from "../../src/domain/identity/index.js";

/**
 * Propiedad 1: Autoridad, trazabilidad y publicación cerrada (Tarea 2.4).
 *
 * El `PublicationGate` es fail-closed: una Misión SOLO se entrega al selector
 * cuando su Mapa tiene Segunda revisión visual aprobada (DP-001) y no existe
 * ningún bloqueo global (DP-002/DP-003 sin resolver, licencia sin permiso,
 * conformidad no aprobada). Cualquier condición pendiente vacía el selector y
 * produce al menos un blocker estructurado; nunca se publica contenido no
 * trazable o no probado.
 */

const RV = rulesVersion("FON-ML-2022-r1");
const stubObjective = {} as ObjectiveDefinition;
const stubSetup = {} as SetupDefinition;
const stubMap = {} as HexMapDefinition;

function refOf(n: number): `FON-ML-2022-M${string}` {
  return `FON-ML-2022-M${String(n).padStart(2, "0")}` as `FON-ML-2022-M${string}`;
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
        missionRef: refOf(n),
      }),
    ],
  });
}

function buildMission(n: number): MissionDefinition {
  const m = refOf(n);
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

function reviewFor(n: number, approved: boolean): VisualReviewRecord {
  const m = refOf(n);
  const mapRef = sourceRef({
    page: 17 + 2 * (n - 1),
    element: "Mapa",
    missionRef: m,
  });
  if (approved) {
    return visualReviewRecord({
      missionId: missionId(m),
      missionRef: mapRef,
      dp001Status: "resolved",
      result: "approved",
      reviewerId: "revisor-2",
      reviewedAt: "2022-02-01",
    });
  }
  return visualReviewRecord({
    missionId: missionId(m),
    missionRef: mapRef,
    dp001Status: "pending",
  });
}

function conformance(approved: boolean): ConformanceEntry {
  return conformanceEntry({
    catalogId: catalogId("regla-1"),
    status: approved ? "approved" : "unverified",
    testIds: ["t1"],
    sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
  });
}

function dp002(resolved: boolean): DecisionRecord {
  if (resolved) {
    return decisionRecord({
      id: decisionRef("DP-002-M01"),
      status: "approved",
      alternatives: [decisionAlternative({ id: "a", summary: "s", chosen: true })],
      sourceRefs: [sourceRef({ page: 5, element: "Reglas generales" })],
      approvedAt: "2022-02-01",
    });
  }
  return decisionRecord({ id: decisionRef("DP-002-M01"), status: "pending" });
}

function license(permitted: boolean): LicenseEntry {
  if (permitted) {
    return licenseEntry({
      resourceId: "recurso-M01",
      ownership: "own",
      author: "Autor propio",
      provenance: "Creación original",
    });
  }
  return licenseEntry({
    resourceId: "recurso-M01",
    ownership: "licensed",
    author: "Terceros",
    provenance: "Distribución externa",
  });
}

// Feature: fields-of-normandy-pwa, Property 1: Autoridad, trazabilidad y publicación cerrada
describe("Property 1: Autoridad, trazabilidad y publicación cerrada", () => {
  it("solo publica cuando TODO está resuelto; cualquier pendiente cierra el selector", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (n, reviewApproved, dp002Resolved, licensePermitted, testApproved) => {
          const catalog: MaintenanceCatalog = {
            rulesVersionCandidate: RV,
            missions: [buildMission(n)],
            pieceTypes: {},
            orderTables: {},
            generalRules: [],
            decisions: [dp002(dp002Resolved)],
            conformance: [conformance(testApproved)],
            licenses: [license(licensePermitted)],
            visualReviews: [reviewFor(n, reviewApproved)],
          };

          const report = createPublicationGate().evaluate(catalog);
          const allClear =
            reviewApproved && dp002Resolved && licensePermitted && testApproved;

          if (allClear) {
            // Autoridad y trazabilidad completas: la Misión llega al selector.
            expect(report.publishableMissionIds).toEqual([missionId(refOf(n))]);
            expect(report.blockers).toEqual([]);
          } else {
            // Publicación cerrada: ninguna Misión y al menos un blocker.
            expect(report.publishableMissionIds).toEqual([]);
            expect(report.blockers.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
