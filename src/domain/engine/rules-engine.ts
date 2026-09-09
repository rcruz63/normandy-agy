/**
 * Motor de reglas puro: contrato de transición y precedencia canónica
 * (Tarea 8.1, diseño §2 «Motor de reglas puro»).
 *
 * Este módulo implementa `decide` y `availableActions` centrándose en el
 * CONTRATO DE DECISIÓN y en la PRECEDENCIA canónica:
 *
 * - Todas las reglas —genéricas y concretas— se resuelven mediante POLÍTICAS DE
 *   PRIORIDAD almacenadas en el catálogo. Una regla concreta (requisitos 32-39)
 *   prevalece sobre una genérica CUANDO ASÍ ESTÁ REGISTRADO por su prioridad.
 * - La ausencia de una prioridad necesaria NO cae en un `default`: produce
 *   `blocked` con una `DecisionRef` (DP-002), sin aplicar efectos ni consumir
 *   aleatoriedad (diseño §2; requisitos 5.8, 8.8, 8.9, 9.7, …, 18.6).
 * - `decide` NO muta sus argumentos.
 *
 * Frontera de capas (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`) —lo impediría el `rootDir` del dominio y la
 * regla de fronteras—. El puerto `RulesEngine` declara `RulesCatalog` como una
 * marca opaca (`src/domain/ports/placeholders.ts`). Para operar sobre el
 * catálogo dentro del dominio SIN acoplarnos a su forma concreta, este módulo
 * define una VISTA ESTRUCTURAL local, {@link RulesCatalogView}, con solo lo que
 * el Motor necesita para decidir y precedir. La capa de aplicación adapta el
 * `RulesCatalog` real (Tarea 2) a esta vista antes de invocar al Motor. Así el
 * dominio permanece puro y desacoplado del esquema del catálogo.
 *
 * Fronteras de tareas hermanas:
 * - Tarea 8.2 (conservación ante rechazo/bloqueo previo al azar) y Tarea 8.3
 *   (`stopped-after-consumption`) construyen SOBRE este contrato. Aquí se dejan
 *   ganchos `TODO(8.2)` / `TODO(8.3)` donde esos comportamientos se acoplarán;
 *   este módulo no consume aleatoriedad ni aplica efectos: solo resuelve
 *   precedencia y decide `accepted` (mediante un `effectApplier` inyectado por
 *   los submódulos) / `rejected` / `blocked`.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS; no usa `Math.random` ni `Date`. Todos los tipos son `Readonly`. Los
 * mensajes visibles se transportan por `messageKey` (`es-ES`).
 */
import type { DecisionRef } from "../identity/index.js";
import { decisionRef as makeDecisionRef } from "../identity/index.js";
import type { GameSnapshot, GameState } from "./state.js";
import {
  accepted,
  blocked,
  rejected,
  type DomainMessage,
  type GameCommand,
  type TransitionDecision,
  type TransitionProposal,
} from "./transition.js";

/**
 * Descriptor de una Acción disponible en un Estado (forma de dominio de
 * `ActionDescriptor`). El proyector `es-ES` resuelve `labelKey`; `commandType`
 * enlaza con el `type` del `GameCommand` que la ejecutaría.
 *
 * Nota de frontera: el puerto declara `ActionDescriptor` como marca opaca; esta
 * es la forma concreta del dominio que la capa de aplicación/UI proyecta.
 */
