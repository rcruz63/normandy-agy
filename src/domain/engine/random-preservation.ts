/**
 * Conservación del Estado aleatorio ante rechazo o bloqueo previo al azar
 * (Tarea 8.2, diseño §2 «Motor de reglas puro», Propiedad 4).
 *
 * Contrato de conservación (diseño §2): «`rejected` y los bloqueos detectados
 * antes de una resolución aleatoria devuelven EXACTAMENTE el Estado aleatorio
 * recibido». Es decir, cuando {@link RulesEngineView.decide} concluye `rejected`
 * (comando no permitido, dirigido a otra Partida o inválido por secuencia) o
 * `blocked` por una carencia detectada ANTES de requerir azar (dato/prioridad/
 * decisión pendiente, DP-002), la Partida no consume aleatoriedad: el Estado
 * aleatorio de la última Instantánea confirmada se conserva sin avance ni
 * consumo (misma `seed`, `position` y `algorithmVersion`).
 *
 * Este módulo hace ese invariante EXPLÍCITO y reutilizable por la capa de
 * aplicación (Tarea 15), que persiste la Instantánea: en lugar de reconstruir
 * el Estado aleatorio, debe reutilizar {@link preservedRandomState}, garantía
 * de que ninguna decisión de rechazo/bloqueo previo al azar altera la posición
 * de secuencia aleatoria.
 *
 * Frontera de tareas: la conservación ante `stopped-after-consumption` (avanzar
 * exactamente una vez el Estado aleatorio conservando el Consumo) es OTRA
 * garantía distinta y la resuelve la Tarea 8.3; aquí solo se cubre el caso «sin
 * azar».
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS; no usa `Math.random` ni `Date`. Todos los tipos son `Readonly`.
 */
import type { GameSnapshot, RandomState } from "./state.js";
import type { TransitionDecision } from "./transition.js";

/**
 * Devuelve EXACTAMENTE el Estado aleatorio recibido en la Instantánea, sin
 * avance ni consumo.
 *
 * Preserva la identidad referencial (`snapshot.randomState`) para que la capa
 * de aplicación pueda comprobar la conservación por igualdad estructural y
 * referencial. Es la fuente única del Estado aleatorio a persistir cuando la
 * decisión es `rejected` o `blocked` previo al azar.
 */
export function preservedRandomState(snapshot: GameSnapshot): RandomState {
  return snapshot.randomState;
}

/**
 * ¿La decisión conserva el Estado aleatorio sin tocar la aleatoriedad?
 *
 * Es cierto para `rejected`, `blocked` y `awaiting-roll`:
 * - `rejected`/`blocked` se detectan ANTES de cualquier resolución aleatoria
 *   (el Motor de la Tarea 8.1 no consume azar en esas ramas).
 * - `awaiting-roll` (diseño §3, req. 41.3) declara una Tirada pendiente y
 *   devuelve el control a la capa de aplicación SIN mutar el Estado de partida,
 *   los registros ni la posición de secuencia aleatoria; la reserva la efectúa
 *   el Coordinador de Tiradas más tarde, no esta decisión.
 *
 * Una decisión `accepted` NO garantiza conservación: su propuesta puede haber
 * avanzado el Estado aleatorio (`complete` con azar o
 * `stopped-after-consumption`), por lo que se excluye aquí.
 */
export function preservesRandomState(
  decision: TransitionDecision,
): boolean {
  return (
    decision.kind === "rejected" ||
    decision.kind === "blocked" ||
    decision.kind === "awaiting-roll"
  );
}

/** ¿Dos Estados aleatorios son estructuralmente idénticos (sin avance)? */
export function isSameRandomState(
  left: RandomState,
  right: RandomState,
): boolean {
  return (
    left.seed === right.seed &&
    left.position === right.position &&
    left.algorithmVersion === right.algorithmVersion
  );
}

/**
 * Estado aleatorio que debe persistir la capa de aplicación tras una decisión.
 *
 * Cuando la decisión conserva el azar ({@link preservesRandomState}), devuelve
 * el Estado aleatorio recibido intacto ({@link preservedRandomState}). En otro
 * caso (`accepted`), devuelve `undefined`: el Estado aleatorio a persistir lo
 * determina la propuesta de la transición, no este módulo.
 */
export function randomStateAfterDecision(
  snapshot: GameSnapshot,
  decision: TransitionDecision,
): RandomState | undefined {
  if (!preservesRandomState(decision)) {
    return undefined;
  }
  return preservedRandomState(snapshot);
}
