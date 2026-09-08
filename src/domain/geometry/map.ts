/**
 * Modelos de Mapa hexagonal, Segunda revisión visual y Ficha (Tarea 5.1).
 *
 * Este módulo define las estructuras inmutables del diseño (§ «Geometría y
 * fichas») y sus constructores validadores:
 *
 * - {@link HexDefinition}: un Hexágono con coordenada, terrenos y elementos
 *   impresos (requisitos 4.5, 40.1, 40.2).
 * - {@link HexEdge}: una arista **no dirigida** entre dos Hexágonos con sus
 *   características (Río, puente…). Se almacena **una sola vez** en forma
 *   canónica; la adyacencia recíproca es derivada y la proyecta
 *   `HexGeometry` (Tarea 5.2). No se fabrican aristas por proximidad visual
 *   (requisito 40.2).
 * - {@link VisualReview}: modela la Segunda revisión visual y el estado de
 *   DP-001 que condiciona la publicación del mapa (requisitos 40.4, 40.13),
 *   sin hornear posiciones ni Orientaciones derivadas del PDF.
 * - {@link EntryOption}: cada posible entrada de preparación; una Página de
 *   Mapa con dos entradas conserva ambas como opciones distintas
 *   (requisito 40.3).
 * - {@link HexMapDefinition}: agrega Hexágonos, aristas canónicas, opciones de
 *   entrada y la revisión de transcripción.
 * - {@link PieceState}: el estado funcional de una Ficha (bando, Hexágono,
 *   Orientación, Moral, Cobertura, visibilidad y estado).
 *
 * Pureza del dominio: no se importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 * Toda coordenada u Orientación que no pueda verificarse visualmente debe
 * quedar en Estado no publicable; aquí eso se refleja manteniendo
 * `VisualReview.dp001Status = "pending"` (o `result` distinto de `"approved"`),
 * de modo que capas superiores bloqueen la publicación (requisito 40.6/40.13).
 */
import type { CatalogId, MissionId } from "../identity/index.js";
import type {
  DirectionId,
  EdgeFeatureId,
  HexId,
  PieceId,
  TerrainId,
} from "./identifiers.js";
import { isHexId } from "./identifiers.js";

/**
 * Referencia de misión estructural usada por {@link VisualReview}.
 *
 * Espeja la forma de la `SourceRef` canónica (definida en el catálogo) sin
 * crear una dependencia del dominio hacia el catálogo. El cableado con la
 * `SourceRef` oficial se hará en una tarea posterior de puertos.
 */
export type MissionSourceRef = Readonly<{
  sourceVersion: string;
  page: number;
  element: string;
  missionRef?: string;
}>;

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

/**
 * Segunda revisión visual y estado de la decisión DP-001 de un mapa.
 *
 * `dp001Status = "pending"` o la ausencia/rechazo de `result` mantienen el
 * mapa en Estado no publicable. `missionRef` localiza el elemento revisado en
 * la Fuente lúdica.
 */
