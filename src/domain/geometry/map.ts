/**
 * Modelo del Mapa hexagonal y su grafo canónico de aristas (Tarea 5.1).
 *
 * Este módulo define las estructuras inmutables del diseño (§ «Geometría y
 * fichas») centradas en la GEOMETRÍA del tablero y sus constructores
 * validadores:
 *
 * - {@link HexDefinition}: un Hexágono con coordenada, terrenos y elementos
 *   impresos (requisitos 4.5, 40.1, 40.2).
 * - {@link HexEdge}: una arista **no dirigida** entre dos Hexágonos con sus
 *   características (Río, puente…). Se almacena **una sola vez** en forma
 *   canónica; la adyacencia recíproca es derivada y la proyecta
 *   `HexGeometry` (Tarea 5.2). No se fabrican aristas por proximidad visual
 *   (requisito 40.2).
 * - {@link EntryOption}: cada posible entrada de preparación; una Página de
 *   Mapa con dos entradas conserva ambas como opciones distintas
 *   (requisito 40.3).
 * - {@link HexMapDefinition}: agrega Hexágonos, aristas canónicas, opciones de
 *   entrada y la revisión de transcripción.
 *
 * Las otras dos abstracciones de la geometría viven en submódulos propios y se
 * reexportan aquí para conservar la superficie pública histórica de este módulo:
 * la Segunda revisión visual/DP-001 en {@link module:geometry/visual-review} y
 * el estado funcional de la Ficha en {@link module:geometry/piece}.
 *
 * Pureza del dominio: no se importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 * Toda coordenada u Orientación que no pueda verificarse visualmente debe
 * quedar en Estado no publicable (véase `VisualReview`).
 */
import type { CatalogId, MissionId } from "../identity/index.js";
import type { EdgeFeatureId, HexId, TerrainId } from "./identifiers.js";
import { isHexId } from "./identifiers.js";
import { InvalidGeometryModelError } from "./geometry-model-error.js";
import type { VisualReview } from "./visual-review.js";

// Reexporta el error y las abstracciones hermanas para que los consumidores que
// históricamente importan desde `./map.js` conserven su superficie pública.
export { InvalidGeometryModelError } from "./geometry-model-error.js";
export type { MissionSourceRef, VisualReview } from "./visual-review.js";
export { visualReview, isMapPublishable } from "./visual-review.js";
export type {
  PieceSide,
  PieceMorale,
  PieceVisibility,
  PieceStatus,
  PieceState,
} from "./piece.js";
export { pieceState } from "./piece.js";

/** Coordenada funcional de un Hexágono (etiqueta legible + par axial q,r). */
export type HexCoordinate = Readonly<{ label: string; q: number; r: number }>;

/** Un Hexágono del mapa con su terreno y elementos impresos. */
export type HexDefinition = Readonly<{
  id: HexId;
  coordinate: HexCoordinate;
  terrain: readonly TerrainId[];
  printedElements: readonly CatalogId[];
}>;

/**
 * Arista no dirigida entre dos Hexágonos.
 *
 * Se almacena en forma canónica (una sola vez); `HexGeometry` proyectará la
 * adyacencia en ambos sentidos. Un Río o puente es característica de la arista,
 * no del Hexágono.
 */
export type HexEdge = Readonly<{
  a: HexId;
  b: HexId;
  features: readonly EdgeFeatureId[];
}>;

/** Una posible entrada de preparación sobre el mapa. */
export type EntryOption = Readonly<{
  id: CatalogId;
  hexId: HexId;
  label: string;
}>;

/** Definición completa e inmutable de un Mapa hexagonal. */
export type HexMapDefinition = Readonly<{
  missionId: MissionId;
  hexes: Readonly<Record<HexId, HexDefinition>>;
  undirectedEdges: readonly HexEdge[];
  entryOptions: readonly EntryOption[];
  transcriptionReview: VisualReview;
}>;

// --- Constructores validadores ---

/** Construye una {@link HexDefinition} inmutable. */
export function hexDefinition(input: {
  id: HexId;
  coordinate: HexCoordinate;
  terrain?: readonly TerrainId[];
  printedElements?: readonly CatalogId[];
}): HexDefinition {
  if (!isHexId(input.id)) {
    throw new InvalidGeometryModelError("id", "el Hexágono requiere un HexId no vacío");
  }
  const { label, q, r } = input.coordinate;
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new InvalidGeometryModelError("coordinate.label", "no puede estar vacío");
  }
  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    throw new InvalidGeometryModelError(
      "coordinate",
      "las coordenadas axiales q y r deben ser números finitos",
    );
  }
  return Object.freeze({
    id: input.id,
    coordinate: Object.freeze({ label, q, r }),
    terrain: Object.freeze([...(input.terrain ?? [])]),
    printedElements: Object.freeze([...(input.printedElements ?? [])]),
  });
}

