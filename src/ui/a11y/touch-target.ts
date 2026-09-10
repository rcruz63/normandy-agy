/**
 * Comprobación de objetivos táctiles mínimos (Tarea 21.1, requisito 24.4).
 *
 * La Interfaz presenta objetivos táctiles con una dimensión mínima de 44 por 44
 * Píxeles CSS y una separación que evite solapamientos (requisito 24.4). Este
 * módulo aporta el umbral canónico y comprobaciones puras que la Interfaz y las
 * pruebas usan para verificar que un control interactivo cumple el mínimo, sin
 * tocar el DOM: recibe dimensiones en Píxeles CSS ya medidas.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. No contiene lógica lúdica ni accede al
 * DOM; solo valida tamaños expresados en Píxeles CSS.
 */

/** Dimensión mínima de un objetivo táctil, en Píxeles CSS (requisito 24.4). */
export const MIN_TOUCH_TARGET_CSS_PX = 44 as const;

/** Tamaño de un objetivo interactivo en Píxeles CSS. */
export type TargetSize = Readonly<{
  /** Anchura en Píxeles CSS. */
  width: number;
  /** Altura en Píxeles CSS. */
  height: number;
}>;

/**
 * ¿Cumple el objetivo el mínimo de 44×44 Píxeles CSS? Exige ambas dimensiones
 * mayores o iguales que {@link MIN_TOUCH_TARGET_CSS_PX} (requisito 24.4).
 */
export function meetsMinimumTouchTarget(size: TargetSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width >= MIN_TOUCH_TARGET_CSS_PX &&
    size.height >= MIN_TOUCH_TARGET_CSS_PX
  );
}

/**
 * Descripción del incumplimiento de un objetivo táctil, para que la Interfaz lo
 * identifique en texto (requisito 25.7) y las pruebas lo comprueben.
 */
export type TouchTargetViolation = Readonly<{
  /** Anchura efectiva. */
  width: number;
  /** Altura efectiva. */
  height: number;
  /** Dimensiones que no alcanzan el mínimo. */
  failing: readonly ("width" | "height")[];
}>;

/**
 * Comprueba un objetivo y devuelve su incumplimiento, o `undefined` si cumple.
 * No lanza: permite recopilar todos los objetivos deficientes en una pasada.
 */
export function checkTouchTarget(size: TargetSize): TouchTargetViolation | undefined {
  const failing: ("width" | "height")[] = [];
  if (!(Number.isFinite(size.width) && size.width >= MIN_TOUCH_TARGET_CSS_PX)) {
    failing.push("width");
  }
  if (!(Number.isFinite(size.height) && size.height >= MIN_TOUCH_TARGET_CSS_PX)) {
    failing.push("height");
  }
  if (failing.length === 0) {
    return undefined;
  }
  return Object.freeze({
    width: size.width,
    height: size.height,
    failing: Object.freeze(failing),
  });
}

/**
 * Aserción de tamaño mínimo: lanza {@link TouchTargetTooSmallError} si el
 * objetivo no cumple 44×44. Útil cuando el llamador quiere fallar de forma dura
 * (p. ej. en pruebas o al construir un control).
 */
export function assertMinimumTouchTarget(size: TargetSize, targetName: string): void {
  const violation = checkTouchTarget(size);
  if (violation !== undefined) {
    throw new TouchTargetTooSmallError(targetName, violation);
  }
}

/** Error tipado cuando un objetivo táctil no alcanza el mínimo de 44×44. */
export class TouchTargetTooSmallError extends Error {
  public readonly violation: TouchTargetViolation;

  public constructor(targetName: string, violation: TouchTargetViolation) {
    super(
      `El objetivo «${targetName}» mide ${violation.width}×${violation.height} px CSS; ` +
        `el mínimo es ${MIN_TOUCH_TARGET_CSS_PX}×${MIN_TOUCH_TARGET_CSS_PX} px CSS.`,
    );
    this.name = "TouchTargetTooSmallError";
    this.violation = violation;
  }
}