export type ActionDescriptor = Readonly<{
  commandType: string;
  labelKey: string;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * Prioridad de precedencia de una regla, tomada del catálogo.
 *
 * Igual que `CanonicalRule.priority` en el esquema (Tarea 2.1): o bien un entero
 * (prioridad definida; mayor gana) o bien una `DecisionRef` que indica que la
 * prioridad relativa NO está resuelta (DP-002) y, por tanto, debe producir
 * `blocked` en lugar de aplicar un `default`.
 */
export type RulePriority = number | DecisionRef;

/** Naturaleza de una regla: concreta (req. 32-39) o genérica. */
export type RuleKind = "concrete" | "generic";

/**
 * Regla candidata en la VISTA del catálogo que ve el Motor.
 *
 * `matches(state, command)` decide si la regla es aplicable al comando en el
 * estado dado (predicado declarativo del catálogo, ya evaluado por el
 * adaptador). `apply` es el efecto declarativo compilado a una función pura que
 * produce la propuesta de transición cuando esta regla gana la precedencia.
 *
 * La regla NO consume aleatoriedad ni muta el estado: `apply` debe construir
 * una nueva `TransitionProposal` a partir de la Instantánea recibida. La
 * resolución aleatoria y la conservación de Consumo son responsabilidad de las
 * Tareas 8.2/8.3 y de los submódulos que provean estos `apply`.
 */
export type CatalogRuleView = Readonly<{
  id: string;
  kind: RuleKind;
  priority: RulePriority;
  /** Comando(s) que esta regla resuelve. */
  commandType: string;
  matches: (state: GameState, command: GameCommand) => boolean;
  apply: (snapshot: GameSnapshot, command: GameCommand) => TransitionProposal;
}>;

/**
 * Acción declarada como permitida por el catálogo en un estado. `enabled`
 * evalúa la elegibilidad sin efectos secundarios; `describe` produce el
 * descriptor proyectable.
 */
export type CatalogActionView = Readonly<{
  commandType: string;
  labelKey: string;
  enabled: (state: GameState) => boolean;
  params?: Readonly<Record<string, string | number>>;
}>;

/**
 * VISTA estructural del catálogo que necesita el Motor de reglas.
 *
 * La capa de aplicación construye esta vista a partir del `RulesCatalog` real
 * (Tarea 2), compilando predicados/efectos declarativos a las funciones puras
 * `matches`/`apply`/`enabled`. El dominio no conoce el esquema del catálogo:
 * solo esta interfaz.
 */
export type RulesCatalogView = Readonly<{
  rules: readonly CatalogRuleView[];
  actions: readonly CatalogActionView[];
}>;

/**
 * `DecisionRef` canónica de DP-002 cuando falta una prioridad de precedencia.
 * El prefijo `DP-002` es el que reconoce el Publication Gate (Tarea 2.3).
 */
const MISSING_PRIORITY_DECISION_REF: DecisionRef = makeDecisionRef(
  "DP-002-missing-priority",
);

/** Mensaje `es-ES` para el bloqueo por precedencia no resuelta. */
function missingPriorityMessage(
  ruleA: string,
  ruleB: string,
): DomainMessage {
  return Object.freeze({
    messageKey: "rules.precedence.unresolved",
    params: Object.freeze({ ruleA, ruleB }),
  });
}

/** Mensaje `es-ES` para un comando no permitido en el estado. */
function noApplicableRuleMessage(commandType: string): DomainMessage {
  return Object.freeze({
    messageKey: "rules.command.notApplicable",
    params: Object.freeze({ commandType }),
  });
}

/** ¿La prioridad está definida (entero) o pendiente (DecisionRef, DP-002)? */
function hasDefinedPriority(
  priority: RulePriority,
): priority is number {
  return typeof priority === "number";
}

/**
 * Resuelve la precedencia entre reglas aplicables.
 *
 * Reglas de precedencia (diseño §2):
 * - Si alguna regla aplicable carece de prioridad definida (su `priority` es una
 *   `DecisionRef`), la precedencia NO está resuelta: se devuelve `blocked` con
 *   esa `DecisionRef` (DP-002). No se aplica ningún `default`.
 * - Entre reglas con prioridad definida gana la de MAYOR prioridad numérica.
 * - Una regla concreta (req. 32-39) prevalece sobre una genérica CUANDO ASÍ
 *   ESTÁ REGISTRADO, es decir, cuando su prioridad numérica es mayor. El catálogo
 *   registra esa relación asignando a la concreta una prioridad superior.
 * - Si dos reglas aplicables comparten exactamente la MISMA prioridad numérica
 *   (empate sin desempate registrado), la precedencia relativa necesaria falta:
 *   se devuelve `blocked` con DP-002 (no hay `default`).
 */
export type PrecedenceResolution =
  | Readonly<{ kind: "winner"; rule: CatalogRuleView }>
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "blocked";
      reason: DomainMessage;
      decisionRef: DecisionRef;
    }>;