/**
 * Construye una {@link HexEdge} canónica.
 *
 * Rechaza bucles (`a === b`). No impone un orden entre `a` y `b`: el orden
 * canónico global de la lista de aristas lo garantiza {@link hexMapDefinition}.
 */
export function hexEdge(input: {
  a: HexId;
  b: HexId;
  features?: readonly EdgeFeatureId[];
}): HexEdge {
  if (!isHexId(input.a) || !isHexId(input.b)) {
    throw new InvalidGeometryModelError("a/b", "ambos extremos requieren un HexId no vacío");
  }
  if (input.a === input.b) {
    throw new InvalidGeometryModelError("a/b", "una arista no puede unir un Hexágono consigo mismo");
  }
  return Object.freeze({
    a: input.a,
    b: input.b,
    features: Object.freeze([...(input.features ?? [])]),
  });
}

/** Devuelve una clave canónica no ordenada para una arista (extremos ordenados). */
export function canonicalEdgeKey(a: HexId, b: HexId): string {
  return a <= b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Comprueba que cada entrada de `hexes` esté indexada por su propio id, de modo
 * que la clave del registro y el `id` del Hexágono no puedan divergir.
 */
function assertHexKeysMatchIds(
  hexes: Readonly<Record<HexId, HexDefinition>>,
): void {
  for (const [key, def] of Object.entries(hexes)) {
    if (def.id !== key) {
      throw new InvalidGeometryModelError(
        `hexes.${key}`,
        `la clave debe coincidir con el id del Hexágono («${String(def.id)}»)`,
      );
    }
  }
}

/**
 * Comprueba que las aristas referencien Hexágonos existentes y que no haya
 * aristas recíprocas duplicadas: `{a,b}` y `{b,a}` cuentan como la misma arista.
 */
function assertEdgesValid(
  edges: readonly HexEdge[],
  hexIds: ReadonlySet<string>,
): void {
  const seenEdges = new Set<string>();
  for (const edge of edges) {
    if (!hexIds.has(edge.a) || !hexIds.has(edge.b)) {
      throw new InvalidGeometryModelError(
        "undirectedEdges",
        `la arista {${String(edge.a)},${String(edge.b)}} referencia un Hexágono inexistente`,
      );
    }
    const key = canonicalEdgeKey(edge.a, edge.b);
    if (seenEdges.has(key)) {
      throw new InvalidGeometryModelError(
        "undirectedEdges",
        `arista duplicada entre {${String(edge.a)},${String(edge.b)}}; las aristas se almacenan una sola vez`,
      );
    }
    seenEdges.add(key);
  }
}

/** Comprueba que cada opción de entrada referencie un Hexágono existente. */
function assertEntryOptionsValid(
  entryOptions: readonly EntryOption[],
  hexIds: ReadonlySet<string>,
): void {
  for (const option of entryOptions) {
    if (!hexIds.has(option.hexId)) {
      throw new InvalidGeometryModelError(
        "entryOptions",
        `la entrada «${String(option.id)}» referencia un Hexágono inexistente`,
      );
    }
  }
}

/**
 * Construye una {@link HexMapDefinition} inmutable con aristas canónicas.
 *
 * Invariantes comprobadas:
 * - Cada entrada de `hexes` se indexa por su propio id.
 * - Cada arista referencia Hexágonos existentes y no hay aristas recíprocas
 *   duplicadas (aristas almacenadas una sola vez).
 * - `entryOptions` referencian Hexágonos existentes.
 * - Las aristas se ordenan de forma estable por su clave canónica para que la
 *   representación sea determinista.
 */
export function hexMapDefinition(input: {
  missionId: MissionId;
  hexes: Readonly<Record<HexId, HexDefinition>>;
  undirectedEdges: readonly HexEdge[];
  entryOptions?: readonly EntryOption[];
  transcriptionReview: VisualReview;
}): HexMapDefinition {
  const hexIds = new Set<string>(Object.keys(input.hexes));
  const entryOptions = input.entryOptions ?? [];

  assertHexKeysMatchIds(input.hexes);
  assertEdgesValid(input.undirectedEdges, hexIds);
  assertEntryOptionsValid(entryOptions, hexIds);

  const orderedEdges = [...input.undirectedEdges].sort((left, right) =>
    canonicalEdgeKey(left.a, left.b).localeCompare(canonicalEdgeKey(right.a, right.b)),
  );

  return Object.freeze({
    missionId: input.missionId,
    hexes: Object.freeze({ ...input.hexes }),
    undirectedEdges: Object.freeze(orderedEdges),
    entryOptions: Object.freeze([...entryOptions]),
    transcriptionReview: input.transcriptionReview,
  });
}
