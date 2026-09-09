/**
 * `order-effects`: efectos concretos de las Órdenes británicas a nivel de Orden
 * (Tarea 9.3, diseño §2 «submódulos `TurnOrderPolicy` / `MoralePolicy`», que
 * cubren «tablas de órdenes» y «efectos de órdenes» de los requisitos 34-35).
 *
 * Alcance verificado (requisito 35: efectos concretos de las Órdenes):
 *
 * - AVANZAR (35.1, 35.2, 35.3, 35.4, 35.10, 35.13, 35.14): mover la Unidad
 *   británica EXACTAMENTE un Hexágono hacia una de las tres Direcciones hacia
 *   delante (35.1). El destino se valida contra el grafo canónico de
 *   {@link HexGeometry} y contra el arco frontal aportado por los Datos
 *   canónicos: no se inventa adyacencia ni correspondencia Dirección↔vecino.
 *   Se permite apilar Unidades británicas sin límite en un Hexágono ocupado
 *   solo por británicas (35.2); si el destino contiene una Unidad alemana se
 *   conserva la posición (35.3). Al avanzar se ELIMINA toda la Cobertura
 *   acumulada de la Unidad (35.10) y se IDENTIFICAN las Incógnitas adyacentes
 *   al destino para su Revelado (35.4, 37.6). Este módulo NO ejecuta el
 *   Revelado (Tabla de la Misión, Orientación, Minas): eso es la Tarea 11.1
 *   (`RevealResolver`); aquí solo se expone el disparador con el conjunto de
 *   Hexágonos adyacentes con Incógnitas.
 *
 * - EXPLORAR (35.13, 35.14, 35.15): solo una Escuadra de fusileros
 *   (`rifle-squad`) puede Explorar (35.15); alcanza una Incógnita situada a
 *   distancia hexagonal hasta 2 sobre el grafo canónico (35.13). Los Equipos
 *   MG, Morteros y PIAT quedan EXCLUIDOS de Explorar y la solicitud se rechaza
 *   sin cambiar el estado (35.15). El Revelado sin prueba inmediata de Mina y
 *   la elección de Orientación inferior (35.14, 37.10, 37.11) los resuelve la
 *   Tarea 11.1; aquí solo se identifican las Incógnitas alcanzables.
 *
 * - COBERTURA (35.9): añade un modificador acumulable de +1 a la Cobertura de
 *   la Unidad. El uso del modificador en el cálculo del Valor para impactar es
 *   la Tarea 10.1 (`CombatResolver`); aquí solo se acumula el estado.
 *
 * - FUEGO / GRANADA (35.5, 35.6, 35.7): a nivel de Orden, ambas seleccionan
 *   EXACTAMENTE una Unidad alemana adyacente (Fuego en cualquiera de las seis
 *   direcciones, 35.5; Granada contra una Unidad alemana adyacente, 35.7) y
 *   disparan un ataque. Este módulo produce la INTENCIÓN de ataque
 *   ({@link AttackIntent}) —quién ataca, a quién y con qué tipo de Orden— sin
 *   calcular la suma algebraica, el Valor para impactar ni el resultado del
 *   2d6: ese cálculo es la Tarea 10.1 (`CombatResolver`).
 *
 * COMPOSICIÓN CON GEOMETRÍA (Tarea 5): la distancia y la adyacencia SIEMPRE se
 * consultan a `HexGeometry`, nunca se deducen de coordenadas. El arco frontal
 * de Avanzar reutiliza el mismo contrato ({@link ForwardArc}) que la Zona de
 * fuego de `HexGeometry` (`FireArc`): `directionOf` traduce cada vecino del
 * origen a su Dirección canónica y `forwardDirections` son las Direcciones
 * hacia delante de la Orientación vigente. Ambos provienen del catálogo.
 *
 * COMPOSICIÓN CON 9.1/9.2: el tipo de Unidad ({@link BritishUnitType}) proviene
 * de `TurnOrderPolicy` (Tarea 9.1); la Moral y su limitación las gobierna
 * `MoralePolicy` (Tarea 9.2). Este módulo NO decide qué Orden está permitida
 * por Moral/tirada (eso es 9.1/9.2): asume una Orden ya autorizada y modela su
 * EFECTO estructural.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: el módulo NUNCA llama a `VersionedRandom`
 * ni consume azar. El resultado del 2d6 de Fuego/Granada y de la Tabla de
 * revelado se resuelven fuera y se suministran a las Tareas 10.1/11.1; aquí solo
 * se produce la intención/disparador.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import type { DirectionId, HexId } from "../geometry/identifiers.js";
import type { HexGeometry } from "../geometry/hex-geometry.js";
import type { PieceState } from "../geometry/map.js";
import type { BritishUnitType } from "./turn-order-policy.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Un Avanzar mueve la Unidad exactamente un Hexágono (35.1). */
const ADVANCE_STEP_DISTANCE: number = 1;
/** Incremento de Cobertura por resolver la Orden Cobertura (35.9). */
const COVER_INCREMENT: number = 1;
/** Cobertura tras Avanzar: se elimina toda la acumulada (35.10). */
const COVER_AFTER_ADVANCE: number = 0;
/** Alcance máximo (en aristas) de Explorar: una Incógnita a distancia 2 (35.13). */
const SCOUT_MAX_DISTANCE: number = 2;

