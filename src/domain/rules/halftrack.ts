/**
 * `halftrack`: reglas específicas de la Semioruga como OBJETIVO de un ataque
 * (Tarea 10.2, requisito 39.1-39.6). Compone con {@link resolveCombat} de
 * `combat-resolver` (Tarea 10.1) para el cálculo del Valor para impactar: este
 * módulo aporta la ELEGIBILIDAD del atacante (solo PIAT) y el recuento de
 * Unidades de Apoyo adyacentes; el umbral y la suma algebraica los resuelve
 * `combat-resolver`.
 *
 * Alcance verificado:
 *
 * - ATACANTE ÚNICO PIAT (39.2): cuando un ataque tiene una Semioruga como
 *   objetivo, el atacante principal DEBE ser un PIAT. Cualquier otro atacante se
 *   rechaza sin cambiar el estado ni consumir aleatoriedad.
 *
 * - APOYO DE UNIDADES ADYACENTES (39.3): cada OTRA Unidad británica activa
 *   adyacente a la Semioruga atacada aplica como una Unidad de Apoyo (−1 cada
 *   una, 38.2), sin máximo. La adyacencia proviene SIEMPRE de {@link HexGeometry}
 *   (Tarea 5); nunca se deduce de coordenadas.
 *
 * - VALOR PARA IMPACTAR 7+ Y MODIFICADORES COMPATIBLES (39.6): la resolución
 *   reutiliza el Valor base 7+ del PIAT y los modificadores compatibles de
 *   colina, bosque, Apoyo, Flanqueo y Mortero a través de {@link resolveCombat}
 *   con `kind: "piat"`. El Valor base 7+ lo aporta el Dato canónico
 *   ({@link BaseHitInput}); no se codifica aquí.
 *
 * DECISIÓN CONSERVADORA (39.2/39.3): el texto verificado exige que el atacante
 * principal sea un PIAT (39.2) y que las Unidades adyacentes apliquen como Apoyo
 * (39.3), pero NO declara que el ataque quede prohibido cuando no haya ninguna
 * Unidad de Apoyo. Por tanto NO se rechaza la ausencia de Apoyo: se calcula el
 * número real de Unidades de Apoyo (que puede ser cero) y se compone con
 * `resolveCombat`. Si una revisión posterior confirma que el Apoyo es
 * obligatorio, bastará con endurecer {@link resolveHalftrackAttack} sin cambiar
 * su firma.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: el módulo NUNCA llama a `VersionedRandom`
 * ni tira 2d6. Produce la RESOLUCIÓN estructural del Valor para impactar; la
 * comparación con el total de 2d6 y la eliminación de la Semioruga las resuelve
 * el Motor/aplicación con el azar suministrado desde fuera.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import type { HexGeometry } from "../geometry/hex-geometry.js";
import type { HexId } from "../geometry/identifiers.js";
import type { PieceState } from "../geometry/map.js";
import type { BritishUnitType } from "./turn-order-policy.js";
import {
  resolveCombat,
  type BaseHitInput,
  type CombatModifierContext,
  type CombatOutcome,
} from "./combat-resolver.js";

// ---------------------------------------------------------------------------
// Elegibilidad del atacante de una Semioruga (39.2)
// ---------------------------------------------------------------------------

/** Tipo de Unidad británica que puede ser atacante principal de una Semioruga (39.2). */
const HALFTRACK_ATTACKER_UNIT_TYPE: BritishUnitType = "piat";

/**
 * ¿El tipo de Unidad puede ser atacante principal de una Semioruga? Solo un PIAT
 * (39.2). Predicado puro reutilizable por la capa de acciones aceptables para
 * EXCLUIR el ataque a la Semioruga a cualquier otro tipo de Unidad británica.
 */
export function canAttackHalftrack(unitType: BritishUnitType): boolean {
  return unitType === HALFTRACK_ATTACKER_UNIT_TYPE;
}

// ---------------------------------------------------------------------------
// Entrada y salida de la resolución de un ataque a la Semioruga
// ---------------------------------------------------------------------------

/** Datos necesarios para resolver un ataque a una Semioruga (39.2, 39.3, 39.6). */
export type HalftrackAttackRequest = Readonly<{
  /** Tipo de la Unidad británica atacante principal: debe ser PIAT (39.2). */
  attackerUnitType: BritishUnitType;
  /** Unidad británica PIAT atacante (debe tener `hexId` de origen). */
  attacker: PieceState;
  /** Semioruga alemana objetivo (debe tener `hexId`). */
  halftrack: PieceState;
  /** Valor base para impactar 7+ del PIAT, aportado por el Dato canónico (39.6). */
  base: BaseHitInput;
  /**
   * Contexto de modificadores compatibles (colina, bosque, Flanqueo, Mortero)
   * salvo `supportingUnits`, que este módulo CALCULA desde el tablero (39.3).
   */
  modifiers: Omit<CombatModifierContext, "supportingUnits">;
  /** Fichas del tablero para contar las Unidades de Apoyo adyacentes (39.3). */
  board: readonly PieceState[];
}>;

