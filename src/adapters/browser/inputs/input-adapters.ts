/**
 * Adaptadores de entrada por dispositivo (Tarea 20.2).
 *
 * Cada adaptador traduce el gesto físico de su modalidad (tacto de un solo
 * puntero, clic/movimiento/arrastre de ratón, teclado, tecnología de
 * asistencia) a un {@link InteractionIntent} normalizado. El diseño exige que
 * TODAS las acciones de juego sean ejecutables por tacto (24.1) y por ratón sin
 * pantalla táctil (24.2), y que la misma acción válida produzca el mismo
 * resultado con independencia de la modalidad (24.11).
 *
 * FRONTERA DE CAPAS: `adapters/browser/`. Los adaptadores no consultan globals
 * del DOM directamente; reciben descriptores de gesto ya extraídos por la capa
 * de vista (que sí escucha eventos). Así son puros y comprobables sin `window`,
 * y el mismo gesto lógico en distintos dispositivos converge a intenciones
 * equivalentes.
 */
import {
  interactionIntent,
  type InteractionIntent,
  type SemanticAction,
} from "./interaction-intent.js";
import type { HexId, PieceId } from "../../../domain/geometry/identifiers.js";

/**
 * Descriptor de gesto neutro que produce la capa de vista tras interpretar un
 * evento de plataforma. Es común a todas las modalidades: cada adaptador solo
 * fija su `source` al construir la intención. `elementId` identifica el
 * Hexágono/Ficha/control tocado; ausente para acciones globales (p. ej.
 * cancelar con `Escape`).
 */
export type GestureDescriptor = Readonly<{
  semanticAction: SemanticAction;
  subjectId?: PieceId | HexId;
  targetId?: PieceId | HexId;
}>;

/**
 * Puerto de un adaptador de entrada: transforma un gesto neutro en una
 * intención normalizada con su modalidad. Todos los adaptadores implementan la
 * MISMA interfaz para que la vista los use de forma intercambiable.
 */
export interface InputAdapter {
  toIntent(gesture: GestureDescriptor): InteractionIntent;
}

function buildIntent(
  source: InteractionIntent["source"],
  gesture: GestureDescriptor,
): InteractionIntent {
  const input: {
    semanticAction: SemanticAction;
    source: InteractionIntent["source"];
    subjectId?: PieceId | HexId;
    targetId?: PieceId | HexId;
  } = {
    semanticAction: gesture.semanticAction,
    source,
  };
  if (gesture.subjectId !== undefined) {
    input.subjectId = gesture.subjectId;
  }
  if (gesture.targetId !== undefined) {
    input.targetId = gesture.targetId;
  }
  return interactionIntent(input);
}

/**
 * Adaptador de tacto de un solo puntero (iPad). Cubre el requisito 24.1: toda
 * acción de juego es alcanzable por tacto.
 */
export class TouchInputAdapter implements InputAdapter {
  public toIntent(gesture: GestureDescriptor): InteractionIntent {
    return buildIntent("touch", gesture);
  }
}

/**
 * Adaptador de ratón (escritorio). Cubre el requisito 24.2: clic, movimiento y
 * arrastre sin exigir pantalla táctil. Las funciones ligadas a hover, botón
 * secundario o rueda se exponen SIEMPRE como acción semántica explícita (véase
 * `alternative-controls.ts`), nunca como único acceso.
 */
export class MouseInputAdapter implements InputAdapter {
  public toIntent(gesture: GestureDescriptor): InteractionIntent {
    return buildIntent("mouse", gesture);
  }
}

/**
 * Adaptador de teclado. Permite operar el tablero y los controles sin puntero,
 * base de la operación con tecnología de asistencia (requisitos 24.x/25.x).
 */
export class KeyboardInputAdapter implements InputAdapter {
  public toIntent(gesture: GestureDescriptor): InteractionIntent {
    return buildIntent("keyboard", gesture);
  }
}

/**
 * Adaptador de tecnología de asistencia (lector de pantalla, conmutadores).
 * Produce las MISMAS intenciones que las demás modalidades; solo marca el
 * origen para trazas de accesibilidad.
 */
export class AssistiveInputAdapter implements InputAdapter {
  public toIntent(gesture: GestureDescriptor): InteractionIntent {
    return buildIntent("assistive", gesture);
  }
}

/**
 * Conjunto de adaptadores por modalidad, listo para inyectar en la vista.
 */
export type InputAdapters = Readonly<{
  touch: InputAdapter;
  mouse: InputAdapter;
  keyboard: InputAdapter;
  assistive: InputAdapter;
}>;

/** Crea el conjunto completo de adaptadores de entrada. */
export function createInputAdapters(): InputAdapters {
  return Object.freeze({
    touch: new TouchInputAdapter(),
    mouse: new MouseInputAdapter(),
    keyboard: new KeyboardInputAdapter(),
    assistive: new AssistiveInputAdapter(),
  });
}
