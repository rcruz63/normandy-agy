/**
 * Despachador de comandos / unidad de trabajo de Partida (Tarea 15.2, diseño §4).
 *
 * `GameCommandDispatcher` implementa el puerto `GameUnitOfWork` orquestando la
 * secuencia del diseño para cada comando, en exclusión mutua por `gameId`
 * mediante {@link PerGameQueue}:
 *
 * 1. Encolar en la cola de la Partida: solo una transición mutable por `gameId`
 *    en vuelo; Partidas distintas no comparten cola (requisitos 7.1, 21.9).
 * 2. Cargar la última Instantánea confirmada (`repository.loadLatest`).
 * 3. Control de concurrencia optimista: si `command.expectedSnapshotId` no es la
 *    última confirmada, se rechaza como `stale` SIN evaluar reglas ni consumir
 *    aleatoriedad (requisitos 7.9, 21.10); se conserva la última confirmada.
 * 4. `decide(snapshot, command, catalog)` del Motor puro.
 *    - `rejected`/`blocked`: sin azar; el Estado aleatorio recibido se conserva
 *      EXACTAMENTE (el Motor no lo toca) y con él la última confirmada.
 *    - `accepted`: se finaliza la Instantánea resultante con marca de tiempo e
 *      identificador INYECTADOS, se validan las Invariantes de la propuesta y,
 *      solo si son válidas, se confirma en UNA transacción única.
 * 5. Si el commit falla/aborta, IndexedDB revierte todo (nada a medias) y se
 *    conserva la última confirmada (requisitos 7.8, 21.10).
 *
 * FRONTERA DE CAPAS: vive en `application/`. Coordina puertos, exclusión mutua y
 * atomicidad; NO interpreta reglas (eso es del Motor). El reloj y el generador
 * de identificadores se INYECTAN para mantener testabilidad y no usar `Date` ni
 * `Math.random`. El catálogo se recibe como vista estructural inyectada, sin
 * acoplar la aplicación al esquema del catálogo.
 */
import { snapshotId as makeSnapshotId } from "../../domain/identity/index.js";
import {
  gameSnapshot,
  type GameSnapshot,
} from "../../domain/engine/state.js";
import {
  transitionProposal,
  type GameCommand,
  type TransitionDecision,
  type TransitionProposal,
} from "../../domain/engine/transition.js";
import { preservesRandomState } from "../../domain/engine/random-preservation.js";
import type {
  RulesCatalogView,
  RulesEngineView,
} from "../../domain/engine/rules-engine.js";
import { validateProposal } from "../../domain/invariants/invariant-validator.js";
import type {
  CommandOutcome,
  GameRepository,
  GameUnitOfWork,
} from "../../domain/ports/index.js";
import { PerGameQueue } from "./per-game-queue.js";
import {
  awaitingRollOutcome,
  failedOutcome,
  invalidOutcome,
  nonAcceptedOutcome,
  staleOutcome,
} from "./command-outcome-factory.js";

/** Reloj inyectable: devuelve la marca de tiempo de confirmación (`es-ES`). */
export interface Clock {
  now(): string;
}

/** Generador inyectable del identificador de la Instantánea confirmada. */
export interface SnapshotIdGenerator {
  next(): string;
}

/** Dependencias inyectadas del despachador. */
export type GameCommandDispatcherDeps = Readonly<{
  repository: GameRepository;
  engine: RulesEngineView;
  catalog: RulesCatalogView;
  clock: Clock;
  idGenerator: SnapshotIdGenerator;
}>;

/**
 * Unidad de trabajo con cola/mutex por `gameId`. Implementa `GameUnitOfWork`.
 */
export class GameCommandDispatcher implements GameUnitOfWork {
  private readonly repository: GameRepository;
  private readonly engine: RulesEngineView;
  private readonly catalog: RulesCatalogView;
  private readonly clock: Clock;
  private readonly idGenerator: SnapshotIdGenerator;
  private readonly queue = new PerGameQueue();

