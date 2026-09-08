/**
 * `HexGeometry`: proyección de adyacencia y cálculo de derivados (Tarea 5.2).
 *
 * Este módulo consume el grafo **canónico** de un {@link HexMapDefinition}
 * (Tarea 5.1) —donde cada arista no dirigida se almacena una sola vez— y
 * proyecta vecinos **simétricos**: si `{a,b}` es una arista, `a` es vecino de
 * `b` y `b` de `a`. A partir de ese grafo calcula:
 *
 * - {@link HexGeometry.neighbors}: vecinos directos de un Hexágono.
 * - {@link HexGeometry.areAdjacent}: adyacencia simétrica.
 * - {@link HexGeometry.distance}: longitud de la ruta más corta (aristas).
 * - {@link HexGeometry.path}: una ruta más corta concreta.
 * - {@link HexGeometry.fireZone}: la Zona de fuego (Hexágonos alcanzables
 *   hasta un alcance dado), restringible a las Direcciones hacia delante de
 *   una Orientación.
 *
 * Reglas de dominio (requisitos 10.1, 10.2, 10.5, 10.6, 14.1, 14.6, 37.5,
 * 40.11):
 * - **Nunca** se deducen conexiones fuera del catálogo: la adyacencia proviene
 *   exclusivamente de `undirectedEdges`, jamás de la proximidad de coordenadas.
 * - Distancia, ruta y Zona de fuego se calculan **solo** sobre ese grafo.
 * - Los derivados **no se almacenan**: son funciones puras del estado (posición
 *   y Orientación), de modo que al cambiar posición u Orientación el llamante
 *   vuelve a invocar estas funciones y obtiene los valores recalculados.
 * - Una ruta imposible devuelve `undefined`/`Infinity`: el llamante conserva el
 *   Estado de partida (no hay mutación aquí).
 *
 * Pureza del dominio: no importa DOM, IndexedDB, red, reloj ni SDK de AWS. Todo
 * es puro y determinista; los recorridos ordenan sus fronteras para que la ruta
 * elegida entre varias de igual longitud sea estable.
 *
 * Sobre la Orientación y las «Direcciones hacia delante»: el catálogo puede
 * declarar, para cada Hexágono, qué Dirección lleva a cada vecino (mapa
 * `hexId -> DirectionId`). Cuando se aporta esa proyección junto con las
 * Direcciones hacia delante de una Orientación, {@link HexGeometry.fireZone}
 * restringe el primer salto a los vecinos situados en esas Direcciones. No se
 * inventa ninguna correspondencia Dirección↔vecino: si el catálogo no la
 * aporta, no se aplica restricción de arco y la Zona de fuego es puramente
 * radial sobre el grafo.
 */
import type { HexId, DirectionId } from "./identifiers.js";
import type { HexMapDefinition } from "./map.js";
import { canonicalEdgeKey } from "./map.js";

/** Error lanzado cuando se consulta la geometría con un Hexágono ajeno al mapa. */
export class UnknownHexError extends Error {
  public readonly hexId: HexId;

  public constructor(hexId: HexId) {
    super(`El Hexágono «${String(hexId)}» no pertenece a este Mapa.`);
    this.name = "UnknownHexError";
    this.hexId = hexId;
  }
}

/**
 * Restricción de arco para la Zona de fuego.
 *
 * `forwardDirections` son las Direcciones hacia delante de la Orientación
 * vigente; `directionOf` traduce, para el Hexágono origen, cada vecino a su
 * Dirección canónica. Ambas provienen de los Datos canónicos: este módulo no
 * las deduce.
 */
export type FireArc = Readonly<{
  forwardDirections: readonly DirectionId[];
  directionOf: Readonly<Record<HexId, DirectionId>>;
}>;