/**
 * Resultado de resolver un ataque a una Semioruga.
 *
 * - `resolved`: el ataque es válido; `resolution` (vía {@link resolveCombat}) es
 *   el Valor para impactar efectivo, y `supportingUnits` el número de Unidades
 *   de Apoyo adyacentes contabilizadas (39.3).
 * - `rejected`: el atacante no es un PIAT (39.2) o falta un Hexágono. NO cambia
 *   el estado.
 */
export type HalftrackAttackOutcome =
  | Readonly<{
      kind: "resolved";
      resolution: Extract<CombatOutcome, { kind: "resolved" }>["resolution"];
      supportingUnits: number;
    }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

// ---------------------------------------------------------------------------
// Mensajes es-ES
// ---------------------------------------------------------------------------

/** Mensaje `es-ES`: solo un PIAT puede atacar a una Semioruga (39.2). */
function nonPiatAttackerMessage(unitType: BritishUnitType): DomainMessage {
  return Object.freeze({
    messageKey: "rules.halftrack.nonPiatAttacker",
    params: Object.freeze({ unitType }),
  });
}

/** Mensaje `es-ES`: el atacante o la Semioruga no tiene Hexágono. */
function halftrackMissingHexMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.halftrack.missingHex" });
}

// ---------------------------------------------------------------------------
// Recuento de Unidades de Apoyo adyacentes (39.3)
// ---------------------------------------------------------------------------

/**
 * Cuenta las OTRAS Unidades británicas activas adyacentes a la Semioruga que
 * aplican como Apoyo (39.3, 38.2). Se excluye por identidad al PIAT atacante y
 * cualquier Ficha sin Hexágono. La adyacencia proviene de {@link HexGeometry}.
 */
function countSupportingUnits(
  geometry: HexGeometry,
  halftrackHex: HexId,
  attackerId: PieceState["id"],
  board: readonly PieceState[],
): number {
  return board.filter(
    (piece) =>
      piece.id !== attackerId &&
      piece.side === "british" &&
      piece.status === "active" &&
      piece.hexId !== undefined &&
      geometry.areAdjacent(piece.hexId, halftrackHex),
  ).length;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

/**
 * Resuelve un ataque a una Semioruga (39.2, 39.3, 39.6).
 *
 * 1. Rechaza si el atacante principal no es un PIAT (39.2), sin cambiar estado.
 * 2. Falla-rápido si el atacante o la Semioruga carece de Hexágono.
 * 3. Cuenta las Unidades de Apoyo adyacentes a la Semioruga (39.3).
 * 4. Compone con {@link resolveCombat} (`kind: "piat"`) el Valor para impactar
 *    7+ y los modificadores compatibles (39.6).
 *
 * Función pura: no muta argumentos ni consume azar. La eliminación de la
 * Semioruga al impactar es competencia del Motor con el 2d6 externo.
 */
export function resolveHalftrackAttack(
  geometry: HexGeometry,
  request: HalftrackAttackRequest,
): HalftrackAttackOutcome {
  if (!canAttackHalftrack(request.attackerUnitType)) {
    return Object.freeze({
      kind: "rejected",
      reason: nonPiatAttackerMessage(request.attackerUnitType),
    });
  }
  const attackerHex = request.attacker.hexId;
  const halftrackHex = request.halftrack.hexId;
  if (attackerHex === undefined || halftrackHex === undefined) {
    return Object.freeze({ kind: "rejected", reason: halftrackMissingHexMessage() });
  }
  const supportingUnits = countSupportingUnits(
    geometry,
    halftrackHex,
    request.attacker.id,
    request.board,
  );
  const outcome = resolveCombat({
    kind: "piat",
    base: request.base,
    modifiers: Object.freeze({ ...request.modifiers, supportingUnits }),
    // 36.12: la Semioruga es un objetivo elegible del PIAT por su propia clase.
    piatTarget: Object.freeze({ targetIsHalftrack: true, targetIsGermanInBuilding: false }),
  });
  if (outcome.kind === "rejected") {
    return Object.freeze({ kind: "rejected", reason: outcome.reason });
  }
  return Object.freeze({
    kind: "resolved",
    resolution: outcome.resolution,
    supportingUnits,
  });
}
