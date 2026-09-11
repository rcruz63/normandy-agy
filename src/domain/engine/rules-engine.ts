/**
 * Motor de reglas puro: contrato de transición y decisión (Tarea 8.1, diseño §2
 * «Motor de reglas puro»).
 *
 * Este módulo implementa `decide`, `resumeRoll` y `availableActions`
 * centrándose en el CONTRATO DE DECISIÓN. La resolución de PRECEDENCIA canónica
 * vive en {@link module:engine/precedence} y la VISTA estructural del catálogo
 * en {@link module:engine/catalog-view}; ambas se reexportan aquí para conservar
 * la superficie pública histórica de este módulo (`ActionDescriptor`,
 * `CatalogRuleView`, `RulesCatalogView`, `resolvePrecedence`, etc.).
 *
 * - Todas las reglas —genéricas y concretas— se resuelven mediante políticas de
 *   prioridad del catálogo. La ausencia de una prioridad necesaria NO cae en un
 *   `default`: produce `blocked` con una `DecisionRef` (DP-002), sin aplicar
 *   efectos ni consumir aleatoriedad (diseño §2; requisitos 5.8, 8.8, 8.9, 9.7,
 *   …, 18.6).
 * - `decide` NO muta sus argumentos.
 *
 * Fronteras de tareas hermanas:
 * - Tarea 8.2 (conservación ante rechazo/bloqueo previo al azar): garantía YA
 *   activa aquí y hecha explícita en {@link ./random-preservation.js}. Como
 *   este módulo NO consume aleatoriedad en las ramas `rejected`/`blocked`, el
 *   Estado aleatorio recibido se conserva intacto; la capa de aplicación lo
 *   persiste mediante `preservedRandomState`/`randomStateAfterDecision`.
 * - Tarea 8.3 (`stopped-after-consumption`) construye SOBRE este contrato. El
 *   `apply` de la regla ganadora puede devolver una propuesta en modo
 *   `stopped-after-consumption` (construida con
 *   {@link ./stopped-after-consumption.js}); este módulo la transporta sin
 *   tratamiento especial: sigue siendo una decisión `accepted` cuyo `mode` la
 *   distingue.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS; no usa `Math.random` ni `Date`. Todos los tipos son `Readonly`. Los
 * mensajes visibles se transportan por `messageKey` (`es-ES`).
 */
import type { GameSnapshot, GameState } from "./state.js";
import {
  accepted,
  awaitingRoll,
  blocked,
  rejected,
  type DomainMessage,
  type GameCommand,
  type TransitionDecision,
} from "./transition.js";
import {
  resolutionMatchesRequest,
  type DiceRollRequest,
  type DiceRollResolution,
} from "./dice-roll.js";
import { resolvePrecedence } from "./precedence.js";
import type {
  ActionDescriptor,
  RulesCatalogView,
} from "./catalog-view.js";

// Reexporta la vista de catálogo y la precedencia para que los consumidores que
// históricamente importan desde `./rules-engine.js` conserven su superficie
// pública.
export type {
  ActionDescriptor,
  RulePriority,
  RuleKind,
  CatalogRuleView,
  CatalogActionView,
  RulesCatalogView,
} from "./catalog-view.js";
export {
  resolvePrecedence,
  MISSING_PRIORITY_DECISION_REF,
  type PrecedenceResolution,
} from "./precedence.js";

/**
 * Implementación pura del puerto `RulesEngine` centrada en el contrato de
 * decisión (Tarea 8.1). Opera sobre una {@link RulesCatalogView} adaptada por
 * la capa de aplicación.
 */
export interface RulesEngineView {
  decide(
    snapshot: GameSnapshot,
    command: GameCommand,
    catalog: RulesCatalogView,
  ): TransitionDecision;

  resumeRoll(
    snapshot: GameSnapshot,
    request: DiceRollRequest,
    resolution: DiceRollResolution,
    catalog: RulesCatalogView,
  ): TransitionDecision;

  availableActions(
    state: GameState,
    catalog: RulesCatalogView,
  ): readonly ActionDescriptor[];
}

/** Mensaje `es-ES` para un comando no permitido en el estado. */
function noApplicableRuleMessage(commandType: string): DomainMessage {
  return Object.freeze({
    messageKey: "rules.command.notApplicable",
    params: Object.freeze({ commandType }),
  });
}

/** `DecisionRef`/mensaje `es-ES` de una resolución de Tirada cruzada o reutilizada. */
function mismatchedResolutionMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.roll.resolutionMismatch" });
}

/** Mensaje `es-ES` cuando ninguna regla con capacidad de Tirada resuelve el contexto. */
function noRollRuleMessage(context: string): DomainMessage {
  return Object.freeze({
    messageKey: "rules.roll.noApplicableRule",
    params: Object.freeze({ context }),
  });
}

/** Proyecta un {@link ActionDescriptor} inmutable, omitiendo `params` si no hay. */
function describeAction(
  commandType: string,
  labelKey: string,
  params?: Readonly<Record<string, string | number>>,
): ActionDescriptor {
  return Object.freeze(
    params === undefined
      ? { commandType, labelKey }
      : { commandType, labelKey, params },
  );
}

