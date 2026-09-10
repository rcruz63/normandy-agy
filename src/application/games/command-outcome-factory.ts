/**
 * Fábrica pura de {@link CommandOutcome} a partir de decisiones del Motor y de
 * resultados de Invariantes (Tarea 15.2).
 *
 * Traduce el vocabulario del dominio (`TransitionDecision`, `InvariantResult`)
 * al desenlace que la unidad de trabajo devuelve a la UI, adjuntando siempre la
 * última Instantánea confirmada en las ramas que no confirman (requisitos 7.8,
 * 21.4: la UI sigue proyectando la última confirmada).
 *
 * FRONTERA DE CAPAS: vive en `application/`. Es puro (no I/O, no reloj, no
 * `Math.random`). No interpreta reglas: solo compone diagnósticos `es-ES`.
 */
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { DiceRollRequest } from "../../domain/engine/dice-roll.js";
import type {
  DomainMessage,
  TransitionDecision,
} from "../../domain/engine/transition.js";
import type { InvariantViolation } from "../../domain/invariants/invariant-validator.js";
import type {
  CommandOutcome,
  Diagnostic,
} from "../../domain/ports/index.js";

/** Clave `es-ES` del diagnóstico de `expectedSnapshotId` obsoleto. */
const STALE_MESSAGE_KEY = "persistencia.transicion.instantaneaObsoleta";

/** Construye un desenlace `stale` (concurrencia optimista) sin tocar reglas. */
export function staleOutcome(
  current: GameSnapshot,
  expected: string,
  actual: string,
): CommandOutcome {
  const message: DomainMessage = Object.freeze({
    messageKey: STALE_MESSAGE_KEY,
    params: Object.freeze({ expected, actual }),
  });
  const diagnostic: Diagnostic = Object.freeze({
    category: "stale-expected-snapshot",
    message,
  });
  return Object.freeze({ kind: "stale", diagnostic, current });
}

/** Construye un desenlace `rejected` a partir de la decisión del Motor. */
export function rejectedOutcome(
  current: GameSnapshot,
  reason: DomainMessage,
): CommandOutcome {
  const diagnostic: Diagnostic = Object.freeze({
    category: "rejected",
    message: reason,
  });
  return Object.freeze({ kind: "rejected", diagnostic, current });
}

/** Construye un desenlace `blocked` a partir de la decisión del Motor. */
export function blockedOutcome(
  current: GameSnapshot,
  reason: DomainMessage,
): CommandOutcome {
  const diagnostic: Diagnostic = Object.freeze({
    category: "blocked",
    message: reason,
  });
  return Object.freeze({ kind: "blocked", diagnostic, current });
}

/**
 * Construye un desenlace `awaiting-roll` a partir de la Tirada pendiente
 * declarada por el Motor (diseño §3, req. 41.1, 41.3). No confirma nada: la UI
 * muestra el Componente de tirada y el Coordinador de Tiradas la resuelve. Se
 * conserva la última confirmada (`current`) mientras la Tirada esté pendiente.
 */
export function awaitingRollOutcome(
  current: GameSnapshot,
  request: DiceRollRequest,
): CommandOutcome {
  return Object.freeze({ kind: "awaiting-roll", request, current });
}

/** Construye un desenlace `invalid` cuando la propuesta rompe una Invariante. */
export function invalidOutcome(
  current: GameSnapshot,
  diagnosticMessage: DomainMessage,
  violations: readonly InvariantViolation[],
): CommandOutcome {
  const diagnostic: Diagnostic = Object.freeze({
    category: "invalid-proposal",
    message: diagnosticMessage,
    violations,
  });
  return Object.freeze({ kind: "invalid", diagnostic, current });
}

/** Clave `es-ES` del diagnóstico de fallo/abort del commit transaccional. */
const FAILED_MESSAGE_KEY = "persistencia.transicion.commitFallido";

/**
 * Construye un desenlace `failed` cuando el commit transaccional aborta. Se
 * conserva la última confirmada (`current`): IndexedDB revirtió todo.
 */
export function failedOutcome(
  current: GameSnapshot,
  detailKey: string,
): CommandOutcome {
  const message: DomainMessage = Object.freeze({
    messageKey: FAILED_MESSAGE_KEY,
    params: Object.freeze({ detail: detailKey }),
  });
  const diagnostic: Diagnostic = Object.freeze({
    category: "persistence-failure",
    message,
  });
  return Object.freeze({ kind: "failed", diagnostic, current });
}

/**
 * Decisión conservadora sin confirmación: `rejected` o `blocked`.
 *
 * Excluye tanto `accepted` (la trata la unidad de trabajo: valida Invariantes y
 * confirma) como `awaiting-roll` (la canaliza el Coordinador de Tiradas: declara
 * una Tirada pendiente sin producir desenlace conservador; diseño §3, req. 41).
 */
export type ConservativeDecision = Extract<
  TransitionDecision,
  { kind: "rejected" } | { kind: "blocked" }
>;

/**
 * Traduce una decisión conservadora a su desenlace. Solo cubre
 * `rejected`/`blocked`. La rama `accepted` la trata la unidad de trabajo y la
 * rama `awaiting-roll` la deriva al Coordinador de Tiradas: NINGUNA de ellas
 * produce un desenlace conservador y por eso quedan fuera de esta función.
 */
export function nonAcceptedOutcome(
  current: GameSnapshot,
  decision: ConservativeDecision,
): CommandOutcome {
  if (decision.kind === "rejected") {
    return rejectedOutcome(current, decision.reason);
  }
  return blockedOutcome(current, decision.reason);
}
