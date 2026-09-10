/**
 * Proyección del Mapa hexagonal a SVG responsive y capa semántica sincronizada
 * (Tarea 20.3).
 *
 * El diseño (§ «Interacción y presentación del mapa») fija: «El mapa propio usa
 * SVG responsive para geometría y una lista/árbol semántico sincronizado para
 * nombres accesibles». Este módulo transforma los **Datos canónicos del
 * Catálogo** ({@link HexMapDefinition} + {@link HexGeometry}) en:
 *
 * - {@link SvgScene}: una escena vectorial serializable (polígonos de Hexágono,
 *   aristas y Fichas) con un `viewBox` que hace el SVG responsive.
 * - {@link SemanticNode}[]: una capa semántica equivalente (lista/árbol de
 *   nombres accesibles en es-ES) sincronizada uno a uno con la escena.
 * - {@link renderSvgMarkup}: emite la cadena SVG a partir de la escena y del
 *   {@link ViewState} (aplica zoom/paneo como transformación del lienzo).
 *
 * Reglas y requisitos:
 * - Los datos geométricos proceden **exclusivamente del Catálogo**, nunca de
 *   imágenes del PDF (requisitos 40.7, 40.11, 40.12). Aquí solo se proyectan
 *   las coordenadas axiales `(q, r)` y las aristas canónicas del mapa; no se
 *   deduce ninguna adyacencia por proximidad (la aporta {@link HexGeometry}).
 * - Se conserva de forma funcionalmente equivalente terreno, topología,
 *   posición y Orientación (requisitos 30.8, 40.10, 40.11): cada Hexágono lleva
 *   su terreno y etiqueta; cada arista une exactamente los Hexágonos del
 *   grafo canónico; cada Ficha lleva bando, estado, Orientación y visibilidad.
 * - Estado, bando, Orientación, terreno y selección se codifican con
 *   texto/forma/patrón además de color: por eso la escena expone `classes`
 *   semánticas y la capa semántica describe todo en texto es-ES (requisito
 *   25.1). Los colores concretos son responsabilidad de la hoja de estilos.
 * - El zoom/paneo del {@link ViewState} se aplican como transformación del
 *   grupo raíz; la selección se refleja marcando el nodo correspondiente. Nada
 *   de esto toca el `GameState` (requisitos 24.6, 24.7, 24.8, 24.9).
 *
 * Pureza y frontera: pertenece a `ui/`, que solo transforma proyecciones. No
 * usa DOM ni red: `renderSvgMarkup` produce una cadena que un renderizador
 * externo inserta. Es determinista y ordena sus elementos por identificador
 * para que la salida sea estable.
 */
import type {
  HexGeometry,
  HexId,
  HexMapDefinition,
  PieceState,
} from "../../domain/geometry/index.js";
import type { ViewSelection, ViewState } from "./view-state.js";

/** Punto en el plano del lienzo del mapa (unidades SVG). */
export type Point = Readonly<{ x: number; y: number }>;

/** Rectángulo `viewBox` del SVG (origen y tamaño en unidades del lienzo). */
export type ViewBox = Readonly<{
  minX: number;
  minY: number;
  width: number;
  height: number;
}>;

/** Métricas de proyección de la retícula hexagonal (flat-top). */
export type HexMetrics = Readonly<{
  /** Radio del Hexágono en unidades del lienzo (distancia centro→vértice). */
  size: number;
  /** Margen alrededor del contenido para el `viewBox`. */
  padding: number;
}>;

/** Métricas por defecto de la retícula. */
export const DEFAULT_HEX_METRICS: HexMetrics = Object.freeze({
  size: 32,
  padding: 16,
});

/** Polígono de un Hexágono proyectado, con su terreno y etiqueta. */
export type HexPolygon = Readonly<{
  hexId: HexId;
  label: string;
  center: Point;
  /** Los seis vértices del Hexágono, en orden. */
  vertices: readonly Point[];
  terrain: readonly string[];
  /** Clases semánticas para codificar terreno/selección sin depender del color. */
  classes: readonly string[];
  selected: boolean;
}>;

/** Segmento de arista canónica proyectado entre los centros de dos Hexágonos. */
export type EdgeSegment = Readonly<{
  a: HexId;
  b: HexId;
  from: Point;
  to: Point;
  features: readonly string[];
  classes: readonly string[];
}>;