export function resolvePrecedence(
  applicable: readonly CatalogRuleView[],
): PrecedenceResolution {
  if (applicable.length === 0) {
    return Object.freeze({ kind: "none" });
  }

  // Ausencia de prioridad => blocked (DP-002), sin default.
  const undefinedPriority = applicable.find(
    (rule) => !hasDefinedPriority(rule.priority),
  );
  if (undefinedPriority !== undefined) {
    const ref = undefinedPriority.priority as DecisionRef;
    // El otro extremo del par para el diagnóstico (si lo hay).
    const other = applicable.find((r) => r.id !== undefinedPriority.id);
    return Object.freeze({
      kind: "blocked",
      reason: missingPriorityMessage(
        undefinedPriority.id,
        other?.id ?? undefinedPriority.id,
      ),
      decisionRef: ref,
    });
  }

  // Todas tienen prioridad numérica: seleccionar el máximo.
  let best = applicable[0]!;
  for (let i = 1; i < applicable.length; i += 1) {
    const candidate = applicable[i]!;
    if ((candidate.priority as number) > (best.priority as number)) {
      best = candidate;
    }
  }

  // Empate en la prioridad máxima => precedencia relativa no registrada.
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

/**
 * Implementación pura del puerto `RulesEngine` centrada en el contrato de
 * decisión y la precedencia canónica (Tarea 8.1). Opera sobre una
 * {@link RulesCatalogView} adaptada por la capa de aplicación.
 */
export interface RulesEngineView {
  decide(
    snapshot: GameSnapshot,
    command: GameCommand,
    catalog: RulesCatalogView,
  ): TransitionDecision;

  availableActions(
    state: GameState,
    catalog: RulesCatalogView,
  ): readonly ActionDescriptor[];
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
 *    - `winner` => se invoca `apply` de la regla ganadora para construir la
 *      propuesta y se devuelve `accepted`.
 *
 * `availableActions` enumera únicamente las Acciones declaradas por el catálogo
 * cuyo `enabled(state)` es verdadero. No inventa Acciones ad hoc ni añade
 * `default`.
 *
 * TODO(8.2): la conservación exacta del Estado aleatorio ante `rejected`/
 * `blocked` previos al azar es intrínseca aquí (no se toca aleatoriedad), pero
 * la Tarea 8.2 añadirá las pruebas de conservación y los ganchos de submódulos.
 * TODO(8.3): la detención `stopped-after-consumption` (avanzar exactamente una
 * vez el Estado aleatorio conservando el Consumo) la produce el `apply` del
 * submódulo correspondiente; el contrato de `accepted` ya la admite vía
 * `TransitionProposal.mode`.
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

    // `winner`: la regla ganadora produce la propuesta. `apply` es puro y no
    // muta sus argumentos (contrato de los submódulos).
    const proposal = resolution.rule.apply(snapshot, command);
    return accepted(proposal);
  }

  function availableActions(
    state: GameState,
    catalog: RulesCatalogView,
  ): readonly ActionDescriptor[] {
    const descriptors: ActionDescriptor[] = [];
    for (const action of catalog.actions) {
      if (action.enabled(state)) {
        descriptors.push(
          Object.freeze(
            action.params === undefined
              ? { commandType: action.commandType, labelKey: action.labelKey }
              : {
                  commandType: action.commandType,
                  labelKey: action.labelKey,
                  params: action.params,
                },
          ),
        );
      }
    }
    return Object.freeze(descriptors);
  }

  return Object.freeze({ decide, availableActions });
}

/** DecisionRef canónica usada al bloquear por prioridad ausente (DP-002). */
export { MISSING_PRIORITY_DECISION_REF };
