/**
 * Puerto del Motor de reglas puro (diseño §2).
 *
 * Expone un único contrato de transición. `decide` no muta sus argumentos.
 * `rejected` y los bloqueos previos a una resolución aleatoria devuelven
 * exactamente el Estado aleatorio recibido; cuando hay que conservar un Consumo
 * ya efectuado, la propuesta es atómica `stopped-after-consumption`.
 */
import type { DecisionRef } from "../identity/index.js";
import type {
  ActionDescriptor,
  DomainMessage,
  GameCommand,
  GameSnapshot,
  GameState,
  RulesCatalog,
  TransitionProposal,
} from "./placeholders.js";

export type TransitionDecision =
  | Readonly<{ kind: "accepted"; proposal: TransitionProposal }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>
  | Readonly<{ kind: "blocked"; reason: DomainMessage; decisionRef: DecisionRef }>;

export interface RulesEngine {
  decide(
    snapshot: GameSnapshot,
    command: GameCommand,
    catalog: RulesCatalog,
  ): TransitionDecision;

  availableActions(
    state: GameState,
    catalog: RulesCatalog,
  ): readonly ActionDescriptor[];
}