export type VisualReview = Readonly<{
  dp001Status: "pending" | "resolved";
  reviewerId?: string;
  reviewedAt?: string;
  missionRef: MissionSourceRef;
  result?: "approved" | "failed";
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

/** Estado funcional de una Ficha (contador) colocada en la Partida. */
export type PieceState = Readonly<{
  id: PieceId;
  definitionId: CatalogId;
  side: "british" | "german" | "neutral";
  hexId?: HexId;
  orientation?: DirectionId;
  morale?: "normal" | "low";
  cover: number;
  visibility: "hidden" | "revealed";
  status: "active" | "eliminated";
}>;

/** Error lanzado por los constructores de este módulo ante datos inválidos. */
export class InvalidGeometryModelError extends Error {
  public readonly field: string;
  public readonly detail: string;

  public constructor(field: string, detail: string) {
    super(`Modelo de geometría inválido en «${field}»: ${detail}.`);
    this.name = "InvalidGeometryModelError";
    this.field = field;
    this.detail = detail;
  }
}

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

/** Construye una {@link VisualReview} validando su coherencia. */
export function visualReview(input: {
  dp001Status: "pending" | "resolved";
  missionRef: MissionSourceRef;
  reviewerId?: string;
  reviewedAt?: string;
  result?: "approved" | "failed";
}): VisualReview {
  if (input.dp001Status !== "pending" && input.dp001Status !== "resolved") {
    throw new InvalidGeometryModelError("dp001Status", "debe ser «pending» o «resolved»");
  }
  if (input.missionRef === undefined || input.missionRef === null) {
    throw new InvalidGeometryModelError("missionRef", "la revisión requiere una Referencia de misión");
  }
  // Una revisión aprobada exige revisor y fecha, y DP-001 resuelto: una
  // aprobación sin trazabilidad no puede publicar el mapa (req. 40.4/40.5).
  if (input.result === "approved") {
    if (input.dp001Status !== "resolved") {
      throw new InvalidGeometryModelError(
        "result",
        "no puede aprobarse mientras DP-001 esté pendiente",
      );
    }
    if (input.reviewerId === undefined || input.reviewerId.trim().length === 0) {
      throw new InvalidGeometryModelError("reviewerId", "una revisión aprobada requiere revisor");
    }
    if (input.reviewedAt === undefined || input.reviewedAt.trim().length === 0) {
      throw new InvalidGeometryModelError("reviewedAt", "una revisión aprobada requiere fecha");
    }
  }
  const base: {
    dp001Status: "pending" | "resolved";
    missionRef: MissionSourceRef;
    reviewerId?: string;
    reviewedAt?: string;
    result?: "approved" | "failed";
  } = {
    dp001Status: input.dp001Status,
    missionRef: Object.freeze({ ...input.missionRef }),
  };
  if (input.reviewerId !== undefined) base.reviewerId = input.reviewerId;
  if (input.reviewedAt !== undefined) base.reviewedAt = input.reviewedAt;
  if (input.result !== undefined) base.result = input.result;
  return Object.freeze(base);
}

/**
 * Indica si un mapa ha superado la Segunda revisión visual y puede publicarse
 * (requisito 40.13). No decide por sí mismo la publicación: es un predicado que
 * las capas de publicación consumen.
 */
export function isMapPublishable(review: VisualReview): boolean {
  return review.dp001Status === "resolved" && review.result === "approved";
}

/**
 * Construye una {@link HexMapDefinition} inmutable con aristas canónicas.
 *
 * Invariantes comprobadas:
 * - Cada arista referencia Hexágonos existentes en `hexes`.
 * - No hay aristas recíprocas duplicadas: `{a,b}` y `{b,a}` cuentan como la
 *   misma arista y se rechazan (aristas almacenadas una sola vez).
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

  // Cada entrada de `hexes` debe estar indexada por su propio id.
  for (const [key, def] of Object.entries(input.hexes)) {
    if (def.id !== key) {
      throw new InvalidGeometryModelError(
        `hexes.${key}`,
        `la clave debe coincidir con el id del Hexágono («${String(def.id)}»)`,
      );
    }
  }

  const seenEdges = new Set<string>();
  for (const edge of input.undirectedEdges) {
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

  const entryOptions = input.entryOptions ?? [];
  for (const option of entryOptions) {
    if (!hexIds.has(option.hexId)) {
      throw new InvalidGeometryModelError(
        "entryOptions",
        `la entrada «${String(option.id)}» referencia un Hexágono inexistente`,
      );
    }
  }

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

/** Construye un {@link PieceState} inmutable validando sus invariantes. */
export function pieceState(input: {
  id: PieceId;
  definitionId: CatalogId;
  side: "british" | "german" | "neutral";
  hexId?: HexId;
  orientation?: DirectionId;
  morale?: "normal" | "low";
  cover?: number;
  visibility?: "hidden" | "revealed";
  status?: "active" | "eliminated";
}): PieceState {
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new InvalidGeometryModelError("id", "la Ficha requiere un PieceId no vacío");
  }
  if (typeof input.definitionId !== "string" || input.definitionId.trim().length === 0) {
    throw new InvalidGeometryModelError("definitionId", "la Ficha requiere un CatalogId no vacío");
  }
  if (input.side !== "british" && input.side !== "german" && input.side !== "neutral") {
    throw new InvalidGeometryModelError("side", "debe ser «british», «german» o «neutral»");
  }
  const cover = input.cover ?? 0;
  if (!Number.isInteger(cover) || cover < 0) {
    throw new InvalidGeometryModelError("cover", "la Cobertura debe ser un entero no negativo");
  }
  const base: {
    id: PieceId;
    definitionId: CatalogId;
    side: "british" | "german" | "neutral";
    hexId?: HexId;
    orientation?: DirectionId;
    morale?: "normal" | "low";
    cover: number;
    visibility: "hidden" | "revealed";
    status: "active" | "eliminated";
  } = {
    id: input.id,
    definitionId: input.definitionId,
    side: input.side,
    cover,
    visibility: input.visibility ?? "hidden",
    status: input.status ?? "active",
  };
  if (input.hexId !== undefined) base.hexId = input.hexId;
  if (input.orientation !== undefined) base.orientation = input.orientation;
  if (input.morale !== undefined) base.morale = input.morale;
  return Object.freeze(base);
}
