/**
 * Equivalencia entre animaciones de cambio de estado y el Registro simple
 * (Tarea 21.2, requisito 25.6; ligado a 20.12 y 41.29).
 *
 * INVARIANTE CENTRAL (25.6): «SI una animación comunica un cambio de Estado de
 * partida, ENTONCES LA Interfaz DEBERÁ presentar el mismo cambio mediante una
 * entrada persistente y ordenada en el Registro simple.» La animación es
 * DECORATIVA y opcional; el registro persistente y ordenado es la autoridad. Por
 * eso este módulo no permite fabricar una animación «suelta»: cada
 * {@link AnimationCue} se DERIVA de una {@link SimpleLogEntry} ya producida por
 * el dominio y conserva su `sequence` y su `messageKey`. No hay constructor
 * público de una señal sin entrada de respaldo: una animación sin equivalente
 * persistente es, por diseño de la API, inexpresable.
 *
 * Correspondencia y orden: {@link animationCuesFor} recibe la lista ORDENADA de
 * entradas del Registro simple que produjo una transición y devuelve las señales
 * de animación en el mismo orden, con correspondencia 1:1. Preserva la secuencia
 * de cada entrada, de modo que las señales heredan el orden persistente (20.6).
 *
 * Reducción de movimiento (25.6, 41.19): con la preferencia `reduced` (el
 * navegador o el Jugador solicita reducir el movimiento) las señales visuales se
 * SUPRIMEN, pero la equivalencia con el registro NO cambia: las entradas
 * persistentes siguen siendo la autoridad y permanecen completas. El módulo
 * expone {@link persistentEquivalents} para comprobar que, con o sin animación,
 * el equivalente persistente es exactamente el mismo conjunto ordenado.
 *
 * FRONTERA DE CAPAS Y PUREZA: módulo de `ui/`. No contiene lógica lúdica ni toca
 * DOM, IndexedDB, red ni reloj; no lee `prefers-reduced-motion` por sí mismo
 * (recibe la preferencia ya observada). Consume las proyecciones de
 * {@link SimpleLogEntry} del dominio (`src/domain/logging`) sin duplicar su
 * lógica. Todos los tipos son `Readonly` y las funciones no mutan sus argumentos.
 */
import type { SimpleLogEntry } from "../../domain/logging/log-entries.js";

/**
 * Preferencia de movimiento observada por la Interfaz (25.6, 41.19):
 *
 * - `full`: se permite la animación de cambio de estado.
 * - `reduced`: el navegador o el Jugador pidió reducir el movimiento; las
 *   señales visuales se suprimen conservando el equivalente persistente.
 */
export type MotionPreference = "full" | "reduced";

/**
 * Señal de animación de un cambio de estado. NO se construye a mano: solo la
 * produce {@link animationCuesFor} a partir de una {@link SimpleLogEntry}. Cada
 * señal enlaza de forma inseparable con su entrada persistente por `sequence` y
 * `messageKey`; ese enlace es la prueba de la equivalencia del requisito 25.6.
 *
 * El campo `order` es la posición (base 0) de la señal dentro de la tanda,
 * heredada del orden de las entradas; permite a la capa de render reproducir las
 * animaciones en el mismo orden persistente sin reordenarlas.
 */
export type AnimationCue = Readonly<{
  /** Secuencia por Partida de la entrada de respaldo (20.6). */
  sequence: number;
  /** Clave `es-ES` del equivalente textual persistente de la entrada. */
  messageKey: string;
  /** Posición base 0 dentro de la tanda, igual al orden de las entradas. */
  order: number;
}>;

/**
 * Equivalente persistente y ordenado de un cambio de estado (25.6). Es la VISTA
 * autoritativa que el Registro simple conserva; una señal de animación siempre
 * apunta a uno de estos. Se deriva directamente de la {@link SimpleLogEntry}.
 */
export type PersistentEquivalent = Readonly<{
  /** Secuencia por Partida de la entrada (20.6). */
  sequence: number;
  /** Clave `es-ES` del texto persistente de la entrada. */
  messageKey: string;
}>;

/**
 * Deriva el equivalente persistente y ordenado de cada entrada del Registro
 * simple, en el mismo orden recibido (20.6). Esta es la autoridad del requisito
 * 25.6: exista o no animación, este conjunto no cambia. No muta la entrada.
 */
export function persistentEquivalents(
  entries: readonly SimpleLogEntry[],
): readonly PersistentEquivalent[] {
  return Object.freeze(
    entries.map((entry) =>
      Object.freeze({ sequence: entry.sequence, messageKey: entry.messageKey }),
    ),
  );
}

/**
 * Produce las señales de animación de una tanda de cambios de estado a partir de
 * las entradas ORDENADAS que la transición añadió al Registro simple (25.6).
 *
 * - Correspondencia 1:1 y orden: una señal por entrada, en el mismo orden; cada
 *   señal hereda `sequence` y `messageKey` de su entrada de respaldo.
 * - Reducción de movimiento: con `preference === "reduced"` NO se emite ninguna
 *   señal visual (lista vacía), pero el equivalente persistente
 *   ({@link persistentEquivalents}) permanece intacto y completo.
 *
 * Como la única vía para obtener una {@link AnimationCue} es esta función y esta
 * función solo las crea desde entradas persistentes, una animación sin respaldo
 * en el Registro simple es inexpresable (invariante del requisito 25.6).
 */
export function animationCuesFor(
  entries: readonly SimpleLogEntry[],
  preference: MotionPreference,
): readonly AnimationCue[] {
  if (preference === "reduced") {
    return EMPTY_CUES;
  }
  return Object.freeze(
    entries.map((entry, index) =>
      Object.freeze({
        sequence: entry.sequence,
        messageKey: entry.messageKey,
        order: index,
      }),
    ),
  );
}

/** Lista vacía y congelada de señales, reutilizada con movimiento reducido. */
const EMPTY_CUES: readonly AnimationCue[] = Object.freeze([]);

/**
 * Comprueba que cada señal de animación tiene una entrada persistente de
 * respaldo con la misma `sequence` y `messageKey`, en el mismo orden (25.6).
 * Devuelve `true` cuando la correspondencia 1:1 y el orden se cumplen. Con
 * movimiento reducido (sin señales) devuelve `true`: la ausencia de animación no
 * rompe la equivalencia, pues el equivalente persistente sigue siendo autoridad.
 *
 * Es una comprobación de INVARIANTE para la Interfaz y las pruebas; no fabrica
 * señales ni las repara.
 */
export function everyCueHasPersistentEquivalent(
  cues: readonly AnimationCue[],
  entries: readonly SimpleLogEntry[],
): boolean {
  if (cues.length === 0) {
    return true;
  }
  if (cues.length !== entries.length) {
    return false;
  }
  return cues.every((cue, index) => {
    const entry = entries[index];
    return (
      entry !== undefined &&
      cue.order === index &&
      cue.sequence === entry.sequence &&
      cue.messageKey === entry.messageKey
    );
  });
}