/**
 * Tipos de Unidad británica EXCLUIDOS de Explorar (35.15): Equipo MG, Mortero y
 * PIAT. Solo la Escuadra de fusileros puede Explorar.
 */
const SCOUT_EXCLUDED_UNIT_TYPES: readonly BritishUnitType[] = Object.freeze([
  "mg-team",
  "mortar",
  "piat",
]);

// ---------------------------------------------------------------------------
// Arco frontal (Direcciones hacia delante) aportado por los Datos canónicos
// ---------------------------------------------------------------------------

/**
 * Restricción de Direcciones hacia delante para Avanzar (35.1).
 *
 * Espeja el contrato `FireArc` de {@link HexGeometry}: `forwardDirections` son
 * las tres Direcciones hacia delante de la Orientación vigente y `directionOf`
 * traduce, para el Hexágono origen, cada vecino a su Dirección canónica. Ambos
 * provienen de los Datos canónicos; este módulo no deduce la correspondencia.
 */
export type ForwardArc = Readonly<{
  forwardDirections: readonly DirectionId[];
  directionOf: Readonly<Record<HexId, DirectionId>>;
}>;

// ---------------------------------------------------------------------------
// Avanzar (35.1, 35.2, 35.3, 35.4, 35.10, 35.13, 35.14)
// ---------------------------------------------------------------------------

/**
 * Resultado de resolver Avanzar.
 *
 * - `advanced`: la Unidad se movió a `destination`. `piece` es el nuevo
 *   {@link PieceState} (posición actualizada y Cobertura eliminada, 35.10).
 *   `revealTriggers` es el conjunto de Hexágonos ADYACENTES al destino que
 *   contienen Incógnitas y deben revelarse (35.4, 37.6); el Revelado en sí lo
 *   resuelve la Tarea 11.1.
 * - `rejected`: el destino no es un vecino frontal válido, está fuera del arco,
 *   o está ocupado por una Unidad alemana (35.3). NO cambia el estado ni la
 *   posición.
 */
export type AdvanceOutcome =
  | Readonly<{
      kind: "advanced";
      piece: PieceState;
      destination: HexId;
      revealTriggers: readonly HexId[];
    }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

/** Datos necesarios para resolver Avanzar. */
export type AdvanceRequest = Readonly<{
  /** Unidad británica que avanza (debe tener `hexId` de origen). */
  mover: PieceState;
  /** Hexágono de destino elegido. */
  destination: HexId;
  /** Direcciones hacia delante y traducción vecino→Dirección del origen. */
  forwardArc: ForwardArc;
  /**
   * Otras Fichas del tablero relevantes para la ocupación del destino y la
   * detección de Incógnitas adyacentes. La Unidad que avanza puede o no estar
   * incluida: se ignora por identidad al comprobar la ocupación.
   */
  board: readonly PieceState[];
}>;

/** Mensaje `es-ES`: la Unidad que avanza no tiene Hexágono de origen. */
function missingOriginMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.orders.advance.missingOrigin" });
}

/** Mensaje `es-ES`: el destino no es un vecino frontal válido (35.1). */
function notForwardNeighborMessage(destination: HexId): DomainMessage {
  return Object.freeze({
    messageKey: "rules.orders.advance.notForwardNeighbor",
    params: Object.freeze({ destination: String(destination) }),
  });
}

/** Mensaje `es-ES`: el destino contiene una Unidad alemana (35.3). */
function destinationOccupiedByGermanMessage(destination: HexId): DomainMessage {
  return Object.freeze({
    messageKey: "rules.orders.advance.destinationOccupiedByGerman",
    params: Object.freeze({ destination: String(destination) }),
  });
}

