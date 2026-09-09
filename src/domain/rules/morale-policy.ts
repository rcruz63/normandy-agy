/**
 * `MoralePolicy`: impactos sobre la Moral, efecto de Reagrupar y limitación de
 * Órdenes de una activación iniciada con Moral baja (Tarea 9.2, diseño §2
 * «submódulo `MoralePolicy`»).
 *
 * Alcance verificado (requisitos 9.1-9.3, 34.16-34.17, 35.11-35.12, 37.1-37.2):
 *
 * - IMPACTOS SOBRE LA MORAL (37.1, 37.2): una Unidad británica con Moral normal
 *   que recibe un impacto pasa a Moral baja; una Unidad británica con Moral baja
 *   que recibe un impacto queda eliminada. El resultado es un tipo `Readonly`
 *   discriminado ({@link MoraleHitOutcome}): o bien una nueva Moral, o bien la
 *   eliminación de la Unidad.
 * - REAGRUPAR (35.11): una Unidad británica con Moral baja que resuelve
 *   Reagrupar cambia a Moral normal. Reagrupar es la Orden de la primera columna
 *   de la fila 1 de todas las Tablas (34, `RAL`).
 * - LIMITACIÓN AL COMENZAR CON MORAL BAJA (34.16, 34.17, 35.12): lo determinante
 *   para la limitación NO es la Moral actual, sino la Moral CON LA QUE COMENZÓ
 *   la activación. Una Unidad que comenzó su activación con Moral baja solo puede
 *   ejecutar la Orden de la primera columna o ninguna, con independencia de
 *   dobles, y AUNQUE Reagrupar restaure su Moral a normal en esa misma
 *   activación: la activación finaliza sin habilitar la segunda columna. Este
 *   módulo modela ese invariante ORTOGONAL al de `TurnOrderPolicy`, que solo
 *   considera la Moral actual.
 *
 * COMPOSICIÓN CON `TurnOrderPolicy` (Tarea 9.1): no se duplica la tabla de
 * opciones. {@link activationOrderOptions} delega en `allowedOrderOptions` de
 * `TurnOrderPolicy` y, cuando la activación comenzó con Moral baja, fuerza la
 * vista de Moral baja para reutilizar EXACTAMENTE su fila (primera columna o
 * descartar), sin recalcular la tabla aquí.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: la política NUNCA llama a
 * `VersionedRandom` ni consume azar. Recibe el resultado del impacto y la tirada
 * de activación YA resueltos como entrada; el Motor/aplicación suministra esos
 * datos. Así el módulo permanece puro y determinista.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly`. Los textos visibles
 * se transportan por `messageKey` (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import {
  allowedOrderOptions,
  type ActivationRoll,
  type AllowedOrderOptions,
  type MoraleState,
  type OrderOptionKind,
} from "./turn-order-policy.js";

// ---------------------------------------------------------------------------
// Impactos sobre la Moral (37.1, 37.2)
// ---------------------------------------------------------------------------

/**
 * Resultado de aplicar un impacto a una Unidad británica.
 *
 * - `morale-changed`: la Unidad sobrevive con una nueva Moral (`normal` → `low`,
 *   37.1). `morale` es el nuevo estado.
 * - `eliminated`: la Unidad recibió un impacto con Moral baja y queda eliminada
 *   (37.2). No hay Moral resultante porque la Unidad deja de estar en juego.
 *
 * Tipo discriminado por `kind` para que el Motor distinga sin ambigüedad entre
 * degradar la Moral y retirar la Ficha.
 */
export type MoraleHitOutcome =
  | Readonly<{ kind: "morale-changed"; morale: MoraleState }>
  | Readonly<{ kind: "eliminated" }>;

/**
 * Aplica un impacto a una Unidad británica según su Moral actual (37.1, 37.2).
 *
 * - Moral normal → `morale-changed` con Moral baja (37.1).
 * - Moral baja → `eliminated`; la Unidad se retira (37.2).
 *
 * Función pura y total: no muta la Unidad ni consume azar; solo describe la
 * consecuencia estructural del impacto ya resuelto por el combate.
 */
export function applyHitToMorale(currentMorale: MoraleState): MoraleHitOutcome {
  if (currentMorale === "low") {
    return Object.freeze({ kind: "eliminated" });
  }
  return Object.freeze({ kind: "morale-changed", morale: "low" });
}

// ---------------------------------------------------------------------------
// Reagrupar (35.11)
// ---------------------------------------------------------------------------

