/**
 * Utilidades para la construcción canónica de mapas de 10 hexágonos (Misiones 1 a 6).
 */
import { catalogId } from "../../domain/identity/index.js";
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
import type { MissionId } from "../../domain/identity/index.js";

/** Coordenadas axiales fijas de la retícula de 10 hexágonos (Misiones 1-6). */
export const GRID_10_COORDINATES: readonly { label: string; q: number; r: number }[] = [
  { label: "H01", q: 1, r: 0 },
  { label: "H02", q: 0, r: 1 },
  { label: "H03", q: 2, r: 0 },
  { label: "H04", q: 1, r: 1 },
  { label: "H05", q: 0, r: 2 },
  { label: "H06", q: 2, r: 1 },
  { label: "H07", q: 1, r: 2 },
  { label: "H08", q: 0, r: 3 },
  { label: "H09", q: 2, r: 2 },
  { label: "H10", q: 1, r: 3 },
];

/** 19 adyacencias fijas del grafo de 10 hexágonos. */
export const GRID_10_ADJACENCIES: readonly [number, number][] = [
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 6],
  [4, 5],
  [4, 6],
  [4, 7],
  [5, 7],
  [5, 8],
  [6, 7],
  [6, 9],
  [7, 8],
  [7, 9],
  [7, 10],
  [8, 10],
  [9, 10],
];

export function build10HexMap(options: {
  missionId: MissionId;
  missionNumber: number;
  mapPage: number;
  terrainMap: Record<number, ("bosque" | "edificio" | "colina" | "despejado")[]>;
  entryHexIndices?: number[];
}): HexMapDefinition {
  const prefix = `M${String(options.missionNumber).padStart(2, "0")}`;
  const hexes: Record<HexId, HexDefinition> = {};

  for (let i = 1; i <= 10; i++) {
    const coord = GRID_10_COORDINATES[i - 1]!;
    const id = hexId(`${prefix}-${coord.label}`);
    const terrains = options.terrainMap[i] ?? ["despejado"];
    hexes[id] = hexDefinition({
      id,
      coordinate: { label: coord.label, q: coord.q, r: coord.r },
      terrain: terrains.map((t) => terrainId(t)),
    });
  }

  const edges: HexEdge[] = GRID_10_ADJACENCIES.map(([aNum, bNum]) => {
    const aLabel = `H${String(aNum).padStart(2, "0")}`;
    const bLabel = `H${String(bNum).padStart(2, "0")}`;
    return hexEdge({
      a: hexId(`${prefix}-${aLabel}`),
      b: hexId(`${prefix}-${bLabel}`),
    });
  });

  const entryIndices = options.entryHexIndices ?? [10];
  const entryOptions = entryIndices.map((idx, entryIdx) => {
    const label = `H${String(idx).padStart(2, "0")}`;
    return {
      id: catalogId(`entry-${entryIdx + 1}`),
      hexId: hexId(`${prefix}-${label}`),
      label: `Entrada ${label} (triángulo negro)`,
    };
  });

  return hexMapDefinition({
    missionId: options.missionId,
    hexes: Object.freeze(hexes),
    undirectedEdges: Object.freeze(edges),
    entryOptions: Object.freeze(entryOptions),
    transcriptionReview: visualReview({
      dp001Status: "resolved",
      reviewerId: "rpublico@gmail.com",
      reviewedAt: "2026-09-14T12:00:00.000Z",
      result: "approved",
      missionRef: {
        sourceVersion: "FON-ML-2022",
        page: options.mapPage,
        element: `Mapa Misión ${String(options.missionNumber).padStart(2, "0")}`,
        missionRef: `FON-ML-2022-${prefix}`,
      },
    }),
  });
}
