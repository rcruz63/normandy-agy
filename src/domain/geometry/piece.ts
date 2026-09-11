/**
 * Modelo de estado funcional de una Ficha colocada en la Partida (Tarea 5.1).
 *
 * Una Ficha (contador) es una abstracción distinta del Mapa hexagonal: describe
 * un elemento móvil con bando, posición, Orientación, Moral, Cobertura,
 * visibilidad y estado. Por eso vive en su propio submódulo, separado de la
 * geometría del tablero (`./map.js`).
 *
 * Pureza del dominio: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { CatalogId } from "../identity/index.js";
import type { DirectionId, HexId, PieceId } from "./identifiers.js";
import { InvalidGeometryModelError } from "./geometry-model-error.js";

/** Bando al que pertenece una Ficha. */
export type PieceSide = "british" | "german" | "neutral";

/** Estado de Moral de una Ficha. */
export type PieceMorale = "normal" | "low";

/** Visibilidad de una Ficha frente al jugador. */
export type PieceVisibility = "hidden" | "revealed";

/** Estado de presencia de una Ficha en la Partida. */
export type PieceStatus = "active" | "eliminated";

/** Estado funcional de una Ficha (contador) colocada en la Partida. */
export type PieceState = Readonly<{
  id: PieceId;
  definitionId: CatalogId;
  side: PieceSide;
  hexId?: HexId;
  orientation?: DirectionId;
  morale?: PieceMorale;
  cover: number;
  visibility: PieceVisibility;
  status: PieceStatus;
}>;

/** Cobertura por defecto de una Ficha recién construida (sin protección). */
const DEFAULT_COVER = 0;

/** Entrada del constructor {@link pieceState}. */
type PieceStateInput = {
  id: PieceId;
  definitionId: CatalogId;
  side: PieceSide;
  hexId?: HexId;
  orientation?: DirectionId;
  morale?: PieceMorale;
  cover?: number;
  visibility?: PieceVisibility;
  status?: PieceStatus;
};

/** Valida los campos obligatorios (identidad y bando) de una Ficha. */
function assertPieceIdentity(input: PieceStateInput): void {
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new InvalidGeometryModelError("id", "la Ficha requiere un PieceId no vacío");
  }
  if (typeof input.definitionId !== "string" || input.definitionId.trim().length === 0) {
    throw new InvalidGeometryModelError("definitionId", "la Ficha requiere un CatalogId no vacío");
  }
  if (input.side !== "british" && input.side !== "german" && input.side !== "neutral") {
    throw new InvalidGeometryModelError("side", "debe ser «british», «german» o «neutral»");
  }
}

/** Normaliza y valida la Cobertura: entero no negativo, `DEFAULT_COVER` si se omite. */
function normalizeCover(cover: number | undefined): number {
  const value = cover ?? DEFAULT_COVER;
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidGeometryModelError("cover", "la Cobertura debe ser un entero no negativo");
  }
  return value;
}

/** Construye un {@link PieceState} inmutable validando sus invariantes. */
export function pieceState(input: PieceStateInput): PieceState {
  assertPieceIdentity(input);

  const base: {
    id: PieceId;
    definitionId: CatalogId;
    side: PieceSide;
    hexId?: HexId;
    orientation?: DirectionId;
    morale?: PieceMorale;
    cover: number;
    visibility: PieceVisibility;
    status: PieceStatus;
  } = {
    id: input.id,
    definitionId: input.definitionId,
    side: input.side,
    cover: normalizeCover(input.cover),
    visibility: input.visibility ?? "hidden",
    status: input.status ?? "active",
  };
  if (input.hexId !== undefined) base.hexId = input.hexId;
  if (input.orientation !== undefined) base.orientation = input.orientation;
  if (input.morale !== undefined) base.morale = input.morale;
  return Object.freeze(base);
}
