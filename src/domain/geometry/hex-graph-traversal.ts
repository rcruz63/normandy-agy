/**
 * Recorridos puros sobre el grafo canónico de Hexágonos (Tarea 5.2).
 *
 * Aísla los algoritmos de grafo (BFS, ruta más corta y alcanzabilidad acotada
 * de la Zona de fuego) del ensamblado de la vista {@link HexGeometry}. Operan
 * sobre un índice de adyacencia ya proyectado y ordenado ({@link NeighborIndex})
 * y NUNCA infieren conexiones: solo recorren las que el índice contiene. Al
 * extraerlos, cada función queda atómica y sin anidamiento profundo, y la lógica
 * de frontera BFS deja de duplicarse entre distancia y Zona de fuego.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. La frontera se procesa en orden estable, de modo que las rutas y zonas
 * resultantes son deterministas.
 */
import type { HexId, DirectionId } from "./identifiers.js";
import type { FireArc } from "./hex-geometry.js";

/** Índice de adyacencia simétrica: para cada Hexágono, sus vecinos ordenados. */
export type NeighborIndex = ReadonlyMap<HexId, readonly HexId[]>;

/** Distancia base de un Hexágono a sí mismo y avance de un salto en el BFS. */
const ORIGIN_DISTANCE = 0;
const ONE_STEP = 1;

/** Compara dos identificadores por su cadena, para un orden de frontera estable. */
function byIdentifier(a: HexId, b: HexId): number {
  return String(a).localeCompare(String(b));
}

/** Devuelve los vecinos de un Hexágono según el índice (lista vacía si no hay). */
function neighborsOf(index: NeighborIndex, hex: HexId): readonly HexId[] {
  return index.get(hex) ?? [];
}

/**
 * BFS sobre el grafo canónico desde `from`. Devuelve la distancia a cada
 * Hexágono alcanzable y el árbol de predecesores. La frontera se ordena de forma
 * estable para que el árbol de rutas más cortas sea determinista.
 */
export function breadthFirstSearch(
  index: NeighborIndex,
  from: HexId,
): { dist: Map<HexId, number>; prev: Map<HexId, HexId> } {
  const dist = new Map<HexId, number>([[from, ORIGIN_DISTANCE]]);
  const prev = new Map<HexId, HexId>();
  let frontier: HexId[] = [from];

  while (frontier.length > 0) {
    const next: HexId[] = [];
    for (const current of frontier) {
      expandForShortestPaths(index, current, dist, prev, next);
    }
    next.sort(byIdentifier);
    frontier = next;
  }
  return { dist, prev };
}

/**
 * Expande un Hexágono de la frontera BFS: registra distancia y predecesor de
 * cada vecino aún no visitado y lo añade a la siguiente frontera.
 */
function expandForShortestPaths(
  index: NeighborIndex,
  current: HexId,
  dist: Map<HexId, number>,
  prev: Map<HexId, HexId>,
  next: HexId[],
): void {
  const currentDist = dist.get(current) ?? ORIGIN_DISTANCE;
  for (const neighbor of neighborsOf(index, current)) {
    if (dist.has(neighbor)) continue;
    dist.set(neighbor, currentDist + ONE_STEP);
    prev.set(neighbor, current);
    next.push(neighbor);
  }
}

/**
 * Reconstruye una ruta más corta `from -> to` a partir del árbol de
 * predecesores de un BFS. Devuelve `undefined` si `to` no es alcanzable.
 */
export function reconstructPath(
  prev: ReadonlyMap<HexId, HexId>,
  reachable: ReadonlySet<HexId>,
  from: HexId,
  to: HexId,
): readonly HexId[] | undefined {
  if (!reachable.has(to)) return undefined;

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

/**
 * Calcula los vecinos de primer salto permitidos por una Orientación: aquellos
 * cuya Dirección canónica (según `arc.directionOf`) está entre las Direcciones
 * hacia delante. No infiere ninguna correspondencia Dirección↔vecino.
 */
function allowedFirstStepNeighbors(
  index: NeighborIndex,
  origin: HexId,
  arc: FireArc,
): Set<HexId> {
  const forward = new Set<DirectionId>(arc.forwardDirections);
  const allowed = new Set<HexId>();
  for (const neighbor of neighborsOf(index, origin)) {
    const direction = arc.directionOf[neighbor];
    if (direction !== undefined && forward.has(direction)) {
      allowed.add(neighbor);
    }
  }
  return allowed;
}

/** ¿Es admisible saltar a `neighbor` desde la distancia `currentDist`? */
function isStepAllowed(
  neighbor: HexId,
  currentDist: number,
  allowedFirstStep: ReadonlySet<HexId> | undefined,
): boolean {
  if (currentDist !== ORIGIN_DISTANCE) return true;
  if (allowedFirstStep === undefined) return true;
  return allowedFirstStep.has(neighbor);
}

/**
 * Zona de fuego: Hexágonos alcanzables desde `origin` hasta `range` aristas,
 * restringiendo opcionalmente el primer salto a las Direcciones hacia delante
 * de una Orientación (`arc`). El resultado se devuelve ordenado de forma
 * estable. `range` debe ser un entero ≥ 0 (lo garantiza el llamante).
 */
export function boundedFireZone(
  index: NeighborIndex,
  origin: HexId,
  range: number,
  arc: FireArc | undefined,
): readonly HexId[] {
  const allowedFirstStep =
    arc !== undefined ? allowedFirstStepNeighbors(index, origin, arc) : undefined;

  const dist = new Map<HexId, number>([[origin, ORIGIN_DISTANCE]]);
  const zone = new Set<HexId>();
  let frontier: HexId[] = [origin];

  while (frontier.length > 0) {
    const next: HexId[] = [];
    for (const current of frontier) {
      expandWithinRange(index, current, range, allowedFirstStep, dist, zone, next);
    }
    next.sort(byIdentifier);
    frontier = next;
  }

  return Object.freeze([...zone].sort(byIdentifier));
}

/**
 * Expande un Hexágono de la frontera respetando el alcance `range` y la
 * restricción de arco del primer salto. Registra los vecinos admisibles en la
 * Zona y en la siguiente frontera.
 */
function expandWithinRange(
  index: NeighborIndex,
  current: HexId,
  range: number,
  allowedFirstStep: ReadonlySet<HexId> | undefined,
  dist: Map<HexId, number>,
  zone: Set<HexId>,
  next: HexId[],
): void {
  const currentDist = dist.get(current) ?? ORIGIN_DISTANCE;
  if (currentDist >= range) return;

  for (const neighbor of neighborsOf(index, current)) {
    if (dist.has(neighbor)) continue;
    if (!isStepAllowed(neighbor, currentDist, allowedFirstStep)) continue;
    dist.set(neighbor, currentDist + ONE_STEP);
    zone.add(neighbor);
    next.push(neighbor);
  }
}