/** Marcador de Ficha proyectado sobre su Hexágono. */
export type PieceMarker = Readonly<{
  pieceId: string;
  hexId: HexId;
  center: Point;
  side: PieceState["side"];
  status: PieceState["status"];
  visibility: PieceState["visibility"];
  orientation?: string;
  classes: readonly string[];
  selected: boolean;
}>;

/**
 * Escena vectorial completa y su `viewBox`. Es la representación geométrica del
 * mapa; se renderiza con {@link renderSvgMarkup}.
 */
export type SvgScene = Readonly<{
  viewBox: ViewBox;
  hexes: readonly HexPolygon[];
  edges: readonly EdgeSegment[];
  pieces: readonly PieceMarker[];
}>;

/** Un nodo de la capa semántica, equivalente a un elemento de la escena. */
export type SemanticNode = Readonly<{
  /** Identificador del elemento representado (Hexágono o Ficha). */
  refId: string;
  kind: "hex" | "piece";
  /** Nombre accesible en es-ES. */
  accessibleName: string;
  selected: boolean;
  /** Referencias a nodos hijos (p. ej. Fichas situadas sobre un Hexágono). */
  childRefIds: readonly string[];
}>;

/** Error lanzado ante datos de proyección incoherentes. */
export class InvalidMapProjectionError extends Error {
  public readonly detail: string;

  public constructor(detail: string) {
    super(`Proyección de mapa inválida: ${detail}.`);
    this.name = "InvalidMapProjectionError";
    this.detail = detail;
  }
}

/**
 * Centro de un Hexágono flat-top a partir de sus coordenadas axiales `(q, r)`.
 * Fórmula estándar de retícula hexagonal; la geometría proviene del Catálogo.
 */
function axialToPoint(q: number, r: number, size: number): Point {
  const x = size * (3 / 2) * q;
  const y = size * Math.sqrt(3) * (r + q / 2);
  return { x, y };
}

/** Los seis vértices de un Hexágono flat-top centrado en `center`. */
function hexVertices(center: Point, size: number): readonly Point[] {
  const vertices: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i);
    vertices.push(
      Object.freeze({
        x: round(center.x + size * Math.cos(angle)),
        y: round(center.y + size * Math.sin(angle)),
      }),
    );
  }
  return Object.freeze(vertices);
}

/** Redondea a 3 decimales para una salida SVG estable y compacta. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isSelectedHex(selection: ViewSelection, hexId: HexId): boolean {
  return selection.hexId !== undefined && selection.hexId === hexId;
}

/**
 * Proyecta un {@link HexMapDefinition} y sus Fichas a una {@link SvgScene}.
 *
 * @param map Mapa canónico del Catálogo (coordenadas y aristas verificadas).
 * @param geometry Geometría derivada del mismo mapa; se usa para validar que
 *   las aristas proyectadas pertenecen al grafo canónico (no se inventan).
 * @param pieces Fichas a situar; cada una debe referenciar un Hexágono del mapa.
 * @param selection Selección de UI actual (para marcar el elemento elegido).
 * @param metrics Métricas de la retícula (radio y margen).
 */
