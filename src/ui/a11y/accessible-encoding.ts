/**
 * Codificación perceptiva accesible más allá del color (Tarea 21.1, requisitos
 * 10.7, 24.4, 25.1, 25.4, 25.5, 25.7).
 *
 * La Interfaz identifica estados, bandos, selección, Orientación, terreno y
 * resultados mediante texto, forma, patrón o icono ADEMÁS del color; el color
 * NUNCA es el único canal (requisito 25.1). Este módulo mapea cada dimensión
 * visual del dominio a un {@link AccessibleEncoding} con:
 *
 * - `labelKey`: clave de mensaje `es-ES` (nombre accesible en texto, 25.4/25.5).
 * - `shape` / `pattern` / `icon`: al menos un canal NO cromático (25.1).
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Solo transforma proyecciones del dominio
 * (bando, estado, Orientación, terreno, selección, resultado); no contiene
 * lógica lúdica, no decide reglas ni toca DOM, IndexedDB, red o reloj. Consume
 * los valores ya proyectados por otras capas (`PieceState.side`, etc.) y
 * devuelve tokens de presentación; la hoja de estilos aplica el color, que aquí
 * es SIEMPRE un canal adicional, nunca el único.
 */

/** Los seis canales de codificación de una dimensión visual. */
export type AccessibleEncoding = Readonly<{
  /** Clave de mensaje `es-ES` con el nombre accesible en texto (25.4). */
  labelKey: string;
  /** Token de forma (no cromático). */
  shape?: string;
  /** Token de patrón/textura (no cromático). */
  pattern?: string;
  /** Token de icono (no cromático). */
  icon?: string;
  /**
   * Token de color, SIEMPRE opcional y SIEMPRE adicional. Su presencia nunca
   * sustituye a los canales no cromáticos (requisito 25.1).
   */
  color?: string;
}>;

/** Valores de bando reconocidos (`PieceState.side`). */
export type SideValue = "british" | "german" | "neutral";
/** Valores de estado de Ficha (`PieceState.status`). */
export type StatusValue = "active" | "eliminated";
/** Valores de visibilidad de Ficha (`PieceState.visibility`). */
export type VisibilityValue = "hidden" | "revealed";
/** Valores de Moral (`PieceState.morale`). */
export type MoraleValue = "normal" | "low";
/** Estado de selección de un elemento interactivo. */
export type SelectionValue = "selected" | "confirmed" | "unselected";
/** Resultado de una resolución mostrado al Jugador. */
export type ResultValue = "hit" | "miss" | "blocked";

/**
 * Determina si una codificación aporta al menos un canal NO cromático. Es la
 * invariante central del requisito 25.1: una codificación válida nunca depende
 * solo del color.
 */
export function hasNonColorChannel(encoding: AccessibleEncoding): boolean {
  return (
    (encoding.shape !== undefined && encoding.shape.length > 0) ||
    (encoding.pattern !== undefined && encoding.pattern.length > 0) ||
    (encoding.icon !== undefined && encoding.icon.length > 0)
  );
}

/** Codificación de bando (británico/alemán/neutral) — forma + icono (25.1). */
export function encodeSide(side: SideValue): AccessibleEncoding {
  switch (side) {
    case "british":
      return Object.freeze({
        labelKey: "a11y.side.british",
        shape: "circle",
        icon: "star",
        color: "side-british",
      });
    case "german":
      return Object.freeze({
        labelKey: "a11y.side.german",
        shape: "square",
        icon: "cross",
        color: "side-german",
      });
    case "neutral":
      return Object.freeze({
        labelKey: "a11y.side.neutral",
        shape: "diamond",
        icon: "dot",
        color: "side-neutral",
      });
  }
}

/** Codificación de estado de Ficha (activa/eliminada) — icono + patrón. */
export function encodeStatus(status: StatusValue): AccessibleEncoding {
  switch (status) {
    case "active":
      return Object.freeze({
        labelKey: "a11y.status.active",
        icon: "unit",
        pattern: "solid",
        color: "status-active",
      });
    case "eliminated":
      return Object.freeze({
        labelKey: "a11y.status.eliminated",
        icon: "cross-out",
        pattern: "striped",
        color: "status-eliminated",
      });
  }
}

/** Codificación de visibilidad (oculta/revelada) — icono + patrón. */
export function encodeVisibility(visibility: VisibilityValue): AccessibleEncoding {
  switch (visibility) {
    case "hidden":
      return Object.freeze({
        labelKey: "a11y.visibility.hidden",
        icon: "question",
        pattern: "hatched",
        color: "visibility-hidden",
      });
    case "revealed":
      return Object.freeze({
        labelKey: "a11y.visibility.revealed",
        icon: "eye",
        pattern: "solid",
        color: "visibility-revealed",
      });
  }
}

