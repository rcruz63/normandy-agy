/**
 * Precedencia canónica entre reglas aplicables del Motor (Tarea 8.1, diseño §2).
 *
 * Toda la precedencia se resuelve mediante POLÍTICAS DE PRIORIDAD almacenadas en
 * el catálogo. Una regla concreta (requisitos 32-39) prevalece sobre una
 * genérica CUANDO ASÍ ESTÁ REGISTRADO por su prioridad. La ausencia de una
 * prioridad necesaria NO cae en un `default`: produce `blocked` con una
 * `DecisionRef` (DP-002), sin aplicar efectos ni consumir aleatoriedad.
 *
 * Este submódulo aísla la lógica de precedencia del contrato del Motor
 * (`./rules-engine.js`), que la consume. Módulo puro y determinista: no importa
 * DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { DecisionRef } from "../identity/index.js";
import { decisionRef as makeDecisionRef } from "../identity/index.js";
import type { DomainMessage } from "./transition.js";
import type { CatalogRuleView, RulePriority } from "./catalog-view.js";

/**
 * `DecisionRef` canónica de DP-002 cuando falta una prioridad de precedencia.
 * El prefijo `DP-002` es el que reconoce el Publication Gate (Tarea 2.3).
 */
export const MISSING_PRIORITY_DECISION_REF: DecisionRef = makeDecisionRef(
  "DP-002-missing-priority",
);

/** Mensaje `es-ES` para el bloqueo por precedencia no resuelta. */
function missingPriorityMessage(ruleA: string, ruleB: string): DomainMessage {
  return Object.freeze({
    messageKey: "rules.precedence.unresolved",
    params: Object.freeze({ ruleA, ruleB }),
  });
}

/** ¿La prioridad está definida (entero) o pendiente (DecisionRef, DP-002)? */
function hasDefinedPriority(priority: RulePriority): priority is number {
  return typeof priority === "number";
}

/**
 * Resultado de {@link resolvePrecedence}: una regla ganadora, ninguna regla
 * aplicable, o un bloqueo por precedencia no registrada (DP-002).
 */
export type PrecedenceResolution =
  | Readonly<{ kind: "winner"; rule: CatalogRuleView }>
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "blocked";
      reason: DomainMessage;
      decisionRef: DecisionRef;
    }>;

/**
 * Localiza una regla aplicable cuya prioridad NO está definida (es una
 * `DecisionRef`, DP-002) y construye el bloqueo correspondiente. Devuelve
 * `undefined` si todas tienen prioridad numérica.
 */
function blockOnUndefinedPriority(
  applicable: readonly CatalogRuleView[],
): PrecedenceResolution | undefined {
  const undefinedPriority = applicable.find(
    (rule) => !hasDefinedPriority(rule.priority),
  );
  if (undefinedPriority === undefined) return undefined;

  const ref = undefinedPriority.priority as DecisionRef;
  const other = applicable.find((rule) => rule.id !== undefinedPriority.id);
  return Object.freeze({
    kind: "blocked",
    reason: missingPriorityMessage(
      undefinedPriority.id,
      other?.id ?? undefinedPriority.id,
    ),
    decisionRef: ref,
  });
}

/** Devuelve la regla de MAYOR prioridad numérica entre las aplicables. */
function highestPriorityRule(
  applicable: readonly CatalogRuleView[],
): CatalogRuleView {
  let best = applicable[0]!;
  for (let index = 1; index < applicable.length; index += 1) {
    const candidate = applicable[index]!;
    if ((candidate.priority as number) > (best.priority as number)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Resuelve la precedencia entre reglas aplicables (diseño §2):
 *
 * - Si alguna regla aplicable carece de prioridad definida (`DecisionRef`), la
 *   precedencia NO está resuelta: `blocked` con esa `DecisionRef` (DP-002).
 * - Entre reglas con prioridad definida gana la de MAYOR prioridad numérica;
 *   una regla concreta prevalece sobre una genérica cuando el catálogo le asigna
 *   una prioridad superior.
 * - Si dos reglas comparten la MISMA prioridad máxima (empate sin desempate
 *   registrado), falta la precedencia relativa: `blocked` con DP-002. No hay
 *   `default` en ningún caso.
 */
export function resolvePrecedence(
  applicable: readonly CatalogRuleView[],
): PrecedenceResolution {
  if (applicable.length === 0) {
    return Object.freeze({ kind: "none" });
  }

  const undefinedPriorityBlock = blockOnUndefinedPriority(applicable);
  if (undefinedPriorityBlock !== undefined) {
    return undefinedPriorityBlock;
  }

  const best = highestPriorityRule(applicable);
  const topPriority = best.priority as number;
  const tiedAtTop = applicable.filter(
    (rule) => (rule.priority as number) === topPriority,
  );
  if (tiedAtTop.length > 1) {
    const [first, second] = tiedAtTop;
    return Object.freeze({
      kind: "blocked",
      reason: missingPriorityMessage(first!.id, second!.id),
      decisionRef: MISSING_PRIORITY_DECISION_REF,
    });
  }

  return Object.freeze({ kind: "winner", rule: best });
}