export function projectMapToSvg(
  map: HexMapDefinition,
  geometry: HexGeometry,
  pieces: readonly PieceState[],
  selection: ViewSelection,
  metrics: HexMetrics = DEFAULT_HEX_METRICS,
): SvgScene {
  if (metrics.size <= 0 || !Number.isFinite(metrics.size)) {
    throw new InvalidMapProjectionError("el radio del Hexágono debe ser positivo");
  }

  const centers = new Map<HexId, Point>();
  const hexEntries = Object.values(map.hexes).sort((a, b) =>
    String(a.id).localeCompare(String(b.id)),
  );

  const hexes: HexPolygon[] = hexEntries.map((hex) => {
    const center = axialToPoint(hex.coordinate.q, hex.coordinate.r, metrics.size);
    const rounded = Object.freeze({ x: round(center.x), y: round(center.y) });
    centers.set(hex.id, rounded);
    const terrain = hex.terrain.map((t) => String(t));
    const selected = isSelectedHex(selection, hex.id);
    const classes = [
      "hex",
      ...terrain.map((t) => `terrain-${t}`),
      ...(selected ? ["selected"] : []),
    ];
    return Object.freeze({
      hexId: hex.id,
      label: hex.coordinate.label,
      center: rounded,
      vertices: hexVertices(rounded, metrics.size),
      terrain: Object.freeze(terrain),
      classes: Object.freeze(classes),
      selected,
    });
  });

  // Aristas canónicas: se proyectan tal cual las almacena el Catálogo y se
  // comprueba que pertenecen al grafo (adyacencia canónica), sin deducir
  // ninguna conexión por proximidad de coordenadas.
  const edges: EdgeSegment[] = map.undirectedEdges.map((edge) => {
    const from = centers.get(edge.a);
    const to = centers.get(edge.b);
    if (from === undefined || to === undefined) {
      throw new InvalidMapProjectionError(
        `la arista {${String(edge.a)},${String(edge.b)}} referencia un Hexágono ausente en la escena`,
      );
    }
    if (!geometry.areAdjacent(edge.a, edge.b)) {
      throw new InvalidMapProjectionError(
        `la arista {${String(edge.a)},${String(edge.b)}} no pertenece al grafo canónico`,
      );
    }
    const features = edge.features.map((f) => String(f));
    return Object.freeze({
      a: edge.a,
      b: edge.b,
      from,
      to,
      features: Object.freeze(features),
      classes: Object.freeze(["edge", ...features.map((f) => `feature-${f}`)]),
    });
  });

  const pieceMarkers: PieceMarker[] = [...pieces]
    .filter((piece) => piece.hexId !== undefined)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((piece) => {
      const hexId = piece.hexId as HexId;
      const center = centers.get(hexId);
      if (center === undefined) {
        throw new InvalidMapProjectionError(
          `la Ficha «${String(piece.id)}» ocupa el Hexágono «${String(hexId)}» ausente del mapa`,
        );
      }
      const selected =
        selection.pieceId !== undefined && String(selection.pieceId) === String(piece.id);
      const classes = [
        "piece",
        `side-${piece.side}`,
        `status-${piece.status}`,
        `visibility-${piece.visibility}`,
        ...(piece.orientation !== undefined ? [`orientation-${String(piece.orientation)}`] : []),
        ...(selected ? ["selected"] : []),
      ];
      const base: {
        pieceId: string;
        hexId: HexId;
        center: Point;
        side: PieceState["side"];
        status: PieceState["status"];
        visibility: PieceState["visibility"];
        orientation?: string;
        classes: readonly string[];
        selected: boolean;
      } = {
        pieceId: String(piece.id),
        hexId,
        center,
        side: piece.side,
        status: piece.status,
        visibility: piece.visibility,
        classes: Object.freeze(classes),
        selected,
      };
      if (piece.orientation !== undefined) base.orientation = String(piece.orientation);
      return Object.freeze(base);
    });

  const viewBox = computeViewBox(hexes, metrics);

  return Object.freeze({
    viewBox,
    hexes: Object.freeze(hexes),
    edges: Object.freeze(edges),
    pieces: Object.freeze(pieceMarkers),
  });
}

/**
 * Calcula el `viewBox` que engloba todos los vértices con un margen. Un mapa
 * vacío recibe un `viewBox` unitario neutro para no producir un SVG inválido.
 */
function computeViewBox(hexes: readonly HexPolygon[], metrics: HexMetrics): ViewBox {
  if (hexes.length === 0) {
    return Object.freeze({ minX: 0, minY: 0, width: 1, height: 1 });
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const hex of hexes) {
    for (const v of hex.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
  }
  const pad = metrics.padding;
  return Object.freeze({
    minX: round(minX - pad),
    minY: round(minY - pad),
    width: round(maxX - minX + pad * 2),
    height: round(maxY - minY + pad * 2),
  });
}

/**
 * Construye la capa semántica sincronizada con la escena: un nodo por Hexágono
 * y un nodo por Ficha, con nombre accesible en es-ES y las Fichas anidadas como
 * hijas de su Hexágono. Es la representación textual equivalente al SVG.
 */
export function buildSemanticLayer(scene: SvgScene): readonly SemanticNode[] {
  const piecesByHex = new Map<string, PieceMarker[]>();
  for (const piece of scene.pieces) {
    const key = String(piece.hexId);
    const list = piecesByHex.get(key) ?? [];
    list.push(piece);
    piecesByHex.set(key, list);
  }

  const nodes: SemanticNode[] = [];
  for (const hex of scene.hexes) {
    const children = piecesByHex.get(String(hex.hexId)) ?? [];
    nodes.push(
      Object.freeze({
        refId: String(hex.hexId),
        kind: "hex",
        accessibleName: hexAccessibleName(hex),
        selected: hex.selected,
        childRefIds: Object.freeze(children.map((c) => c.pieceId)),
      }),
    );
    for (const piece of children) {
      nodes.push(
        Object.freeze({
          refId: piece.pieceId,
          kind: "piece",
          accessibleName: pieceAccessibleName(piece, hex),
          selected: piece.selected,
          childRefIds: Object.freeze([]),
        }),
      );
    }
  }
  return Object.freeze(nodes);
}

const SIDE_ES: Readonly<Record<PieceState["side"], string>> = Object.freeze({
  british: "británica",
  german: "alemana",
  neutral: "neutral",
});

const STATUS_ES: Readonly<Record<PieceState["status"], string>> = Object.freeze({
  active: "activa",
  eliminated: "eliminada",
});

const VISIBILITY_ES: Readonly<Record<PieceState["visibility"], string>> = Object.freeze({
  hidden: "oculta",
  revealed: "revelada",
});

function hexAccessibleName(hex: HexPolygon): string {
  const terrain =
    hex.terrain.length > 0 ? `, terreno ${hex.terrain.join(", ")}` : ", sin terreno especial";
  const sel = hex.selected ? " (seleccionado)" : "";
  return `Hexágono ${hex.label}${terrain}${sel}`;
}

function pieceAccessibleName(piece: PieceMarker, hex: HexPolygon): string {
  const orientation =
    piece.orientation !== undefined ? `, orientación ${piece.orientation}` : "";
  const sel = piece.selected ? " (seleccionada)" : "";
  return `Ficha ${SIDE_ES[piece.side]} ${STATUS_ES[piece.status]}, ${VISIBILITY_ES[piece.visibility]}${orientation}, en Hexágono ${hex.label}${sel}`;
}

// --- Serialización SVG ---

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pointsAttr(vertices: readonly Point[]): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(" ");
}

