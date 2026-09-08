import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildHexGeometry,
  canonicalEdgeKey,
  directionId,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  visualReview,
  type DirectionId,
  type HexDefinition,
  type HexEdge,
  type HexId,
  type MissionSourceRef,
} from "../../src/domain/geometry/index.js";
import { missionId } from "../../src/domain/identity/index.js";

/**
 * Propiedades de la geometría hexagonal (Tarea 5.3). El generador produce Mapas
 * publicables con un conjunto de Hexágonos y aristas no dirigidas canónicas
 * (almacenadas una sola vez, sin bucles ni duplicados recíprocos), y verifica
 * que `HexGeometry` proyecta adyacencia simétrica, que distancia/ruta/Zona de
 * fuego se calculan solo sobre ese grafo, que no se deducen conexiones fuera
 * del catálogo y que cambiar posición u Orientación recalcula los derivados.
 */

const missionRef: MissionSourceRef = {
  sourceVersion: "FON-ML-2022",
  page: 17,
  element: "Mapa Misión",
  missionRef: "FON-ML-2022-M01",
};

type GeneratedMap = {
  hexIds: HexId[];
  edges: HexEdge[];
  edgeKeys: Set<string>;
};

/** Genera un Mapa: N Hexágonos «h0..hN-1» y un subconjunto de aristas únicas. */
const mapArbitrary = fc
  .integer({ min: 2, max: 8 })
  .chain((count) => {
    const ids = Array.from({ length: count }, (_, i) => `h${i}`);
    // Todas las parejas posibles (i<j) como candidatas a arista.
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        pairs.push([ids[i]!, ids[j]!]);
      }
    }
    return fc
      .subarray(pairs, { minLength: 0, maxLength: pairs.length })
      .map((selected): GeneratedMap => {
        const edgeKeys = new Set<string>();
        const edges: HexEdge[] = [];
        for (const [a, b] of selected) {
          const key = canonicalEdgeKey(hexId(a), hexId(b));
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);
          edges.push(hexEdge({ a: hexId(a), b: hexId(b) }));
        }
        return { hexIds: ids.map((id) => hexId(id)), edges, edgeKeys };
      });
  });

function buildDefinition(gen: GeneratedMap) {
  const hexes: Record<string, HexDefinition> = {};
  gen.hexIds.forEach((id, index) => {
    hexes[id] = hexDefinition({
      id,
      coordinate: { label: String(id).toUpperCase(), q: index, r: 0 },
    });
  });
  return hexMapDefinition({
    missionId: missionId("m01"),
    hexes: hexes as Record<HexId, HexDefinition>,
    undirectedEdges: gen.edges,
    transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
  });
}

describe("propiedades geométricas de HexGeometry", () => {
  // Feature: fields-of-normandy-pwa, Property 8: Integridad geométrica, adyacencia y derivados
  it("adyacencia simétrica, derivados solo sobre el grafo canónico y recálculo al cambiar posición/Orientación", () => {
    fc.assert(
      fc.property(
        mapArbitrary,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 7 }),
        (gen, fromIdx, toIdx) => {
          const geo = buildHexGeometry(buildDefinition(gen));
          const ids = gen.hexIds;
          const from = ids[fromIdx % ids.length]!;
          const to = ids[toIdx % ids.length]!;

          // (1) Adyacencia simétrica y anclada al catálogo: a~b sii {a,b} es arista.
          for (const a of ids) {
            for (const b of ids) {
              const adjacent = geo.areAdjacent(a, b);
              const isEdge = a !== b && gen.edgeKeys.has(canonicalEdgeKey(a, b));
              expect(adjacent).toBe(isEdge);
              // Simetría explícita.
              expect(geo.areAdjacent(a, b)).toBe(geo.areAdjacent(b, a));
            }
            // Ningún Hexágono es adyacente a sí mismo.
            expect(geo.areAdjacent(a, a)).toBe(false);
            // Los vecinos proyectados coinciden exactamente con las aristas.
            for (const n of geo.neighbors(a)) {
              expect(gen.edgeKeys.has(canonicalEdgeKey(a, n))).toBe(true);
            }
          }

          // (2) Distancia y ruta solo sobre el grafo canónico.
          const dist = geo.distance(from, to);
          const route = geo.path(from, to);
          if (from === to) {
            expect(dist).toBe(0);
            expect(route).toEqual([from]);
          } else if (route === undefined) {
            expect(dist).toBe(Number.POSITIVE_INFINITY);
          } else {
            // La ruta empieza/termina en los extremos y su longitud coincide.
            expect(route[0]).toBe(from);
            expect(route[route.length - 1]).toBe(to);
            expect(route.length - 1).toBe(dist);
            // Cada paso es una arista canónica (no hay saltos deducidos).
            for (let i = 0; i + 1 < route.length; i += 1) {
              expect(gen.edgeKeys.has(canonicalEdgeKey(route[i]!, route[i + 1]!))).toBe(true);
            }
            // La distancia es simétrica en un grafo no dirigido.
            expect(geo.distance(to, from)).toBe(dist);
          }

          // (3) La Zona de fuego solo contiene Hexágonos a distancia <= alcance
          //     por el grafo canónico (nunca conexiones fuera del catálogo).
          const range = 3;
          const zone = geo.fireZone(from, { range });
          for (const target of zone) {
            expect(target).not.toBe(from);
            const d = geo.distance(from, target);
            expect(d).toBeLessThanOrEqual(range);
            expect(d).toBeGreaterThanOrEqual(1);
          }
          // Todo vecino directo está en la Zona de fuego radial (alcance >= 1).
          for (const n of geo.neighbors(from)) {
            expect(zone).toContain(n);
          }

          // (4) Recálculo al cambiar Orientación: el arco frontal restringe el
          //     primer salto; misma posición y distinta Orientación => derivados
          //     posiblemente distintos, y siempre subconjunto del radial.
          const neighbors = geo.neighbors(from);
          if (neighbors.length >= 1) {
            const dirA: DirectionId = directionId("A");
            const dirB: DirectionId = directionId("B");
            const directionOf: Record<HexId, DirectionId> = {};
            neighbors.forEach((n, i) => {
              directionOf[n] = i === 0 ? dirA : dirB;
            });
            const facingA = geo.fireZone(from, {
              range: 1,
              arc: { forwardDirections: [dirA], directionOf },
            });
            // El arco frontal es un subconjunto del alcance radial.
            const radial = geo.fireZone(from, { range: 1 });
            for (const t of facingA) {
              expect(radial).toContain(t);
            }
            // Solo el vecino en dirección A queda en el arco frontal de alcance 1.
            expect(facingA).toEqual([neighbors[0]]);

            // (5) Recálculo al cambiar posición: los derivados son función del
            //     origen. Vecinos de `from` != vecinos de un vecino salvo grafo trivial.
            const other = neighbors[0]!;
            expect(geo.neighbors(other)).toContain(from);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
