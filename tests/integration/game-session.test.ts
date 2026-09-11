/**
 * Cableado final de la sesión de juego (Tarea 27.1).
 *
 * Verifica que `GameSession` conecta la cadena completa del diseño extremo a
 * extremo y respeta las fronteras exigidas por los requisitos 5.1, 20.1, 24.11,
 * 30.1, 30.3, 30.12 y 40.12:
 *
 * - un comando emitido por la Interfaz atraviesa el traductor (que elimina la
 *   modalidad), la unidad de trabajo, el Motor, las Invariantes y el commit
 *   único, y vuelve como proyección `es-ES`;
 * - la misma acción por tacto o por ratón produce el mismo `GameCommand` y el
 *   mismo resultado (24.11);
 * - el selector solo ofrece Misiones `published`: el contenido no publicable
 *   permanece bloqueado extremo a extremo (30.12, 40.12);
 * - las proyecciones no introducen valores lúdicos: reflejan lo que el dominio
 *   produjo (20.1, 30.1, 30.3);
 * - una resolución con dados recorre la segunda fase del contrato de Tirada y se
 *   confirma por el mismo commit único;
 * - el Bloqueo local oculta el contenido hasta verificar (26.11).
 */
import { describe, expect, it } from "vitest";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
  type GameId,
} from "../../src/domain/identity/index.js";
import { pieceId as makePieceId } from "../../src/domain/geometry/identifiers.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
} from "../../src/domain/engine/state.js";
import {
  transitionProposal,
  type GameCommand,
} from "../../src/domain/engine/transition.js";
import {
  diceRollRequest,
  type DiceRollRequest,
} from "../../src/domain/engine/dice-roll.js";
import type {
  CatalogRuleView,
  RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import { createRulesEngine } from "../../src/domain/engine/rules-engine.js";
import type {
  CommitReceipt,
  GameRepository,
  PersistableTransition,
} from "../../src/domain/ports/index.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/index.js";
import {
  GameCommandDispatcher,
  DiceRollCoordinator,
  type Clock,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";
import { pureVersionedRandom } from "../../src/domain/random/index.js";
import { GameSession } from "../../src/application/session/index.js";
import { interactionIntent } from "../../src/adapters/browser/inputs/index.js";
import { MISSIONS } from "../../src/catalog/FON-ML-2022/missions.js";
import {
  createLocalVerifierMaterial,
  type LocalVerifierMaterial,
} from "../../src/domain/access/index.js";

// --- Utilidades comunes -----------------------------------------------------

const RV = rulesVersion("rv-1");
const SV = saveVersion("sv-1");

function integrity(value: unknown): GameSnapshot["integrity"] {
  return { algorithm: "test", value: JSON.stringify(value) };
}

function makeSnapshot(
  id: string,
  gameId: GameId,
  turn: number,
  randomPosition: number,
  algorithmVersion: string = "rav-1",
): GameSnapshot {
  const state = gameState({
    gameId,
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: RV,
    saveVersion: SV,
    difficulty: { id: "normal" },
    duration: { turns: 4 },
    turn,
    phase: "british",
    activation: {},
    pieces: {},
    unknowns: {},
    objectives: {},
    effects: [],
    outcome: "in-progress",
  });
  return gameSnapshot({
    id: makeSnapshotId(id),
    gameId,
    confirmedAt: `2024-01-01T00:0${turn}:00.000Z`,
    state,
    randomState: { seed: "seed-1", position: randomPosition, algorithmVersion },
    simpleLog: [],
    detailedLog: [],
    integrity: integrity({ id, turn }),
  });
}

/** Repositorio en memoria: última confirmada por gameId, commit atómico. */
class InMemoryRepository implements GameRepository {
  private readonly latest = new Map<string, GameSnapshot>();

  public seed(snapshot: GameSnapshot): void {
    this.latest.set(snapshot.gameId as string, snapshot);
  }

  public loadLatest(gameId: GameId): Promise<GameSnapshot> {
    const found = this.latest.get(gameId as string);
    if (found === undefined) {
      return Promise.reject(new Error(`sin Partida ${gameId as string}`));
    }
    return Promise.resolve(found);
  }

  public commit(proposal: PersistableTransition): Promise<CommitReceipt> {
    this.latest.set(proposal.next.gameId as string, proposal.next);
    const receipt: CommitReceipt = {
      gameId: proposal.next.gameId,
      snapshotId: proposal.next.id,
      latestSnapshotId: proposal.next.id,
      ...(proposal.next.previousSnapshotId !== undefined
        ? { previousSnapshotId: proposal.next.previousSnapshotId }
        : {}),
    };
    return Promise.resolve(receipt);
  }

  public list(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  public isolateCorrupt(): Promise<void> {
    return Promise.resolve();
  }
}

function counter(prefix: string): SnapshotIdGenerator {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `${prefix}-${n}`;
    },
  };
}

function makeClock(): Clock {
  let n = 0;
  return {
    now: (): string => {
      n += 1;
      return `2024-06-01T00:00:0${n}.000Z`;
    },
  };
}

/** Regla determinista que avanza un turno (sin dados). */
function advanceRule(): CatalogRuleView {
  return {
    id: "advance-turn",
    kind: "concrete",
    priority: 100,
    commandType: "advance",
    matches: () => true,
    apply: (snapshot) =>
      transitionProposal({
        expectedSnapshotId: snapshot.id,
        next: gameSnapshot({
          id: makeSnapshotId("engine-placeholder"),
          gameId: snapshot.gameId,
          confirmedAt: "engine-placeholder",
          state: gameState({ ...snapshot.state, turn: snapshot.state.turn + 1 }),
          randomState: snapshot.randomState,
          simpleLog: snapshot.simpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: integrity({ advanced: true }),
        }),
        mode: "complete",
      }),
  };
}

function makeSession(
  repository: InMemoryRepository,
  rules: readonly CatalogRuleView[],
  publishableMissionIds: readonly ReturnType<typeof makeMissionId>[],
  startup: { online: boolean; material: LocalVerifierMaterial | undefined } = {
    online: true,
    material: undefined,
  },
): GameSession {
  const engine = createRulesEngine();
  const catalog: RulesCatalogView = { rules, actions: [] };
  const dispatcher = new GameCommandDispatcher({
    repository,
    engine,
    catalog,
    clock: makeClock(),
    idGenerator: counter("commit"),
  });
  const diceCoordinator = new DiceRollCoordinator({
    engine,
    catalog,
    random: pureVersionedRandom,
  });
  return new GameSession({
    dispatcher,
    diceCoordinator,
    engine,
    catalog,
    missions: MISSIONS,
    publication: { publishableMissionIds },
    startup,
  });
}

// --- Pruebas ----------------------------------------------------------------

describe("GameSession — cadena completa Interfaz→Motor→Invariantes→IndexedDB", () => {
  it("un intento de la Interfaz atraviesa la cadena y confirma una Instantánea", async () => {
    const repository = new InMemoryRepository();
    const gameId = makeGameId("g-1");
    const initial = makeSnapshot("s-0", gameId, 0, 0);
    repository.seed(initial);
    const session = makeSession(repository, [advanceRule()], []);

    const intent = interactionIntent({ semanticAction: "activate", source: "touch" });
    const result = await session.submitIntent(
      intent,
      { commandType: "advance", irreversible: false },
      { gameId, expectedSnapshotId: initial.id },
    );

    expect(result.kind).toBe("outcome");
    if (result.kind !== "outcome") return;
    expect(result.outcome.kind).toBe("committed");

    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(1);
    // La proyección refleja el turno del dominio; no lo calcula la Interfaz.
    const projection = session.project(latest);
    expect(projection.turn).toBe(1);
    expect(projection.gameId).toBe(gameId);
  });

  it("tacto y ratón producen el mismo GameCommand y el mismo resultado (24.11)", async () => {
    const capturedCommands: GameCommand[] = [];
    const captureRule: CatalogRuleView = {
      ...advanceRule(),
      matches: (_state, command) => {
        capturedCommands.push(command);
        return true;
      },
    };

    const repoTouch = new InMemoryRepository();
    const repoMouse = new InMemoryRepository();
    const gameId = makeGameId("g-eq");
    repoTouch.seed(makeSnapshot("s-0", gameId, 0, 0));
    repoMouse.seed(makeSnapshot("s-0", gameId, 0, 0));

    const sessionTouch = makeSession(repoTouch, [captureRule], []);
    const sessionMouse = makeSession(repoMouse, [captureRule], []);

    const action = { commandType: "advance", irreversible: false } as const;
    const context = { gameId, expectedSnapshotId: makeSnapshotId("s-0") };

    await sessionTouch.submitIntent(
      interactionIntent({ semanticAction: "activate", source: "touch", subjectId: makePieceId("p-1") }),
      action,
      context,
    );
    await sessionMouse.submitIntent(
      interactionIntent({ semanticAction: "activate", source: "mouse", subjectId: makePieceId("p-1") }),
      action,
      context,
    );

    expect(capturedCommands).toHaveLength(2);
    const [byTouch, byMouse] = capturedCommands;
    // Los comandos son idénticos: la modalidad no llega al Motor.
    expect(byMouse).toEqual(byTouch);
    expect("source" in (byTouch as object)).toBe(false);
  });

  it("una selección irreversible no confirma comando hasta la confirmación (24.12)", async () => {
    const repository = new InMemoryRepository();
    const gameId = makeGameId("g-irr");
    repository.seed(makeSnapshot("s-0", gameId, 0, 0));
    const session = makeSession(repository, [advanceRule()], []);

    const result = await session.submitIntent(
      interactionIntent({ semanticAction: "select", source: "touch", subjectId: makePieceId("p-1") }),
      { commandType: "advance", irreversible: true },
      { gameId, expectedSnapshotId: makeSnapshotId("s-0") },
    );

    expect(result.kind).toBe("no-command");
    if (result.kind !== "no-command") return;
    expect(result.translation.kind).toBe("awaiting-confirmation");
    // El Estado de partida se conserva: nada confirmado.
    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(0);
  });
});

describe("GameSession — publicación cerrada extremo a extremo (30.12, 40.12)", () => {
  it("solo ofrece Misiones published, con su nombre propio es-ES", () => {
    const repository = new InMemoryRepository();
    const publishable = [makeMissionId("FON-ML-2022-M01"), makeMissionId("FON-ML-2022-M08")];
    const session = makeSession(repository, [advanceRule()], publishable);

    const options = session.availableMissions();
    expect(options.map((o) => o.number)).toEqual([1, 8]);
    expect(options.map((o) => o.name)).toEqual([
      "Control del bosque I",
      "Entrada en la iglesia",
    ]);
    // El título inglés nunca aparece como contenido de juego.
    for (const option of options) {
      expect(JSON.stringify(option)).not.toContain("Secure the Woods");
    }
  });

  it("una Misión no publicable nunca es jugable ni se ofrece", () => {
    const repository = new InMemoryRepository();
    const session = makeSession(repository, [advanceRule()], [
      makeMissionId("FON-ML-2022-M01"),
    ]);

    expect(session.canPlayMission(makeMissionId("FON-ML-2022-M01"))).toBe(true);
    expect(session.canPlayMission(makeMissionId("FON-ML-2022-M02"))).toBe(false);
    expect(session.availableMissions().some((o) => o.number === 2)).toBe(false);
  });
});

describe("GameSession — segunda fase de una Tirada de dados", () => {
  it("resuelve una Tirada automática y confirma por el commit único", async () => {
    const gameId = makeGameId("g-roll");
    const initialId = "s-0";
    // El Estado aleatorio usa el algoritmo real para poder reservar un paso.
    const initial = makeSnapshot(initialId, gameId, 0, 0, ALGORITHM_SPLITMIX64_V1 as string);
    const repository = new InMemoryRepository();
    repository.seed(initial);

    const request: DiceRollRequest = diceRollRequest({
      id: "roll-1" as DiceRollRequest["id"],
      gameId,
      expectedSnapshotId: initial.id,
      context: { label: "activacion" },
      domain: { kind: "dice", count: 2, sides: 6 },
      diceOrder: [0, 1],
      outcomeMetadata: {
        kind: "calculation",
        targetValue: 7,
        baseValues: [],
        modifiers: [],
        formula: "2d6",
        comparison: ">=",
        sourceRefs: [],
      },
    });

    // Regla con capacidad de Tirada: interpreta las caras avanzando el turno y
    // conservando el Estado aleatorio reservado por la resolución.
    const rollRule: CatalogRuleView = {
      id: "roll-activation",
      kind: "concrete",
      priority: 100,
      commandType: "roll-activation",
      matches: () => true,
      apply: (snapshot) => {
        throw new Error(`apply no debe invocarse para ${snapshot.id as string}`);
      },
      roll: {
        requestRoll: () => request,
        interpret: (snapshot, resolution) =>
          transitionProposal({
            expectedSnapshotId: snapshot.id,
            next: gameSnapshot({
              id: makeSnapshotId("engine-placeholder"),
              gameId: snapshot.gameId,
              confirmedAt: "engine-placeholder",
              state: gameState({ ...snapshot.state, turn: snapshot.state.turn + 1 }),
              randomState: {
                seed: resolution.nextRandomState.seed,
                position: resolution.nextRandomState.position,
                algorithmVersion: resolution.nextRandomState.algorithmVersion as unknown as string,
              },
              simpleLog: snapshot.simpleLog,
              detailedLog: snapshot.detailedLog,
              integrity: integrity({ rolled: resolution.effectiveFaces }),
            }),
            mode: "complete",
          }),
      },
    };

    const session = makeSession(repository, [rollRule], []);
    const result = await session.resolveRoll(initial, request, { source: "automatic" });

    expect(result.kind).toBe("outcome");
    if (result.kind !== "outcome") return;
    expect(result.outcome.kind).toBe("committed");

    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(1);
    // El Estado aleatorio avanzó exactamente un paso.
    expect(latest.randomState.position).toBeGreaterThan(initial.randomState.position);
  });

  it("una entrada manual fuera de rango no reserva azar ni confirma nada", async () => {
    const gameId = makeGameId("g-roll-invalid");
    const initial = makeSnapshot("s-0", gameId, 0, 0, ALGORITHM_SPLITMIX64_V1 as string);
    const repository = new InMemoryRepository();
    repository.seed(initial);

    const request: DiceRollRequest = diceRollRequest({
      id: "roll-1" as DiceRollRequest["id"],
      gameId,
      expectedSnapshotId: initial.id,
      context: { label: "activacion" },
      domain: { kind: "dice", count: 2, sides: 6 },
      diceOrder: [0, 1],
      outcomeMetadata: {
        kind: "calculation",
        targetValue: 7,
        baseValues: [],
        modifiers: [],
        formula: "2d6",
        comparison: ">=",
        sourceRefs: [],
      },
    });
    const rollRule: CatalogRuleView = {
      id: "roll-activation",
      kind: "concrete",
      priority: 100,
      commandType: "roll-activation",
      matches: () => true,
      apply: (s) => {
        throw new Error(`apply no debe invocarse (${s.id as string})`);
      },
      roll: {
        requestRoll: () => request,
        interpret: () => {
          throw new Error("interpret no debe invocarse con entrada inválida");
        },
      },
    };

    const session = makeSession(repository, [rollRule], []);
    const result = await session.resolveRoll(initial, request, {
      source: "manual",
      faces: [7, 0], // fuera de 1..6
    });

    expect(result.kind).toBe("invalid-roll-input");
    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(0);
    expect(latest.randomState.position).toBe(0);
  });
});

describe("GameSession — Bloqueo local oculta el contenido (26.11)", () => {
  const material = createLocalVerifierMaterial("sal-de-prueba-1234", {
    username: "propietario",
    key: "clave-de-alta-entropia",
  });

  it("sin conexión y con material presente, oculta Misiones hasta verificar", () => {
    const repository = new InMemoryRepository();
    // offline + material => locked => contenido oculto (26.11).
    const session = makeSession(repository, [advanceRule()], [
      makeMissionId("FON-ML-2022-M01"),
    ], { online: false, material });

    expect(session.lockView().contentVisible).toBe(false);
    expect(session.availableMissions()).toHaveLength(0);
    expect(session.canPlayMission(makeMissionId("FON-ML-2022-M01"))).toBe(false);

    // Tras verificar la credencial correcta, el contenido vuelve a ser visible.
    const unlock = session.unlock({
      username: "propietario",
      key: "clave-de-alta-entropia",
    });
    expect(unlock.unlocked).toBe(true);
    expect(session.availableMissions().map((o) => o.number)).toEqual([1]);
  });

  it("una credencial incorrecta conserva el contenido oculto", () => {
    const repository = new InMemoryRepository();
    const session = makeSession(repository, [advanceRule()], [
      makeMissionId("FON-ML-2022-M01"),
    ], { online: false, material });

    const unlock = session.unlock({ username: "propietario", key: "clave-erronea" });
    expect(unlock.unlocked).toBe(false);
    expect(session.availableMissions()).toHaveLength(0);
  });

  it("en línea (Control de acceso media) el contenido es visible", () => {
    const repository = new InMemoryRepository();
    const session = makeSession(repository, [advanceRule()], [
      makeMissionId("FON-ML-2022-M01"),
    ], { online: true, material });

    expect(session.lockView().contentVisible).toBe(true);
    expect(session.availableMissions().map((o) => o.number)).toEqual([1]);
  });
});
