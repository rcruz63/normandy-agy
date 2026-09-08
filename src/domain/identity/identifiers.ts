/**
 * Identificadores opacos del dominio y sus constructores validadores.
 *
 * Cada identificador es un `string` marcado ({@link Brand}). Los constructores
 * validan que el valor no esté vacío tras recortar espacios y devuelven el tipo
 * marcado; ante un valor inválido lanzan {@link InvalidIdentifierError}. Los
 * guardias de tipo (`is*`) permiten refinar sin lanzar.
 *
 * No se fija aquí un formato concreto (longitud, alfabeto) más allá de "no
 * vacío": el diseño deja libre la representación y otras capas pueden reforzar
 * reglas adicionales sin romper este contrato.
 */
import type { Brand } from "./brand.js";

export type CatalogId = Brand<string, "CatalogId">;
export type MissionId = Brand<string, "MissionId">;
export type GameId = Brand<string, "GameId">;
export type SnapshotId = Brand<string, "SnapshotId">;
export type RulesVersion = Brand<string, "RulesVersion">;
export type DecisionRef = Brand<string, "DecisionRef">;
export type SaveVersion = Brand<string, "SaveVersion">;
export type PackageVersion = Brand<string, "PackageVersion">;
export type RandomAlgorithmVersion = Brand<string, "RandomAlgorithmVersion">;

/** Error lanzado por los constructores cuando el valor no es válido. */
export class InvalidIdentifierError extends Error {
  public readonly kind: string;
  public readonly rawValue: unknown;

  public constructor(kind: string, rawValue: unknown) {
    super(`Identificador «${kind}» inválido.`);
    this.name = "InvalidIdentifierError";
    this.kind = kind;
    this.rawValue = rawValue;
  }
}

function assertNonEmpty(kind: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new InvalidIdentifierError(kind, value);
  }
  if (value.trim().length === 0) {
    throw new InvalidIdentifierError(kind, value);
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function catalogId(value: string): CatalogId {
  return assertNonEmpty("CatalogId", value) as CatalogId;
}

export function missionId(value: string): MissionId {
  return assertNonEmpty("MissionId", value) as MissionId;
}

export function gameId(value: string): GameId {
  return assertNonEmpty("GameId", value) as GameId;
}

export function snapshotId(value: string): SnapshotId {
  return assertNonEmpty("SnapshotId", value) as SnapshotId;
}

export function rulesVersion(value: string): RulesVersion {
  return assertNonEmpty("RulesVersion", value) as RulesVersion;
}

export function decisionRef(value: string): DecisionRef {
  return assertNonEmpty("DecisionRef", value) as DecisionRef;
}

export function saveVersion(value: string): SaveVersion {
  return assertNonEmpty("SaveVersion", value) as SaveVersion;
}

export function packageVersion(value: string): PackageVersion {
  return assertNonEmpty("PackageVersion", value) as PackageVersion;
}

export function randomAlgorithmVersion(value: string): RandomAlgorithmVersion {
  return assertNonEmpty("RandomAlgorithmVersion", value) as RandomAlgorithmVersion;
}

export function isCatalogId(value: unknown): value is CatalogId {
  return isNonEmptyString(value);
}

export function isMissionId(value: unknown): value is MissionId {
  return isNonEmptyString(value);
}

export function isGameId(value: unknown): value is GameId {
  return isNonEmptyString(value);
}

export function isSnapshotId(value: unknown): value is SnapshotId {
  return isNonEmptyString(value);
}

export function isRulesVersion(value: unknown): value is RulesVersion {
  return isNonEmptyString(value);
}

export function isDecisionRef(value: unknown): value is DecisionRef {
  return isNonEmptyString(value);
}

export function isSaveVersion(value: unknown): value is SaveVersion {
  return isNonEmptyString(value);
}

export function isPackageVersion(value: unknown): value is PackageVersion {
  return isNonEmptyString(value);
}

export function isRandomAlgorithmVersion(
  value: unknown,
): value is RandomAlgorithmVersion {
  return isNonEmptyString(value);
}
