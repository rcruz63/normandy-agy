/**
 * Proyección de Acciones disponibles a la Interfaz `es-ES` (Tarea 20.5,
 * requisitos 3.1, 20.9).
 *
 * El Motor de reglas enumera las Acciones aceptables como {@link ActionDescriptor}
 * (`commandType` + `labelKey` + `params`), sin texto de idioma. Esta capa las
 * proyecta a etiquetas visibles `es-ES` resolviendo la clave contra el catálogo
 * de la Interfaz, conservando el `commandType` para que el adaptador de entrada
 * construya el `GameCommand` correspondiente.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. No decide qué Acciones están disponibles
 * (eso es dominio); solo traduce las que recibe. No contiene lógica de juego ni
 * toca DOM, IndexedDB, red o reloj.
 */
import type { ActionDescriptor } from "../../domain/engine/rules-engine.js";
import { resolveMessageKey } from "../locale/message-resolver.js";
import { MESSAGES_ES_ES, type MessageCatalog } from "../locale/messages-es-ES.js";

/**
 * Acción lista para mostrar: la etiqueta `es-ES` ya resuelta y el `commandType`
 * que la Interfaz enlazará a un `GameCommand` tras la confirmación del Jugador.
 */
export type ActionOption = Readonly<{
  commandType: string;
  label: string;
}>;

/**
 * Proyecta un {@link ActionDescriptor} a una {@link ActionOption} resolviendo su
 * `labelKey` con los parámetros del descriptor.
 */
export function projectAction(
  action: ActionDescriptor,
  catalog: MessageCatalog = MESSAGES_ES_ES,
): ActionOption {
  return Object.freeze({
    commandType: action.commandType,
    label: resolveMessageKey(action.labelKey, action.params ?? {}, catalog),
  });
}

/**
 * Proyecta una lista de Acciones disponibles conservando el orden emitido por
 * el Motor. Función pura: devuelve una lista congelada.
 */
export function projectActions(
  actions: readonly ActionDescriptor[],
  catalog: MessageCatalog = MESSAGES_ES_ES,
): readonly ActionOption[] {
  return Object.freeze(actions.map((action) => projectAction(action, catalog)));
}