/**
 * ¿El destino es un vecino situado en una Dirección hacia delante del origen?
 *
 * Combina la adyacencia canónica de {@link HexGeometry} con el arco frontal de
 * los Datos canónicos (35.1). Solo es válido a distancia exactamente 1 y cuando
 * la Dirección del vecino pertenece a `forwardDirections`.
 */
function isForwardNeighbor(
  geometry: HexGeometry,
  origin: HexId,
  destination: HexId,
  forwardArc: ForwardArc,
): boolean {
  if (!geometry.areAdjacent(origin, destination)) {
    return false;
  }
  if (geometry.distance(origin, destination) !== ADVANCE_STEP_DISTANCE) {
    return false;
  }
  const direction = forwardArc.directionOf[destination];
  if (direction === undefined) {
    return false;
  }
  return forwardArc.forwardDirections.includes(direction);
}

/**
 * ¿El destino está ocupado por al menos una Unidad alemana activa? (35.3)
 *
 * El apilamiento británico no limita el destino (35.2): solo una Unidad alemana
 * activa lo bloquea. La Unidad que avanza se excluye por identidad.
 */
function isBlockedByGerman(
  board: readonly PieceState[],
  destination: HexId,
  moverId: PieceState["id"],
): boolean {
  return board.some(
    (piece) =>
      piece.id !== moverId &&
      piece.status === "active" &&
      piece.side === "german" &&
      piece.hexId === destination,
  );
}

/**
 * Identifica los Hexágonos ADYACENTES al destino que contienen una Incógnita a
 * revelar tras Avanzar (35.4, 37.6).
 *
 * Una Incógnita es una Ficha aún oculta (`visibility === "hidden"`) y activa. La
 * adyacencia proviene de {@link HexGeometry}; el conjunto resultante es estable
 * (orden de vecinos de la geometría) y sin duplicados. El Revelado en sí es la
 * Tarea 11.1: aquí solo se expone el disparador.
 */
function adjacentRevealTriggers(
  geometry: HexGeometry,
  destination: HexId,
  board: readonly PieceState[],
): readonly HexId[] {
  const neighbors = geometry.neighbors(destination);
  const withUnknown = neighbors.filter((neighbor) =>
    board.some(
      (piece) =>
        piece.status === "active" &&
        piece.visibility === "hidden" &&
        piece.hexId === neighbor,
    ),
  );
  return Object.freeze([...withUnknown]);
}

/**
 * Resuelve la Orden Avanzar de una Unidad británica (35.1-35.4, 35.10).
 *
 * 1. Falla-rápido si la Unidad no tiene Hexágono de origen (dato corrupto).
 * 2. Rechaza si el destino no es un vecino frontal válido (35.1) sin cambiar
 *    estado.
 * 3. Rechaza si el destino está ocupado por una Unidad alemana (35.3),
 *    conservando la posición; el apilamiento británico no bloquea (35.2).
 * 4. En caso contrario, mueve la Unidad al destino, ELIMINA su Cobertura
 *    acumulada (35.10) e identifica las Incógnitas adyacentes a revelar (35.4).
 *
 * Función pura: devuelve un nuevo {@link PieceState} sin mutar el recibido y no
 * consume azar. El Revelado y el uso de la Cobertura corresponden a 11.1/10.1.
 */
export function resolveAdvance(
  geometry: HexGeometry,
  request: AdvanceRequest,
): AdvanceOutcome {
  const { mover, destination, forwardArc, board } = request;
  const origin = mover.hexId;
  if (origin === undefined) {
    return Object.freeze({ kind: "rejected", reason: missingOriginMessage() });
  }
  if (!isForwardNeighbor(geometry, origin, destination, forwardArc)) {
    return Object.freeze({
      kind: "rejected",
      reason: notForwardNeighborMessage(destination),
    });
  }
  if (isBlockedByGerman(board, destination, mover.id)) {
    return Object.freeze({
      kind: "rejected",
      reason: destinationOccupiedByGermanMessage(destination),
    });
  }
  const movedPiece: PieceState = Object.freeze({
    ...mover,
    hexId: destination,
    cover: COVER_AFTER_ADVANCE,
  });
  return Object.freeze({
    kind: "advanced",
    piece: movedPiece,
    destination,
    revealTriggers: adjacentRevealTriggers(geometry, destination, board),
  });
}

// ---------------------------------------------------------------------------
// Explorar (35.13, 35.14, 35.15)
// ---------------------------------------------------------------------------

