/**
 * Identificadores opacos de la geometría hexagonal (Tarea 5.1).
 *
 * Estos tipos marcados ({@link Brand}) evitan cruces accidentales entre las
 * distintas cadenas que describen mapas y fichas: identificador de Hexágono,
 * de Ficha, de Dirección, de terreno y de característica de arista.
 *
 * El módulo es puro y pertenece a `domain/`: no importa DOM, IndexedDB, red,
 * reloj ni SDK de AWS. Los constructores validan que el valor no esté vacío
 * tras recortar espacios y devuelven el tipo marcado; ante un valor inválido
 * lanzan {@link InvalidGeometryIdError}. Los guardias (`is*`) refinan sin
 * lanzar.
 *
 * No se fija un formato concreto (longitud, alfabeto) más allá de «no vacío»:
 * las coordenadas y orientaciones visuales dependientes de DP-001 se modelan en
 * otros campos (véase {@link module:geometry/map}) y no en el propio
 * identificador.
 */
import type { Brand } from "../identity/index.js";

/** Identificador de un Hexágono dentro de un Mapa hexagonal. */
export type HexId = Brand<string, "HexId">;
/** Identificador de una Ficha (contador) colocada en el tablero. */
export type PieceId = Brand<string, "PieceId">;
/** Identificador de una Dirección/Orientación hexagonal. */
export type DirectionId = Brand<string, "DirectionId">;
/** Identificador de un tipo de terreno de Hexágono (bosque, edificio, colina…). */
export type TerrainId = Brand<string, "TerrainId">;
/** Identificador de una característica de arista (Río, puente…). */
export type EdgeFeatureId = Brand<string, "EdgeFeatureId">;

/** Error lanzado por los constructores de este módulo ante un valor inválido. */
export class InvalidGeometryIdError extends Error {
  public readonly kind: string;
  public readonly rawValue: unknown;

  public constructor(kind: string, rawValue: unknown) {
    super(`Identificador de geometría «${kind}» inválido.`);
    this.name = "InvalidGeometryIdError";
    this.kind = kind;
    this.rawValue = rawValue;
  }
}

function assertNonEmpty(kind: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidGeometryIdError(kind, value);
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hexId(value: string): HexId {
  return assertNonEmpty("HexId", value) as HexId;
}

export function pieceId(value: string): PieceId {
  return assertNonEmpty("PieceId", value) as PieceId;
}

export function directionId(value: string): DirectionId {
  return assertNonEmpty("DirectionId", value) as DirectionId;
}

export function terrainId(value: string): TerrainId {
  return assertNonEmpty("TerrainId", value) as TerrainId;
}

export function edgeFeatureId(value: string): EdgeFeatureId {
  return assertNonEmpty("EdgeFeatureId", value) as EdgeFeatureId;
}

export function isHexId(value: unknown): value is HexId {
  return isNonEmptyString(value);
}

export function isPieceId(value: unknown): value is PieceId {
  return isNonEmptyString(value);
}

export function isDirectionId(value: unknown): value is DirectionId {
  return isNonEmptyString(value);
}

export function isTerrainId(value: unknown): value is TerrainId {
  return isNonEmptyString(value);
}

export function isEdgeFeatureId(value: unknown): value is EdgeFeatureId {
  return isNonEmptyString(value);
}
