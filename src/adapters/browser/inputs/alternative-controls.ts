/**
 * Alternativas visibles a interacciones no evidentes (Tarea 20.2).
 *
 * El requisito 24.3 exige que TODA función asociada a un gesto, al
 * desplazamiento del puntero (hover), al botón secundario del ratón o a la
 * rueda disponga de un control visible alternativo. El arrastre de ratón (24.2)
 * también requiere una vía discreta equivalente para quien no pueda arrastrar.
 *
 * Este módulo declara el catálogo canónico de esas interacciones «ocultas» y
 * verifica que cada una tenga registrado un control visible que produzca la
 * MISMA acción semántica ({@link SemanticAction}). No dibuja UI: expone el
 * contrato y el validador que la vista (Tarea 20.3/20.4) debe satisfacer.
 */
import type { SemanticAction } from "./interaction-intent.js";

/**
 * Interacción no evidente que la especificación obliga a duplicar con un
 * control visible.
 */
export type HiddenInteractionKind =
  | "gesture"
  | "hover"
  | "secondary-click"
  | "wheel"
  | "drag";

/** Catálogo canónico de interacciones que exigen alternativa visible (24.3). */
export const HIDDEN_INTERACTION_KINDS: readonly HiddenInteractionKind[] =
  Object.freeze(["gesture", "hover", "secondary-click", "wheel", "drag"]);

/**
 * Control visible alternativo declarado por la vista. `controlId` identifica el
 * elemento operable (botón/entrada) y `labelKey` su nombre accesible es-ES
 * (25.4); `semanticAction` es la acción que emite, que debe coincidir con la de
 * la interacción oculta a la que sustituye.
 */
export type VisibleAlternativeControl = Readonly<{
  replaces: HiddenInteractionKind;
  controlId: string;
  labelKey: string;
  semanticAction: SemanticAction;
}>;

/** Resultado de la comprobación de cobertura de alternativas visibles. */
export type AlternativeCoverageResult = Readonly<{
  satisfied: boolean;
  /** Interacciones ocultas SIN alternativa visible declarada. */
  missing: readonly HiddenInteractionKind[];
}>;

/** Error lanzado por {@link visibleAlternativeControl} ante datos inválidos. */
export class InvalidVisibleAlternativeError extends Error {
  public readonly field: string;

  public constructor(field: string, detail?: string) {
    super(`Control alternativo inválido en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidVisibleAlternativeError";
    this.field = field;
  }
}

const HIDDEN_KIND_SET: ReadonlySet<HiddenInteractionKind> =
  new Set<HiddenInteractionKind>(HIDDEN_INTERACTION_KINDS);

/** Construye y valida un {@link VisibleAlternativeControl} inmutable. */
export function visibleAlternativeControl(input: {
  replaces: HiddenInteractionKind;
  controlId: string;
  labelKey: string;
  semanticAction: SemanticAction;
}): VisibleAlternativeControl {
  if (!HIDDEN_KIND_SET.has(input.replaces)) {
    throw new InvalidVisibleAlternativeError("replaces", "interacción oculta desconocida");
  }
  if (typeof input.controlId !== "string" || input.controlId.trim().length === 0) {
    throw new InvalidVisibleAlternativeError("controlId", "no puede estar vacío");
  }
  if (typeof input.labelKey !== "string" || input.labelKey.trim().length === 0) {
    throw new InvalidVisibleAlternativeError("labelKey", "no puede estar vacío");
  }
  return Object.freeze({
    replaces: input.replaces,
    controlId: input.controlId,
    labelKey: input.labelKey,
    semanticAction: input.semanticAction,
  });
}

/**
 * Comprueba que la vista declare al menos un control visible por cada
 * interacción oculta del catálogo (24.3). Fail-closed: si falta alguna, la
 * cobertura no se satisface y la vista no debería habilitar esa función solo
 * por vía oculta.
 */
export function checkAlternativeCoverage(
  controls: readonly VisibleAlternativeControl[],
): AlternativeCoverageResult {
  const covered = new Set<HiddenInteractionKind>();
  for (const control of controls) {
    covered.add(control.replaces);
  }
  const missing = HIDDEN_INTERACTION_KINDS.filter((kind) => !covered.has(kind));
  return Object.freeze({
    satisfied: missing.length === 0,
    missing: Object.freeze(missing),
  });
}