/**
 * Aplica Reagrupar sobre la Moral de una Unidad británica (35.11).
 *
 * Reagrupar restaura la Moral a `normal` sea cual sea la Moral de partida: una
 * Unidad con Moral baja pasa a normal; una Unidad ya en normal permanece normal
 * (la Orden no la penaliza). Devuelve únicamente la nueva Moral; la limitación
 * de la activación se modela aparte ({@link activationOrderOptions}), porque
 * Reagrupar NO levanta esa limitación (34.17, 35.12).
 *
 * Función pura: no muta parámetros ni consume azar.
 */
export function applyRegroupToMorale(_currentMorale: MoraleState): MoraleState {
  return "normal";
}

// ---------------------------------------------------------------------------
// Limitación de la activación iniciada con Moral baja (34.16, 34.17, 35.12)
// ---------------------------------------------------------------------------

/**
 * Contexto de una activación británica relevante para la limitación de Órdenes.
 *
 * `startedWithLowMorale` fija la Moral CON LA QUE COMENZÓ la activación: es lo
 * único que determina la limitación (34.16), con independencia de que Reagrupar
 * cambie la Moral actual durante la activación (34.17, 35.12). `roll` es la
 * tirada de activación YA resuelta, necesaria para componer con la tabla de
 * `TurnOrderPolicy` (dobles vs. distintos) cuando la activación NO está limitada.
 */
export type ActivationContext = Readonly<{
  startedWithLowMorale: boolean;
  roll: ActivationRoll;
}>;

/**
 * Devuelve el conjunto EXACTO de opciones de Orden permitidas en una activación,
 * respetando la limitación por Moral inicial baja (34.16, 34.17, 35.12).
 *
 * - Si la activación comenzó con Moral baja: se fuerza la vista de Moral `low`
 *   al delegar en `allowedOrderOptions` de `TurnOrderPolicy`, de modo que las
 *   opciones quedan limitadas a la primera columna o descartar, con
 *   independencia de dobles y de que Reagrupar haya restaurado la Moral actual a
 *   normal (34.16, 34.17).
 * - Si la activación NO comenzó con Moral baja: se delega con la Moral actual
 *   (`currentMorale`), reutilizando la tabla completa de `TurnOrderPolicy`
 *   (opciones de Moral normal según dobles, 34.8/34.15).
 *
 * No duplica la lógica de tabla de la Tarea 9.1: la compone eligiendo qué Moral
 * proyectar. Función pura y determinista: no consume azar ni muta estado.
 */
export function activationOrderOptions(
  context: ActivationContext,
  currentMorale: MoraleState,
): AllowedOrderOptions {
  const effectiveMorale: MoraleState = context.startedWithLowMorale
    ? "low"
    : currentMorale;
  return allowedOrderOptions(effectiveMorale, context.roll);
}

/**
 * ¿La opción solicitada está permitida en esta activación? (34.16, 34.19)
 *
 * Predicado puro sobre {@link activationOrderOptions}. Aplica la limitación por
 * Moral inicial baja antes de comprobar la pertenencia, de modo que la segunda
 * columna nunca se acepta cuando la activación comenzó con Moral baja, aunque
 * Reagrupar haya restaurado la Moral actual (34.17, 35.12).
 */
export function isActivationOrderOptionAllowed(
  option: OrderOptionKind,
  context: ActivationContext,
  currentMorale: MoraleState,
): boolean {
  return activationOrderOptions(context, currentMorale).includes(option);
}

/**
 * ¿Debe finalizar la activación tras resolver Reagrupar como primera Orden?
 * (34.17, 35.12)
 *
 * Solo cuando la activación comenzó con Moral baja: aunque Reagrupar restaure la
 * Moral actual a normal, la activación termina sin habilitar la segunda columna.
 * Si la activación NO comenzó con Moral baja, Reagrupar no impone este cierre y
 * la función devuelve `false`.
 *
 * Función pura: no muta estado ni consume azar.
 */
export function shouldEndActivationAfterRegroup(
  context: ActivationContext,
): boolean {
  return context.startedWithLowMorale;
}

/** Mensaje `es-ES` de cierre de activación forzado por Reagrupar (34.17, 35.12). */
export function activationEndedAfterRegroupMessage(): DomainMessage {
  return Object.freeze({
    messageKey: "rules.morale.activationEndedAfterRegroup",
  });
}
