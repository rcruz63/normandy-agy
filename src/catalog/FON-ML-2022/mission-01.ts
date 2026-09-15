/**
 * Transcripción canónica y preparación verificada de la Misión 01:
 * «Control del bosque I» (Secure the Woods (1)).
 *
 * Fuente: FON-ML-2022, páginas 16 (reglas de misión) y 17 (mapa).
 */
import { catalogId, missionId } from "../../domain/identity/index.js";
import {
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  terrainId,
  visualReview,
  type HexDefinition,
  type HexEdge,
  type HexId,
  type HexMapDefinition,
} from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";

// --- Identificador y mapa ---

export const MISSION_01_ID = missionId("FON-ML-2022-M01");

/** Los 10 hexágonos verificados de la Misión 1 (página 17). */
const HEX_SPECS: readonly {
  id: string;
  label: string;
  q: number;
  r: number;
  terrain: ("bosque" | "despejado")[];
}[] = [
  { id: "M01-H01", label: "H01", q: 1, r: 0, terrain: ["bosque"] },
  { id: "M01-H02", label: "H02", q: 0, r: 1, terrain: ["bosque"] },
  { id: "M01-H03", label: "H03", q: 2, r: 0, terrain: ["bosque"] },
  { id: "M01-H04", label: "H04", q: 1, r: 1, terrain: ["bosque"] },
  { id: "M01-H05", label: "H05", q: 0, r: 2, terrain: ["bosque"] },
  { id: "M01-H06", label: "H06", q: 2, r: 1, terrain: ["despejado"] },
  { id: "M01-H07", label: "H07", q: 1, r: 2, terrain: ["despejado"] },
  { id: "M01-H08", label: "H08", q: 0, r: 3, terrain: ["despejado"] },
  { id: "M01-H09", label: "H09", q: 2, r: 2, terrain: ["bosque"] },
  { id: "M01-H10", label: "H10", q: 1, r: 3, terrain: ["despejado"] },
];

export const MISSION_01_HEXES: Record<HexId, HexDefinition> = Object.freeze(
  HEX_SPECS.reduce<Record<HexId, HexDefinition>>((acc, spec) => {
    const id = hexId(spec.id);
    acc[id] = hexDefinition({
      id,
      coordinate: { label: spec.label, q: spec.q, r: spec.r },
      terrain: spec.terrain.map((t) => terrainId(t)),
    });
    return acc;
  }, {}),
);

/** Aristas no dirigidas entre hexágonos adyacentes del mapa de M01. */
const ADJACENCIES: readonly [string, string][] = [
  ["M01-H01", "M01-H02"],
  ["M01-H01", "M01-H03"],
  ["M01-H01", "M01-H04"],
  ["M01-H02", "M01-H04"],
  ["M01-H02", "M01-H05"],
  ["M01-H03", "M01-H04"],
  ["M01-H03", "M01-H06"],
  ["M01-H04", "M01-H05"],
  ["M01-H04", "M01-H06"],
  ["M01-H04", "M01-H07"],
  ["M01-H05", "M01-H07"],
  ["M01-H05", "M01-H08"],
  ["M01-H06", "M01-H07"],
  ["M01-H06", "M01-H09"],
  ["M01-H07", "M01-H08"],
  ["M01-H07", "M01-H09"],
  ["M01-H07", "M01-H10"],
  ["M01-H08", "M01-H10"],
  ["M01-H09", "M01-H10"],
];

export const MISSION_01_EDGES: readonly HexEdge[] = Object.freeze(
  ADJACENCIES.map(([a, b]) => hexEdge({ a: hexId(a), b: hexId(b) })),
);

export const MISSION_01_MAP: HexMapDefinition = hexMapDefinition({
  missionId: MISSION_01_ID,
  hexes: MISSION_01_HEXES,
  undirectedEdges: MISSION_01_EDGES,
  entryOptions: [
    {
      id: catalogId("entry-south"),
      hexId: hexId("M01-H10"),
      label: "Entrada Sur (triángulo negro)",
    },
  ],
  transcriptionReview: visualReview({
    dp001Status: "resolved",
    reviewerId: "rpublico@gmail.com",
    reviewedAt: "2026-09-14T12:00:00.000Z",
    result: "approved",
    missionRef: {
      sourceVersion: "FON-ML-2022",
      page: 17,
      element: "Mapa Misión 01",
      missionRef: "FON-ML-2022-M01",
    },
  }),
});

// --- Preparación inicial (colocación) ---

export const MISSION_01_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M01-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M01-H10",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M01-H04",
    },
  ]),
});
