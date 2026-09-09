/**
 * `mines`: disparadores y persistencia de la Mina (Tarea 10.2, requisitos 16.1,
 * 39.7-39.12). Compone con {@link resolveCombat} de `combat-resolver` (Tarea
 * 10.1) para el Valor para impactar FIJO 7+ sin modificadores: este módulo
 * decide CUÁNDO se dispara una prueba de Mina y modela la PERSISTENCIA del
 * marcador; la comparación con el 2d6 la resuelve el Motor con el azar externo.
 *
 * Alcance verificado:
 *
 * - DISPARO POR ADYACENCIA DESDE LA MISIÓN 7 (39.7): cuando una Mina se revela
 *   por adyacencia y el número de Misión es 7 o mayor, se dispara de inmediato
 *   una prueba de 2d6 por la Unidad británica reveladora. Por debajo de la
 *   Misión 7 la revelación por adyacencia NO dispara prueba inmediata.
 *
 * - EXPLORAR NO DISPARA PRUEBA INMEDIATA (39.9): cuando la Mina se revela
 *   mediante Explorar, se OMITE la prueba inmediata de Mina, con independencia
 *   del número de Misión.
 *
 * - PRUEBA FIJA 7+ SIN MODIFICADORES (16.1, 39.8, 39.10): la prueba de Mina usa
 *   un Valor para impactar FIJO 7+ que EXCLUYE todo modificador; se compone con
 *   {@link resolveCombat} usando `kind: "mine-test"` y el Dato canónico `fixed`.
 *   Un resultado de 7 o más aplica un impacto a la Unidad británica comprobada
 *   (39.8); la comparación con el 2d6 es externa.
 *
 * - PRUEBA EN FASE DE ACTIVACIÓN ALEMANA (39.10): al llegar la fase alemana se
 *   efectúa por separado una prueba de Mina de 7+ sin modificadores para cada
 *   Unidad británica situada dentro de una Mina. Este módulo identifica el
 *   conjunto de Unidades a comprobar; cada prueba se resuelve por separado.
 *
 * - PERSISTENCIA DE LA MINA (39.11, 39.12): avanzar a un Hexágono con Mina se
 *   permite sujeto a las demás restricciones de Avanzar (39.11, competencia de
 *   `resolveAdvance`); MIENTRAS la Mina esté colocada se EXCLUYE toda acción que
 *   la retire (39.12). La Mina es persistente: permanece en el Hexágono tras la
 *   prueba.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: el módulo NUNCA llama a `VersionedRandom`
 * ni tira 2d6. Produce el DISPARADOR y la RESOLUCIÓN estructural (Valor fijo 7+);
 * el 2d6 y el impacto los aplica el Motor con el azar suministrado desde fuera.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import type { PieceState } from "../geometry/map.js";
import {
  resolveCombat,
  type BaseHitInput,
  type CombatOutcome,
} from "./combat-resolver.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/**
 * Primera Misión en la que la revelación de una Mina por adyacencia dispara una
 * prueba inmediata: la Misión 7 en adelante (39.7).
 */
const MINE_ADJACENCY_TEST_FIRST_MISSION: number = 7;

/**
 * Contexto de modificadores nulo para la prueba de Mina. La prueba es FIJA y
 * EXCLUYE todo modificador (16.1, 39.8); `combat-resolver` ignora estos campos
 * al ser `fixed`, pero se aportan neutros por completitud del contrato.
 */
const MINE_TEST_NEUTRAL_MODIFIERS = Object.freeze({
  defenderTerrain: "clear" as const,
  attackerOnHill: false,
  flanking: false,
  supportingUnits: 0,
  mortar: "none" as const,
});

// ---------------------------------------------------------------------------
// Disparador de la prueba de Mina por revelación (39.7, 39.9)
// ---------------------------------------------------------------------------

/**
 * Causa de la revelación de una Mina, aportada por la capa de Revelado (Tarea
 * 11.1):
 * - `adjacency`: revelada por adyacencia (dispara prueba desde M7, 39.7).
 * - `scout`: revelada mediante Explorar (NUNCA dispara prueba inmediata, 39.9).
 */
export type MineRevealCause = "adjacency" | "scout";

/**
 * ¿La revelación de una Mina dispara una prueba inmediata? (39.7, 39.9)
 *
 * Solo cuando la causa es la adyacencia (39.7) Y el número de Misión es 7 o
 * mayor. Explorar NUNCA dispara prueba inmediata (39.9); tampoco la adyacencia
 * por debajo de la Misión 7. Función pura sin efectos ni azar.
 */