/** Opciones de {@link HexGeometry.fireZone}. */
export type FireZoneOptions = Readonly<{
  /** Alcance máximo en número de aristas (entero ≥ 0). */
  range: number;
  /** Restricción opcional a las Direcciones hacia delante de una Orientación. */
  arc?: FireArc;
}>;

/**
 * Vista de geometría inmutable derivada de un {@link HexMapDefinition}.
 *
 * Se construye una vez con {@link buildHexGeometry} (precalcula la lista de
 * adyacencia simétrica) y expone consultas puras. No guarda estado de Fichas:
 * la posición y la Orientación llegan como argumentos, por lo que cualquier
 * cambio de posición u Orientación se refleja recalculando en la siguiente
 * consulta (requisitos 10.6, 14.1).
 */
export type HexGeometry = Readonly<{
  /** Indica si un Hexágono existe en el Mapa. */
  has(hex: HexId): boolean;
  /** Vecinos directos (simétricos) de un Hexágono, en orden estable. */
  neighbors(hex: HexId): readonly HexId[];
  /** Adyacencia simétrica entre dos Hexágonos del grafo canónico. */
  areAdjacent(a: HexId, b: HexId): boolean;
  /** Longitud de la ruta más corta (nº de aristas); `Infinity` si no hay ruta. */
  distance(from: HexId, to: HexId): number;
  /** Una ruta más corta como lista de Hexágonos; `undefined` si no existe. */
  path(from: HexId, to: HexId): readonly HexId[] | undefined;
  /** Zona de fuego: Hexágonos alcanzables desde `origin` según el alcance/arco. */
  fireZone(origin: HexId, options: FireZoneOptions): readonly HexId[];
}>;

/**
 * Construye una {@link HexGeometry} a partir de un Mapa canónico.
 *
 * Proyecta la adyacencia recíproca de cada arista no dirigida y ordena las
 * listas de vecinos para que los recorridos sean deterministas. No añade
 * ninguna conexión que no figure en `undirectedEdges`.
 */