/**
 * Resultado de resolver Explorar.
 *
 * - `scouted`: la Escuadra de fusileros puede revelar `reachableUnknowns`, las
 *   Incógnitas situadas a distancia hexagonal hasta 2 (35.13). El Revelado sin
 *   prueba de Mina y la Orientación inferior los resuelve la Tarea 11.1.
 * - `rejected`: la Unidad NO es una Escuadra de fusileros (Equipo MG, Mortero o
 *   PIAT quedan excluidos, 35.15). NO cambia el estado.
 */
export type ScoutOutcome =
  | Readonly<{ kind: "scouted"; reachableUnknowns: readonly HexId[] }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

/** Datos necesarios para resolver Explorar. */
export type ScoutRequest = Readonly<{
  /** Escuadra que explora (debe tener `hexId` de origen). */
  scout: PieceState;
  /** Tipo de Unidad británica: determina la exclusión (35.15). */
  unitType: BritishUnitType;
  /** Fichas del tablero para localizar Incógnitas alcanzables. */
  board: readonly PieceState[];
}>;

/** Mensaje `es-ES`: el tipo de Unidad no puede Explorar (35.15). */
function scoutExcludedMessage(unitType: BritishUnitType): DomainMessage {
  return Object.freeze({
    messageKey: "rules.orders.scout.excludedUnitType",
    params: Object.freeze({ unitType }),
  });
}

/** Mensaje `es-ES`: la Escuadra que explora no tiene Hexágono de origen. */
function scoutMissingOriginMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.orders.scout.missingOrigin" });
}

/**
 * ¿El tipo de Unidad puede Explorar? Solo la Escuadra de fusileros (35.15).
 *
 * Predicado puro reutilizable por la capa de acciones aceptables (`RulesEngine`)
 * para EXCLUIR Explorar de las acciones de un Equipo MG, Mortero o PIAT.
 */
export function canScout(unitType: BritishUnitType): boolean {
  return !SCOUT_EXCLUDED_UNIT_TYPES.includes(unitType);
}

/**
 * Localiza las Incógnitas alcanzables por Explorar: activas, ocultas y situadas
 * a distancia hexagonal entre 1 y 2 del origen (35.13).
 *
 * La distancia proviene de {@link HexGeometry}; el conjunto es estable y sin
 * duplicados. El origen (distancia 0) no es alcanzable por Explorar.
 */
function reachableUnknownHexes(
  geometry: HexGeometry,
  origin: HexId,
  board: readonly PieceState[],
): readonly HexId[] {
  const hexes = board
    .filter(
      (piece) => piece.status === "active" && piece.visibility === "hidden",
    )
    .map((piece) => piece.hexId)
    .filter((hex): hex is HexId => hex !== undefined)
    .filter((hex) => geometry.has(hex))
    .filter((hex) => {
      const distance = geometry.distance(origin, hex);
      return distance >= ADVANCE_STEP_DISTANCE && distance <= SCOUT_MAX_DISTANCE;
    });
  return Object.freeze([...new Set(hexes)]);
}

/**
 * Resuelve la Orden Explorar de una Unidad británica (35.13, 35.15).
 *
 * 1. Rechaza si la Unidad es un Equipo MG, Mortero o PIAT, sin cambiar estado
 *    (35.15): Explorar queda excluido para esos tipos.
 * 2. Falla-rápido si la Escuadra no tiene Hexágono de origen (dato corrupto).
 * 3. En caso contrario, identifica las Incógnitas alcanzables a distancia hasta
 *    2 (35.13). El Revelado y la Orientación inferior son la Tarea 11.1.
 *
 * Función pura: no muta la Unidad ni consume azar.
 */
export function resolveScout(
  geometry: HexGeometry,
  request: ScoutRequest,
): ScoutOutcome {
  const { scout, unitType, board } = request;
  if (!canScout(unitType)) {
    return Object.freeze({
      kind: "rejected",
      reason: scoutExcludedMessage(unitType),
    });
  }
  const origin = scout.hexId;
  if (origin === undefined) {
    return Object.freeze({
      kind: "rejected",
      reason: scoutMissingOriginMessage(),
    });
  }
  return Object.freeze({
    kind: "scouted",
    reachableUnknowns: reachableUnknownHexes(geometry, origin, board),
  });
}

// ---------------------------------------------------------------------------
// Cobertura (35.9)
// ---------------------------------------------------------------------------

