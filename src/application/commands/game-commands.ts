/**
 * Comandos de juego tipados (GameCommands).
 *
 * Concretan el payload opaco `Record<string, unknown>` de `GameCommand` en una
 * unión discriminada por `type`, con constructores de validación rápida (fail-fast)
 * que garantizan que el dominio reciba siempre datos limpios.
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { GameCommand } from "../../domain/engine/transition.js";
import type { OrderOptionKind } from "../../domain/rules/turn-order-policy.js";

// --- Tipos de comando soportados ---

export const GAME_COMMAND_TYPES = [
  "advance-turn",
  "activate-unit",
  "choose-order",
  "order-advance",
  "order-fire",
  "order-grenade",
  "order-cover",
  "order-rally",
  "order-scout",
  "conclude-activation",
  "resolve-german-phase",
] as const;

export type GameCommandType = (typeof GAME_COMMAND_TYPES)[number];

// --- Payloads específicos ---

export type AdvanceTurnPayload = Readonly<Record<string, never>>;

export type ActivateUnitPayload = Readonly<{
  pieceId: string;
}>;

export type ChooseOrderPayload = Readonly<{
  pieceId: string;
  option: OrderOptionKind;
}>;

export type OrderAdvancePayload = Readonly<{
  pieceId: string;
  toHex: string;
}>;

export type OrderFirePayload = Readonly<{
  pieceId: string;
  targetHex: string;
}>;

export type OrderGrenadePayload = Readonly<{
  pieceId: string;
  targetHex: string;
}>;

export type OrderCoverPayload = Readonly<{
  pieceId: string;
}>;

export type OrderRallyPayload = Readonly<{
  pieceId: string;
}>;

export type OrderScoutPayload = Readonly<{
  pieceId: string;
  targetHex: string;
}>;

export type ResolveGermanPhasePayload = Readonly<Record<string, never>>;

// --- Constructores de comandos ---

function assertNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`El campo «${name}» no puede estar vacío.`);
  }
}

export function createAdvanceTurnCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
): GameCommand {
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "advance-turn",
    payload: Object.freeze({}),
  });
}

export function createActivateUnitCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "activate-unit",
    payload: Object.freeze({ pieceId }),
  });
}

export function createChooseOrderCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
  option: OrderOptionKind,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "choose-order",
    payload: Object.freeze({ pieceId, option }),
  });
}

export function createOrderAdvanceCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
  toHex: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  assertNonEmpty("toHex", toHex);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-advance",
    payload: Object.freeze({ pieceId, toHex }),
  });
}

export function createOrderFireCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
  targetHex: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  assertNonEmpty("targetHex", targetHex);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-fire",
    payload: Object.freeze({ pieceId, targetHex }),
  });
}

export function createOrderGrenadeCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
  targetHex: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  assertNonEmpty("targetHex", targetHex);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-grenade",
    payload: Object.freeze({ pieceId, targetHex }),
  });
}

export function createOrderCoverCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-cover",
    payload: Object.freeze({ pieceId }),
  });
}

export function createOrderRallyCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-rally",
    payload: Object.freeze({ pieceId }),
  });
}

export function createOrderScoutCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
  targetHex: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  assertNonEmpty("targetHex", targetHex);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "order-scout",
    payload: Object.freeze({ pieceId, targetHex }),
  });
}

export function createConcludeActivationCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
  pieceId: string,
): GameCommand {
  assertNonEmpty("pieceId", pieceId);
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "conclude-activation",
    payload: Object.freeze({ pieceId }),
  });
}

export function createResolveGermanPhaseCommand(
  gameId: GameId,
  expectedSnapshotId: SnapshotId,
): GameCommand {
  return Object.freeze({
    gameId,
    expectedSnapshotId,
    type: "resolve-german-phase",
    payload: Object.freeze({}),
  });
}