  public constructor(deps: GameCommandDispatcherDeps) {
    this.repository = deps.repository;
    this.engine = deps.engine;
    this.catalog = deps.catalog;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  /**
   * Ejecuta un comando en exclusión mutua por `gameId`. Devuelve el desenlace
   * ({@link CommandOutcome}) sin lanzar en las ramas de negocio; solo propaga
   * errores no contemplados (p. ej. ausencia de la Partida al cargar).
   */
  public execute(command: GameCommand): Promise<CommandOutcome> {
    return this.queue.enqueue(command.gameId, () => this.runExecute(command));
  }

  /**
   * Confirma una propuesta `accepted` YA decidida por el Motor a través de la
   * SEGUNDA fase de una Tirada de dados (Coordinador de Tiradas, diseño §3).
   *
   * El Coordinador de Tiradas reserva el paso aleatorio y obtiene del Motor
   * (`resumeRoll`) una decisión `accepted` cuyo `next` ya incorpora el efecto,
   * los registros y el Estado aleatorio reservado. Esta operación cierra el
   * ciclo por la MISMA ruta que un comando aceptado directo: se serializa por
   * `gameId`, revalida la concurrencia optimista contra la última confirmada,
   * finaliza la Instantánea con marca de tiempo e identificador inyectados,
   * valida las Invariantes y confirma en una transacción única.
   *
   * Si la última confirmada cambió desde que se calculó la propuesta, se rechaza
   * como `stale` SIN confirmar (concurrencia optimista, req. 7.9, 21.10): la
   * reserva aleatoria del Coordinador no llega a persistirse porque solo se
   * escribe a través de este commit transaccional.
   */
  public confirmDecision(proposal: TransitionProposal): Promise<CommandOutcome> {
    return this.queue.enqueue(proposal.next.gameId, () =>
      this.runConfirmDecision(proposal),
    );
  }

  private async runConfirmDecision(
    proposal: TransitionProposal,
  ): Promise<CommandOutcome> {
    const current = await this.repository.loadLatest(proposal.next.gameId);
    if (proposal.expectedSnapshotId !== current.id) {
      return staleOutcome(current, proposal.expectedSnapshotId, current.id);
    }
    return this.confirmAccepted(current, proposal);
  }

  private async runExecute(command: GameCommand): Promise<CommandOutcome> {
    const current = await this.repository.loadLatest(command.gameId);

    // Control de concurrencia optimista: expectedSnapshotId obsoleto se rechaza
    // sin evaluar reglas ni consumir aleatoriedad (requisitos 7.9, 21.10).
    if (command.expectedSnapshotId !== current.id) {
      return staleOutcome(current, command.expectedSnapshotId, current.id);
    }

    const decision = this.engine.decide(current, command, this.catalog);

    // `awaiting-roll`: el Motor declaró una Tirada pendiente sin mutar nada
    // (diseño §3, req. 41.1, 41.3). NO produce desenlace conservador: se deriva
    // al Coordinador de Tiradas a través del desenlace `awaiting-roll` con la
    // solicitud declarativa. El Estado aleatorio se conserva (fail-fast si no).
    if (decision.kind === "awaiting-roll") {
      ensureRandomPreserved(decision);
      return awaitingRollOutcome(current, decision.request);
    }

    if (decision.kind !== "accepted") {
      // `rejected`/`blocked`: conservan el Estado aleatorio (fail-fast si no).
      ensureRandomPreserved(decision);
      return nonAcceptedOutcome(current, decision);
    }

    return this.confirmAccepted(current, decision.proposal);
  }

  /**
   * Finaliza la propuesta aceptada con marca de tiempo e identificador
   * inyectados, valida sus Invariantes y confirma en una transacción única. Si
   * las Invariantes fallan, no confirma y conserva la última confirmada. Si el
   * commit falla/aborta, conserva la última confirmada (nada a medias).
   */
  private async confirmAccepted(
    current: GameSnapshot,
    proposal: TransitionProposal,
  ): Promise<CommandOutcome> {
    const finalized = this.finalizeProposal(current, proposal);

    const invariant = validateProposal(finalized, current);
    if (invariant.kind === "invalid-proposal") {
      return invalidOutcome(current, invariant.diagnostic, invariant.violations);
    }

    try {
      const receipt = await this.repository.commit({
        gameId: finalized.next.gameId,
        expectedSnapshotId: finalized.expectedSnapshotId,
        next: finalized.next,
        mode: finalized.mode,
      });
      return Object.freeze({
        kind: "committed",
        receipt,
        snapshot: finalized.next,
      });
    } catch (cause: unknown) {
      const detail = cause instanceof Error ? cause.name : "desconocido";
      return failedOutcome(current, detail);
    }
  }

  /**
   * Reconstruye la propuesta del Motor asignando a la Instantánea resultante el
   * identificador (generador inyectado) y la marca de tiempo (reloj inyectado)
   * de la capa de aplicación, y enlazándola a la última confirmada. Conserva
   * intactos estado, ambos registros y Estado aleatorio calculados por el Motor.
   */
  private finalizeProposal(
    current: GameSnapshot,
    proposal: TransitionProposal,
  ): TransitionProposal {
    const next = gameSnapshot({
      id: makeSnapshotId(this.idGenerator.next()),
      gameId: proposal.next.gameId,
      previousSnapshotId: current.id,
      confirmedAt: this.clock.now(),
      state: proposal.next.state,
      randomState: proposal.next.randomState,
      simpleLog: proposal.next.simpleLog,
      detailedLog: proposal.next.detailedLog,
      integrity: proposal.next.integrity,
    });
    return transitionProposal({
      expectedSnapshotId: current.id,
      next,
      mode: proposal.mode,
    });
  }
}

/**
 * Fail-fast del invariante de conservación: las decisiones `rejected`/`blocked`
 * NO tocan aleatoriedad. Si el Motor cambiara ese contrato, se detecta aquí en
 * vez de persistir un Estado aleatorio inconsistente.
 */
function ensureRandomPreserved(decision: TransitionDecision): void {
  if (!preservesRandomState(decision)) {
    throw new Error(
      "Contrato roto: una decisión de conservación no preserva el Estado aleatorio.",
    );
  }
}