export function mineRevealTriggersImmediateTest(
  cause: MineRevealCause,
  missionNumber: number,
): boolean {
  if (cause !== "adjacency") {
    return false;
  }
  return missionNumber >= MINE_ADJACENCY_TEST_FIRST_MISSION;
}

// ---------------------------------------------------------------------------
// Unidades a comprobar en la fase de activación alemana (39.10)
// ---------------------------------------------------------------------------

/**
 * Identifica las Unidades británicas activas situadas en uno de los Hexágonos
 * con Mina que deben someterse por separado a una prueba de Mina 7+ al llegar la
 * fase de activación alemana (39.10).
 *
 * `minedHexes` es el conjunto de Hexágonos con Mina colocada, aportado por el
 * estado de la Partida. El resultado es estable (orden del tablero) y no muta el
 * tablero recibido. Cada prueba se resuelve por separado con {@link resolveMineTest}.
 */
export function britishUnitsOnMines(
  board: readonly PieceState[],
  minedHexes: readonly PieceState["hexId"][],
): readonly PieceState[] {
  const mined = new Set<string>(
    minedHexes.filter((hex): hex is NonNullable<PieceState["hexId"]> => hex !== undefined),
  );
  const onMines = board.filter(
    (piece) =>
      piece.side === "british" &&
      piece.status === "active" &&
      piece.hexId !== undefined &&
      mined.has(piece.hexId),
  );
  return Object.freeze([...onMines]);
}

// ---------------------------------------------------------------------------
// Resolución de la prueba de Mina (16.1, 39.8, 39.10)
// ---------------------------------------------------------------------------

/**
 * Resuelve una prueba de Mina (16.1, 39.8, 39.10) contra la Unidad británica
 * comprobada: Valor para impactar FIJO 7+ sin modificadores. Compone con
 * {@link resolveCombat} usando `kind: "mine-test"`; el `fixed` lo aporta el Dato
 * canónico ({@link BaseHitInput}), que excluye todo modificador.
 *
 * Función pura: no consume azar. La comparación del 2d6 con el umbral y el
 * impacto (39.8) los aplica el Motor con el azar externo.
 */
export function resolveMineTest(base: BaseHitInput): CombatOutcome {
  return resolveCombat({
    kind: "mine-test",
    base,
    modifiers: MINE_TEST_NEUTRAL_MODIFIERS,
  });
}

// ---------------------------------------------------------------------------
// Persistencia de la Mina (39.11, 39.12)
// ---------------------------------------------------------------------------

/**
 * Acción del juego sobre un Hexágono con Mina que la capa de acciones aceptables
 * evalúa para EXCLUIR las que retirarían la Mina (39.12):
 * - `advance`: avanzar a un Hexágono con Mina; permitido, sujeto a las demás
 *   restricciones de Avanzar (39.11).
 * - `remove-mine`: retirar la Mina; EXCLUIDA mientras la Mina esté colocada
 *   (39.12), porque la Mina es persistente.
 */
export type MineHexAction = "advance" | "remove-mine";

/** Mensaje `es-ES`: no puede retirarse una Mina colocada (39.12). */
function mineRemovalExcludedMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.mine.removalExcluded" });
}

/**
 * Resultado de evaluar una acción sobre un Hexágono con Mina (39.11, 39.12).
 *
 * - `allowed`: la acción no retira la Mina (p. ej. Avanzar, 39.11); las demás
 *   restricciones de Avanzar las comprueba `resolveAdvance`.
 * - `excluded`: la acción retiraría la Mina y queda excluida (39.12).
 */
export type MineHexActionOutcome =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{ kind: "excluded"; reason: DomainMessage }>;

/**
 * Evalúa si una acción sobre un Hexágono con Mina colocada está permitida
 * (39.11, 39.12). Avanzar se permite (sujeto a `resolveAdvance`); cualquier
 * acción que retire la Mina queda excluida porque la Mina es persistente.
 *
 * Función pura: no cambia estado. No decide el resultado de Avanzar; solo
 * confirma que la persistencia de la Mina no lo impide.
 */
export function evaluateMineHexAction(action: MineHexAction): MineHexActionOutcome {
  if (action === "remove-mine") {
    return Object.freeze({ kind: "excluded", reason: mineRemovalExcludedMessage() });
  }
  return Object.freeze({ kind: "allowed" });
}
