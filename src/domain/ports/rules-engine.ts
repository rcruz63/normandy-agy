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
  DiceRollRequest,
  DiceRollResolution,
  DomainMessage,
  GameCommand,
  GameSnapshot,
  GameState,
  RulesCatalog,
  TransitionProposal,
} from "./placeholders.js";

export type TransitionDecision =
  | Readonly<{ kind: "accepted"; proposal: TransitionProposal }>
  | Readonly<{ kind: "awaiting-roll"; request: DiceRollRequest }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>
  | Readonly<{ kind: "blocked"; reason: DomainMessage; decisionRef: DecisionRef }>;

export interface RulesEngine {
  decide(
    snapshot: GameSnapshot,
    command: GameCommand,
    catalog: RulesCatalog,
  ): TransitionDecision;

  /**
   * Reanuda una resolución que declaró una Tirada pendiente con la resolución
   * validada por el Coordinador (diseño §3, requisitos 41.5, 41.23, 41.24).
   * Verifica identidad, Partida, Instantánea esperada, contexto, dominio y uso
   * único; interpreta las caras efectivas mediante las reglas canónicas y
   * devuelve una decisión `accepted` (o `rejected`/`blocked` si la resolución
   * es obsoleta, cruzada o reutilizada). No consume otra vez aleatoriedad: usa
   * el paso ya reservado en la resolución.
   */
  resumeRoll(
    snapshot: GameSnapshot,
    request: DiceRollRequest,
    resolution: DiceRollResolution,
    catalog: RulesCatalog,
  ): TransitionDecision;

  availableActions(
    state: GameState,
    catalog: RulesCatalog,
  ): readonly ActionDescriptor[];
}
