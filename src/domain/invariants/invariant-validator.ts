/**
 * `InvariantValidator`: validación pura de las Invariantes funcionales del
 * dominio (Tarea 7.2, requisitos 21.1, 21.2, 21.4).
 *
 * El Motor de reglas solo debe aceptar acciones que mantengan las Invariantes
 * declaradas por los Datos canónicos (21.1). Este módulo ORQUESTA las
 * comprobaciones —repartidas en submódulos cohesivos— y produce un resultado
 * estructurado: cuando una propuesta rompe una Invariante, el resultado es
 * `invalid-proposal` (taxonomía del diseño § Error Handling), de modo que la
 * capa de aplicación descarte la propuesta y restaure la última Instantánea
 * confirmada (21.4).
 *
 * Reparto de responsabilidades:
 * - `./invariant-violation.js`: vocabulario (categorías, forma de la violación).
 * - `./snapshot-checks.js`: Invariantes intrínsecas de una Instantánea
 *   (referencias, ocupación, estado de fichas, secuencias, aleatoriedad).
 * - `./proposal-checks.js`: Invariantes de transición (comparan dos
 *   Instantáneas: encadenamiento, avance aleatorio por modo, no acortar logs).
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. Todos los tipos son `Readonly`. Los mensajes visibles se transportan por
 * `messageKey` (`es-ES`), nunca como texto interpolado en el dominio.
 */
import type { GameSnapshot } from "../engine/state.js";
import type {
  DomainMessage,
  TransitionProposal,
} from "../engine/transition.js";
import type { InvariantViolation } from "./invariant-violation.js";
import { checkSnapshot } from "./snapshot-checks.js";
import {
  checkChainLink,
  checkExpectedSnapshot,
  checkLogsNotShrunk,
  checkNotTerminal,
  checkRandomAdvance,
} from "./proposal-checks.js";

// Reexporta el vocabulario de violaciones para que los consumidores que
// históricamente lo importan desde este módulo conserven su superficie pública.
export {
  violation,
  type InvariantCategory,
  type InvariantViolation,
} from "./invariant-violation.js";

/**
 * Resultado de validación de una Instantánea o de una propuesta.
 *
 * - `valid`: la Instantánea/propuesta mantiene todas las Invariantes.
 * - `invalid-proposal`: una propuesta del Motor rompe una Invariante; la capa
 *   de aplicación debe descartarla y restaurar la última Instantánea
 *   confirmada (diseño § Error Handling, 21.4). Incluye un diagnóstico
 *   `es-ES` y la lista de violaciones.
 */
export type InvariantResult =
  | Readonly<{ kind: "valid" }>
  | Readonly<{
      kind: "invalid-proposal";
      diagnostic: DomainMessage;
      violations: readonly InvariantViolation[];
    }>;

/**
 * Valida las Invariantes de una única Instantánea (p. ej. la inicial de una
 * Partida o una recién importada).
 */
export function validateSnapshot(snapshot: GameSnapshot): InvariantResult {
  return toResult(checkSnapshot(snapshot));
}

/**
 * Valida una {@link TransitionProposal} respecto de la Instantánea previa.
 *
 * Compone las Invariantes de transición (dependientes del modo) con las
 * Invariantes intrínsecas de la Instantánea resultante (diseño § Motor de reglas
 * y tabla de decisiones):
 *
 * - `previous.id === proposal.expectedSnapshotId` (Instantánea esperada).
 * - El desenlace de `previous` no puede ser terminal.
 * - La Instantánea resultante encadena hacia `previous`.
 * - Invariantes intrínsecas de `proposal.next`.
 * - Avance del Estado aleatorio según el modo (`complete` no retrocede;
 *   `stopped-after-consumption` avanza exactamente una posición).
 * - Los registros de `next` no se acortan.
 *
 * Si alguna Invariante se rompe, el resultado es `invalid-proposal`.
 */
export function validateProposal(
  proposal: TransitionProposal,
  previous: GameSnapshot,
): InvariantResult {
  const violations: InvariantViolation[] = [
    ...checkExpectedSnapshot(proposal, previous),
    ...checkNotTerminal(previous),
    ...checkChainLink(proposal, previous),
    ...checkSnapshot(proposal.next),
    ...checkRandomAdvance(proposal, previous),
    ...checkLogsNotShrunk(proposal, previous),
  ];
  return toResult(violations);
}

/** Convierte una lista de violaciones en el resultado estructurado. */
function toResult(
  violations: readonly InvariantViolation[],
): InvariantResult {
  if (violations.length === 0) {
    return Object.freeze({ kind: "valid" });
  }
  const diagnostic: DomainMessage = Object.freeze({
    messageKey: "invariant.invalidProposal",
    params: Object.freeze({ count: violations.length }),
  });
  return Object.freeze({
    kind: "invalid-proposal",
    diagnostic,
    violations: Object.freeze([...violations]),
  });
}