/**
 * Crea el Motor de reglas puro.
 *
 * `decide`:
 * 1. Filtra las reglas aplicables al comando (por `commandType` y `matches`),
 *    SIN mutar `snapshot` ni `command`.
 * 2. Resuelve la precedencia ({@link resolvePrecedence}).
 *    - `none`  => `rejected` (comando no permitido; sin regla ni `default`).
 *    - `blocked` => `blocked` con la `DecisionRef` (DP-002); NO se aplica
 *      ningún efecto ni se consume aleatoriedad.
 *    - `winner` => si la regla declara capacidad de Tirada, `awaiting-roll`
 *      (fase 1); en otro caso se invoca `apply` y se devuelve `accepted`.
 *
 * `availableActions` enumera únicamente las Acciones declaradas por el catálogo
 * cuyo `enabled(state)` es verdadero. No inventa Acciones ad hoc ni añade
 * `default`.
 *
 * Conservación ante rechazo/bloqueo previo al azar (Tarea 8.2, Propiedad 4):
 * las ramas `rejected` y `blocked` NO tocan aleatoriedad, por lo que el Estado
 * aleatorio recibido se conserva EXACTAMENTE. Ese invariante se expone de forma
 * reutilizable en {@link ./random-preservation.js}.
 *
 * Detención `stopped-after-consumption` (Tarea 8.3, Propiedad 5): cuando el
 * `apply` de la regla ganadora efectúa un Consumo aleatorio que los requisitos
 * obligan a conservar (13.7, 17.6) y detecta una carencia, devuelve una
 * propuesta atómica en ese modo; el Motor la transporta como cualquier otra
 * `accepted`: no la inspecciona ni la altera.
 */
export function createRulesEngine(): RulesEngineView {
  function decide(
    snapshot: GameSnapshot,
    command: GameCommand,
    catalog: RulesCatalogView,
  ): TransitionDecision {
    const state = snapshot.state;

    const applicable = catalog.rules.filter(
      (rule) =>
        rule.commandType === command.type && rule.matches(state, command),
    );

    const resolution = resolvePrecedence(applicable);

    if (resolution.kind === "none") {
      return rejected(noApplicableRuleMessage(command.type));
    }
    if (resolution.kind === "blocked") {
      return blocked(resolution.reason, resolution.decisionRef);
    }

    // `winner`: si la regla declara una capacidad de Tirada de dados (diseño §3,
    // req. 41), el Motor devuelve `awaiting-roll` con la solicitud declarativa
    // SIN mutar estado ni consumir azar (fase 1); la resolución llega después
    // por `resumeRoll` (fase 2). En otro caso, `apply` es puro y produce la
    // propuesta (`complete` o `stopped-after-consumption`).
    if (resolution.rule.roll !== undefined) {
      const request = resolution.rule.roll.requestRoll(snapshot, command);
      return awaitingRoll(request);
    }
    const proposal = resolution.rule.apply(snapshot, command);
    return accepted(proposal);
  }

  /**
   * Segunda fase de una Tirada de dados (diseño §3, req. 41.5, 41.23, 41.24).
   *
   * 1. Verifica que la resolución corresponde EXACTAMENTE a la solicitud
   *    (identidad, Partida, Instantánea esperada y contexto). Una resolución
   *    obsoleta, cruzada o reutilizada => `rejected` sin efectos ni azar nuevo.
   * 2. Comprueba que la Instantánea recibida sigue siendo la esperada por la
   *    solicitud (control optimista de concurrencia, req. 41.23).
   * 3. Localiza la regla con capacidad de Tirada que cubre el contexto y delega
   *    la interpretación de las caras efectivas en su `interpret` puro. El paso
   *    aleatorio ya está reservado en la resolución: `resumeRoll` NO consume
   *    otra vez (uso único, req. 41.24). Devuelve `accepted` con la propuesta.
   *
   * NO muta sus argumentos.
   */
  function resumeRoll(
    snapshot: GameSnapshot,
    request: DiceRollRequest,
    resolution: DiceRollResolution,
    catalog: RulesCatalogView,
  ): TransitionDecision {
    if (!resolutionMatchesRequest(request, resolution)) {
      return rejected(mismatchedResolutionMessage());
    }
    if (snapshot.id !== request.expectedSnapshotId) {
      return rejected(mismatchedResolutionMessage());
    }

    const rule = catalog.rules.find(
      (candidate) => candidate.roll !== undefined,
    );
    if (rule === undefined || rule.roll === undefined) {
      return rejected(noRollRuleMessage(request.context.label));
    }

    const proposal = rule.roll.interpret(snapshot, resolution);
    return accepted(proposal);
  }

  function availableActions(
    state: GameState,
    catalog: RulesCatalogView,
  ): readonly ActionDescriptor[] {
    const descriptors: ActionDescriptor[] = [];
    for (const action of catalog.actions) {
      if (!action.enabled(state)) continue;
      descriptors.push(
        describeAction(action.commandType, action.labelKey, action.params),
      );
    }
    return Object.freeze(descriptors);
  }

  return Object.freeze({ decide, resumeRoll, availableActions });
}
