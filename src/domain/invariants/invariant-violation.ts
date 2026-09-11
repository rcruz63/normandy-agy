/**
 * Vocabulario de violaciones de Invariantes del dominio (Tarea 7.2).
 *
 * Define la taxonomía de categorías y la forma de una violación concreta, junto
 * con su constructor inmutable. Vive en su propio módulo para que los submódulos
 * de comprobación (Instantánea y propuesta de transición) compartan un único
 * vocabulario sin depender del validador que los orquesta.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS. Los mensajes
 * visibles se transportan por `messageKey` (`es-ES`), nunca como texto
 * interpolado en el dominio.
 */

/**
 * Categoría de la Invariante comprobada. Permite agrupar diagnósticos por área
 * (diseño: «referencias, ocupación, estado de fichas, secuencias, registros,
 * aleatoriedad y demás invariantes»).
 */
export type InvariantCategory =
  | "reference"
  | "occupancy"
  | "piece-state"
  | "sequence"
  | "log"
  | "randomness"
  | "outcome"
  | "rules-version";

/**
 * Violación concreta de una Invariante. `path` localiza el campo afectado (p.
 * ej. `state.activation.activePieceId`); `messageKey` identifica la explicación
 * `es-ES` (21.3) y `params` transporta datos para interpolar sin acoplar el
 * dominio al idioma.
 */
export type InvariantViolation = Readonly<{
  category: InvariantCategory;
  path: string;
  messageKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/** Construye una {@link InvariantViolation} inmutable, omitiendo `params` si no hay. */
export function violation(
  category: InvariantCategory,
  path: string,
  messageKey: string,
  params?: Readonly<Record<string, string | number>>,
): InvariantViolation {
  return Object.freeze(
    params === undefined
      ? { category, path, messageKey }
      : { category, path, messageKey, params },
  );
}