/**
 * Aplica la Orden Cobertura a una Unidad británica (35.9): añade un modificador
 * acumulable de +1 a su Cobertura.
 *
 * Devuelve un nuevo {@link PieceState} con la Cobertura incrementada sin mutar
 * el recibido. La aplicación del modificador al Valor para impactar (solo
 * ataques que admiten Cobertura) es la Tarea 10.1 (`CombatResolver`); aquí solo
 * se acumula el estado.
 */
export function applyCoverOrder(piece: PieceState): PieceState {
  return Object.freeze({ ...piece, cover: piece.cover + COVER_INCREMENT });
}

// ---------------------------------------------------------------------------
// Fuego y Granada (35.5, 35.6, 35.7)
// ---------------------------------------------------------------------------

/** Tipo de Orden de ataque a nivel de Orden: Fuego o Granada. */
export type AttackOrderKind = "fire" | "grenade";

/**
 * Intención de ataque producida por Fuego o Granada (35.5, 35.7).
 *
 * Es la forma de salida a nivel de Orden: quién ataca (`attackerId`), a qué
 * Unidad alemana adyacente (`targetId`) y con qué Orden (`order`). NO contiene
 * Valor para impactar, modificadores ni resultado de dado: ese cálculo es la
 * Tarea 10.1 (`CombatResolver`), que consume esta intención.
 */
export type AttackIntent = Readonly<{
  order: AttackOrderKind;
  attackerId: PieceState["id"];
  targetId: PieceState["id"];
}>;

/**
 * Resultado de resolver Fuego o Granada a nivel de Orden.
 *
 * - `attack-declared`: `intent` describe el ataque a resolver por 10.1.
 * - `rejected`: el objetivo no es una Unidad alemana adyacente válida (35.5,
 *   35.7). NO cambia el estado.
 */
export type AttackOrderOutcome =
  | Readonly<{ kind: "attack-declared"; intent: AttackIntent }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

/** Datos necesarios para declarar un ataque de Fuego o Granada. */
export type AttackOrderRequest = Readonly<{
  order: AttackOrderKind;
  /** Unidad británica atacante (debe tener `hexId` de origen). */
  attacker: PieceState;
  /** Unidad alemana objetivo elegida. */
  target: PieceState;
}>;

/** Mensaje `es-ES`: el atacante o el objetivo no tiene Hexágono. */
function attackMissingHexMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.orders.attack.missingHex" });
}

/** Mensaje `es-ES`: el objetivo no es una Unidad alemana adyacente válida. */
function invalidAttackTargetMessage(order: AttackOrderKind): DomainMessage {
  return Object.freeze({
    messageKey: "rules.orders.attack.invalidTarget",
    params: Object.freeze({ order }),
  });
}

/**
 * ¿El objetivo es una Unidad alemana activa y adyacente al atacante?
 *
 * Fuego alcanza una Unidad alemana adyacente en cualquiera de las seis
 * direcciones (35.5); Granada, una Unidad alemana adyacente (35.7). La
 * adyacencia proviene de {@link HexGeometry}.
 */
function isValidAdjacentGermanTarget(
  geometry: HexGeometry,
  attackerHex: HexId,
  target: PieceState,
): boolean {
  if (target.side !== "german" || target.status !== "active") {
    return false;
  }
  if (target.hexId === undefined) {
    return false;
  }
  return geometry.areAdjacent(attackerHex, target.hexId);
}

/**
 * Declara un ataque de Fuego o Granada a nivel de Orden (35.5, 35.6, 35.7).
 *
 * 1. Falla-rápido si el atacante no tiene Hexágono de origen.
 * 2. Rechaza si el objetivo no es una Unidad alemana adyacente válida, sin
 *    cambiar estado (35.5, 35.7).
 * 3. En caso contrario, produce la {@link AttackIntent} para que la Tarea 10.1
 *    calcule Valor para impactar, modificadores y resultado del 2d6.
 *
 * Función pura: no consume azar ni calcula la resolución del combate.
 */
export function declareAttackOrder(
  geometry: HexGeometry,
  request: AttackOrderRequest,
): AttackOrderOutcome {
  const { order, attacker, target } = request;
  const attackerHex = attacker.hexId;
  if (attackerHex === undefined) {
    return Object.freeze({
      kind: "rejected",
      reason: attackMissingHexMessage(),
    });
  }
  if (!isValidAdjacentGermanTarget(geometry, attackerHex, target)) {
    return Object.freeze({
      kind: "rejected",
      reason: invalidAttackTargetMessage(order),
    });
  }
  return Object.freeze({
    kind: "attack-declared",
    intent: Object.freeze({
      order,
      attackerId: attacker.id,
      targetId: target.id,
    }),
  });
}