export function buildHexGeometry(map: HexMapDefinition): HexGeometry {
  const hexIds = new Set<HexId>(Object.keys(map.hexes) as HexId[]);

  // Lista de adyacencia simétrica proyectada a partir del grafo canónico.
  const adjacency = new Map<HexId, Set<HexId>>();
  for (const id of hexIds) {
    adjacency.set(id, new Set<HexId>());
  }

  // Deduplica por clave canónica: aunque el modelo ya lo garantiza, así la
  // proyección es idempotente frente a entradas repetidas.
  const seen = new Set<string>();
  for (const edge of map.undirectedEdges) {
    const key = canonicalEdgeKey(edge.a, edge.b);
    if (seen.has(key)) continue;
    seen.add(key);
    // Solo se proyecta adyacencia entre Hexágonos existentes del mismo Mapa.
    if (!hexIds.has(edge.a) || !hexIds.has(edge.b)) continue;
    if (edge.a === edge.b) continue;
    adjacency.get(edge.a)?.add(edge.b);
    adjacency.get(edge.b)?.add(edge.a);
  }

  // Congela las listas de vecinos en orden estable (por identificador).
  const neighborLists = new Map<HexId, readonly HexId[]>();
  for (const [id, set] of adjacency) {
    const sorted = [...set].sort((x, y) => String(x).localeCompare(String(y)));
    neighborLists.set(id, Object.freeze(sorted));
  }

  function assertKnown(hex: HexId): void {
    if (!hexIds.has(hex)) {
      throw new UnknownHexError(hex);
    }
  }

  function has(hex: HexId): boolean {
    return hexIds.has(hex);
  }

  function neighbors(hex: HexId): readonly HexId[] {
    assertKnown(hex);
    return neighborLists.get(hex) ?? Object.freeze([]);
  }

  function areAdjacent(a: HexId, b: HexId): boolean {
    assertKnown(a);
    assertKnown(b);
    return adjacency.get(a)?.has(b) ?? false;
  }

  /**
   * BFS sobre el grafo canónico. Devuelve el árbol de predecesores y la
   * distancia a cada Hexágono alcanzable desde `from`. La frontera se procesa
   * en orden estable, de modo que el árbol de rutas más cortas es determinista.
   */
  function bfs(from: HexId): {
    dist: Map<HexId, number>;
    prev: Map<HexId, HexId>;
  } {
    const dist = new Map<HexId, number>([[from, 0]]);
    const prev = new Map<HexId, HexId>();
    let frontier: HexId[] = [from];
    while (frontier.length > 0) {
      const next: HexId[] = [];
      for (const current of frontier) {
        const currentDist = dist.get(current) ?? 0;
        for (const neighbor of neighborLists.get(current) ?? []) {
          if (dist.has(neighbor)) continue;
          dist.set(neighbor, currentDist + 1);
          prev.set(neighbor, current);
          next.push(neighbor);
        }
      }
      // Orden estable de la siguiente frontera.
      next.sort((x, y) => String(x).localeCompare(String(y)));
      frontier = next;
    }
    return { dist, prev };
  }

  function distance(from: HexId, to: HexId): number {
    assertKnown(from);
    assertKnown(to);
    if (from === to) return 0;
    const { dist } = bfs(from);
    return dist.get(to) ?? Number.POSITIVE_INFINITY;
  }

  function path(from: HexId, to: HexId): readonly HexId[] | undefined {
    assertKnown(from);
    assertKnown(to);
    if (from === to) return Object.freeze([from]);
    const { dist, prev } = bfs(from);
    if (!dist.has(to)) return undefined;
    const reversed: HexId[] = [to];
    let cursor: HexId | undefined = to;
    while (cursor !== undefined && cursor !== from) {
      cursor = prev.get(cursor);
      if (cursor === undefined) return undefined;
      reversed.push(cursor);
    }
    reversed.reverse();
    return Object.freeze(reversed);
  }

  function fireZone(origin: HexId, options: FireZoneOptions): readonly HexId[] {
    assertKnown(origin);
    const { range, arc } = options;
    if (!Number.isInteger(range) || range < 0) {
      throw new RangeError("El alcance de la Zona de fuego debe ser un entero ≥ 0.");
    }
    if (range === 0) return Object.freeze([]);

    // Vecinos de primer salto permitidos por la Orientación (si se aporta arco).
    let allowedFirstStep: Set<HexId> | undefined;
    if (arc !== undefined) {
      const forward = new Set<DirectionId>(arc.forwardDirections);
      allowedFirstStep = new Set<HexId>();
      for (const neighbor of neighborLists.get(origin) ?? []) {
        const dir = arc.directionOf[neighbor];
        if (dir !== undefined && forward.has(dir)) {
          allowedFirstStep.add(neighbor);
        }
      }
    }

    // BFS acotado a `range`, restringiendo el primer salto al arco frontal.
    const dist = new Map<HexId, number>([[origin, 0]]);
    const zone = new Set<HexId>();
    let frontier: HexId[] = [origin];
    while (frontier.length > 0) {
      const next: HexId[] = [];
      for (const current of frontier) {
        const currentDist = dist.get(current) ?? 0;
        if (currentDist >= range) continue;
        for (const neighbor of neighborLists.get(current) ?? []) {
          if (dist.has(neighbor)) continue;
          if (currentDist === 0 && allowedFirstStep && !allowedFirstStep.has(neighbor)) {
            continue;
          }
          dist.set(neighbor, currentDist + 1);
          zone.add(neighbor);
          next.push(neighbor);
        }
      }
      next.sort((x, y) => String(x).localeCompare(String(y)));
      frontier = next;
    }

    return Object.freeze(
      [...zone].sort((x, y) => String(x).localeCompare(String(y))),
    );
  }

  return Object.freeze({
    has,
    neighbors,
    areAdjacent,
    distance,
    path,
    fireZone,
  });
}