/**
 * Emite la cadena SVG de la escena aplicando el {@link ViewState}.
 *
 * El SVG es responsive: usa `viewBox` y `width="100%" height="100%"` y
 * `preserveAspectRatio` para adaptarse al contenedor sin depender de un tamaño
 * fijo (requisitos 24.7, 24.8, 24.9). El zoom y el paneo del `ViewState` se
 * aplican como transformación del grupo raíz, de modo que ampliar, reducir o
 * desplazar no altera la geometría del Catálogo ni el `GameState`.
 *
 * `role="img"` y `aria-label` remiten a la capa semántica sincronizada; la
 * geometría se marca `aria-hidden` para que los nombres accesibles procedan de
 * esa capa textual y no del propio SVG.
 */
export function renderSvgMarkup(scene: SvgScene, view: ViewState): string {
  const { viewBox } = scene;
  const { zoom, panX, panY } = view.camera;
  const transform = `translate(${round(panX)} ${round(panY)}) scale(${round(zoom)})`;

  const edgeEls = scene.edges
    .map(
      (edge) =>
        `<line class="${escapeAttr(edge.classes.join(" "))}" x1="${edge.from.x}" y1="${edge.from.y}" x2="${edge.to.x}" y2="${edge.to.y}" />`,
    )
    .join("");

  const hexEls = scene.hexes
    .map(
      (hex) =>
        `<polygon class="${escapeAttr(hex.classes.join(" "))}" data-hex-id="${escapeAttr(String(hex.hexId))}" data-label="${escapeAttr(hex.label)}" points="${escapeAttr(pointsAttr(hex.vertices))}" />`,
    )
    .join("");

  const radius = round(pieceRadius(scene));
  const pieceEls = scene.pieces
    .map(
      (piece) =>
        `<circle class="${escapeAttr(piece.classes.join(" "))}" data-piece-id="${escapeAttr(piece.pieceId)}" cx="${piece.center.x}" cy="${piece.center.y}" r="${radius}" />`,
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" ` +
    `viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}" ` +
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ` +
    `data-orientation="${view.orientation}">` +
    `<g class="map-canvas" transform="${escapeAttr(transform)}" aria-hidden="true">` +
    `<g class="edges">${edgeEls}</g>` +
    `<g class="hexes">${hexEls}</g>` +
    `<g class="pieces">${pieceEls}</g>` +
    `</g></svg>`
  );
}

/** Radio de dibujo de la Ficha, derivado del tamaño medio de Hexágono. */
function pieceRadius(scene: SvgScene): number {
  const first = scene.hexes[0];
  if (first === undefined) return 1;
  // Distancia centro→primer vértice como proporción del radio del Hexágono.
  const v = first.vertices[0];
  if (v === undefined) return 1;
  const dx = v.x - first.center.x;
  const dy = v.y - first.center.y;
  return Math.sqrt(dx * dx + dy * dy) * 0.5;
}
