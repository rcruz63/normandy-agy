/**
 * Vista estructural del catálogo que necesita el Motor de reglas (Tarea 8.1).
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). Para operar sobre el catálogo dentro del dominio
 * SIN acoplarnos a su forma concreta, se define aquí una VISTA estructural con
 * solo lo que el Motor necesita para decidir y precedir. La capa de aplicación
 * adapta el `RulesCatalog` real (Tarea 2) a esta vista antes de invocar al
 * Motor, compilando los predicados/efectos declarativos a las funciones puras
 * `matches`/`apply`/`enabled`. Así el dominio permanece puro y desacoplado del
 * esquema del catálogo.
 *
 * Módulo puro y determinista: no importa DOM, IndexedDB, red, reloj ni SDK de
 * AWS. Todos los tipos son `Readonly`.
 */
import type { DecisionRef } from "../identity/index.js";
import type { GameSnapshot, GameState } from "./state.js";
import type { GameCommand, TransitionProposal } from "./transition.js";
import type { DiceRollRequest, DiceRollResolution } from "./dice-roll.js";

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
  /**
   * Capacidad OPCIONAL de Tirada de dados en dos fases (diseño §3, req. 41).
   *
   * Cuando una regla necesita dados, declara este objeto. `requestRoll`
   * construye la {@link DiceRollRequest} declarativa que el Motor devuelve como
   * decisión `awaiting-roll` (fase 1), SIN mutar estado ni consumir azar.
   * `interpret` recibe la {@link DiceRollResolution} validada por el Coordinador
   * y produce la {@link TransitionProposal} confirmable interpretando las caras
   * efectivas mediante las reglas canónicas (fase 2). Ambas funciones son puras.
   *
   * Una regla sin esta capacidad resuelve de forma determinista mediante
   * `apply` (sin dados). Este es el ÚNICO punto por el que una regla canaliza
   * una Tirada; la Interfaz y los submódulos no generan caras (req. 41.4, 41.34).
   */
  roll?: Readonly<{
    requestRoll: (
      snapshot: GameSnapshot,
      command: GameCommand,
    ) => DiceRollRequest;
    interpret: (
      snapshot: GameSnapshot,
      resolution: DiceRollResolution,
    ) => TransitionProposal;
  }>;
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