/** Codificación de Moral (normal/baja) — forma + icono. */
export function encodeMorale(morale: MoraleValue): AccessibleEncoding {
  switch (morale) {
    case "normal":
      return Object.freeze({
        labelKey: "a11y.morale.normal",
        icon: "morale-full",
        shape: "shield",
        color: "morale-normal",
      });
    case "low":
      return Object.freeze({
        labelKey: "a11y.morale.low",
        icon: "morale-low",
        shape: "shield-cracked",
        color: "morale-low",
      });
  }
}

/**
 * Codificación de la Orientación (requisitos 10.7, 25.1). El indicador de
 * dirección se representa con forma/flecha además del color, para distinguir
 * visualmente la Orientación de cada Ficha (requisito 10.7). `directionId` es el
 * identificador canónico de la Dirección; no se interpreta geometría aquí.
 */
export function encodeOrientation(directionId: string): AccessibleEncoding {
  return Object.freeze({
    labelKey: "a11y.orientation.facing",
    // El nombre accesible incluye la dirección concreta como parámetro; la
    // Interfaz lo interpola. La forma «arrow» y el icono orientan sin color.
    shape: "arrow",
    icon: `arrow-${directionId}`,
    color: "orientation",
  });
}

/**
 * Codificación de terreno (requisitos 10.7, 25.1). Cada `terrainId` canónico se
 * representa con un patrón/textura además del color. Se cubren los terrenos
 * nombrados por los Datos canónicos (bosque, edificio, colina, Río, despejado);
 * un terreno desconocido recibe un patrón genérico distinguible, nunca solo
 * color.
 */
export function encodeTerrain(terrainId: string): AccessibleEncoding {
  const known: Readonly<Record<string, AccessibleEncoding>> = TERRAIN_ENCODINGS;
  const found = known[terrainId];
  if (found !== undefined) {
    return found;
  }
  return Object.freeze({
    labelKey: "a11y.terrain.unknown",
    pattern: "dotted",
    icon: "terrain-generic",
    color: "terrain-unknown",
  });
}

const TERRAIN_ENCODINGS: Readonly<Record<string, AccessibleEncoding>> = Object.freeze({
  clear: Object.freeze({
    labelKey: "a11y.terrain.clear",
    pattern: "plain",
    icon: "terrain-clear",
    color: "terrain-clear",
  }),
  forest: Object.freeze({
    labelKey: "a11y.terrain.forest",
    pattern: "tree",
    icon: "terrain-forest",
    color: "terrain-forest",
  }),
  building: Object.freeze({
    labelKey: "a11y.terrain.building",
    pattern: "brick",
    icon: "terrain-building",
    color: "terrain-building",
  }),
  hill: Object.freeze({
    labelKey: "a11y.terrain.hill",
    pattern: "contour",
    icon: "terrain-hill",
    color: "terrain-hill",
  }),
  river: Object.freeze({
    labelKey: "a11y.terrain.river",
    pattern: "wave",
    icon: "terrain-river",
    color: "terrain-river",
  }),
});

/** Codificación del estado de selección (25.1, 25.5) — forma de contorno + icono. */
export function encodeSelection(selection: SelectionValue): AccessibleEncoding {
  switch (selection) {
    case "unselected":
      return Object.freeze({
        labelKey: "a11y.selection.unselected",
        shape: "outline-none",
        color: "selection-none",
      });
    case "selected":
      return Object.freeze({
        labelKey: "a11y.selection.selected",
        shape: "outline-dashed",
        icon: "selection-mark",
        color: "selection-selected",
      });
    case "confirmed":
      return Object.freeze({
        labelKey: "a11y.selection.confirmed",
        shape: "outline-solid",
        icon: "selection-check",
        color: "selection-confirmed",
      });
  }
}

/** Codificación del resultado de una resolución (25.1, 25.7) — icono + patrón. */
export function encodeResult(result: ResultValue): AccessibleEncoding {
  switch (result) {
    case "hit":
      return Object.freeze({
        labelKey: "a11y.result.hit",
        icon: "hit",
        pattern: "solid",
        color: "result-hit",
      });
    case "miss":
      return Object.freeze({
        labelKey: "a11y.result.miss",
        icon: "miss",
        pattern: "hollow",
        color: "result-miss",
      });
    case "blocked":
      return Object.freeze({
        labelKey: "a11y.result.blocked",
        icon: "blocked",
        pattern: "barred",
        color: "result-blocked",
      });
  }
}
