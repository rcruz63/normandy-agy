import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
  type GameId,
  type SnapshotId,
} from "../../src/domain/identity/index.js";
import {
  computeIntegrity,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type RandomState,
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
} from "../../src/domain/engine/transition.js";
import type {
  CatalogRuleView,
  RulesCatalogView,
  RulesEngineView,
} from "../../src/domain/engine/rules-engine.js";
import { createRulesEngine } from "../../src/domain/engine/rules-engine.js";
import type { GameRepository } from "../../src/domain/ports/index.js";
import {
  IndexedDbStoreAdapter,
  type GenerationId,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  DEFAULT_GENERATION_ID,
  GameCommandDispatcher,
  IndexedDbGameRepository,
  PerGameQueue,
  toGameRecordPayload,
  type Clock,
  type GameRecordPayload,
  type IdGenerator,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

// --- Fixtures de compatibilidad --------------------------------------------

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: "rav-1",
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: ["rav-1"],
};

const generationId: GenerationId = DEFAULT_GENERATION_ID;

// --- Constructores de estado de dominio ------------------------------------

function randomStateAt(position: number): RandomState {
  return { seed: "seed-1", position, algorithmVersion: "rav-1" };
}

function makeSnapshot(
  id: string,
  gameId: GameId,
  turn: number,
  randomPosition: number,
): GameSnapshot {
  const state = gameState({
    gameId,
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
    duration: { turns: 6 },
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
    randomState: randomStateAt(randomPosition),
    simpleLog: [],
    detailedLog: [],
    integrity: computeIntegrity({ id, turn }),
  });
}

// --- Adaptador y repositorio -----------------------------------------------

async function openAdapter(factory: IDBFactory): Promise<IndexedDbStoreAdapter> {
  const adapter = new IndexedDbStoreAdapter(factory, policy);
  await adapter.open();
  return adapter;
}

function counterIdGenerator(prefix: string): IdGenerator & SnapshotIdGenerator {
  let counter = 0;
  return {
    next: (): string => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}

function makeRepository(
  adapter: IndexedDbStoreAdapter,
): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId,
  });
}

/** Siembra directamente la Instantánea inicial y su resumen (sin transición). */
async function seedInitial(
  adapter: IndexedDbStoreAdapter,
  snapshot: GameSnapshot,
): Promise<void> {
  const key: SnapshotKey = {
    generationId,
    gameId: snapshot.gameId,
    snapshotId: snapshot.id,
  };
  await adapter.putSnapshot(key, {
    compatibility,
    gameId: snapshot.gameId,
    payload: snapshot,
  });
  const summary: GameRecordPayload = toGameRecordPayload(snapshot);
  await adapter.putGame(
    { generationId, gameId: snapshot.gameId },
    { compatibility, gameId: snapshot.gameId, payload: summary },
  );
}

// --- Motor y catálogo de prueba (vista estructural) ------------------------

/** Regla que avanza un turno y consume una posición aleatoria (mode complete). */
function advanceRule(): CatalogRuleView {
  return {
    id: "advance-turn",
    kind: "concrete",
    priority: 100,
    commandType: "advance",
    matches: () => true,
    apply: (snapshot) => {
      const nextState = gameState({
        ...snapshot.state,
        turn: snapshot.state.turn + 1,
      });
      const next = gameSnapshot({
        id: makeSnapshotId("placeholder-next"),
        gameId: snapshot.gameId,
        confirmedAt: "placeholder",
        state: nextState,
        randomState: {
          ...snapshot.randomState,
          position: snapshot.randomState.position + 1,
        },
        simpleLog: snapshot.simpleLog,
        detailedLog: snapshot.detailedLog,
        integrity: computeIntegrity({ advanced: true }),
      });
      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        next,
        mode: "complete",
      });
    },
  };
}

function makeCatalog(rules: readonly CatalogRuleView[]): RulesCatalogView {
  return { rules, actions: [] };
}

function makeClock(): Clock {
  let tick = 0;
  return {
    now: (): string => {
      tick += 1;
      return `2024-06-01T00:00:0${tick}.000Z`;
    },
  };
}

function makeDispatcher(
  repository: GameRepository,
  engine: RulesEngineView,
  catalog: RulesCatalogView,
  idPrefix = "commit",
): GameCommandDispatcher {
  return new GameCommandDispatcher({
    repository,
    engine,
    catalog,
    clock: makeClock(),
    idGenerator: counterIdGenerator(idPrefix),
  });
}

// --- Pruebas ----------------------------------------------------------------

describe("IndexedDbGameRepository — commit único y carga", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("confirma Instantánea + resumen + puntero en una transacción y loadLatest devuelve la nueva", async () => {
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameId = makeGameId("g-1");
    const initial = makeSnapshot("s-0", gameId, 0, 0);
    await seedInitial(adapter, initial);

    const dispatcher = makeDispatcher(
      repository,
      createRulesEngine(),
      makeCatalog([advanceRule()]),
    );

    const outcome = await dispatcher.execute(
      gameCommand({ gameId, expectedSnapshotId: initial.id, type: "advance" }),
    );

    expect(outcome.kind).toBe("committed");
    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(1);
    expect(latest.previousSnapshotId).toBe(initial.id);

    // El resumen (games) apunta a la nueva Instantánea; el metadato coincide.
    const summary = await adapter.getGame<GameRecordPayload>({
      generationId,
      gameId,
    });
    expect(summary?.latestSnapshotId).toBe(latest.id);
    const meta = await adapter.getMeta<{ latestSnapshotId: SnapshotId }>(
      `latest-confirmation:${generationId}:${gameId}`,
    );
    expect(meta?.latestSnapshotId).toBe(latest.id);
  });

  it("list proyecta un resumen por Partida de la generación activa", async () => {
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    await seedInitial(adapter, makeSnapshot("a-0", makeGameId("g-a"), 0, 0));
    await seedInitial(adapter, makeSnapshot("b-0", makeGameId("g-b"), 0, 0));

    const summaries = await repository.list();
    const ids = summaries.map((summary) => summary.gameId).sort();
    expect(ids).toEqual([makeGameId("g-a"), makeGameId("g-b")]);
  });
});

describe("GameCommandDispatcher — control optimista y conservación", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("rechaza como stale un expectedSnapshotId obsoleto sin reglas ni azar", async () => {
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameId = makeGameId("g-stale");
    const initial = makeSnapshot("s-0", gameId, 0, 7);
    await seedInitial(adapter, initial);

    let ruleEvaluated = false;
    const spyRule: CatalogRuleView = {
      ...advanceRule(),
      matches: () => {
        ruleEvaluated = true;
        return true;
      },
    };
    const dispatcher = makeDispatcher(
      repository,
      createRulesEngine(),
      makeCatalog([spyRule]),
    );

    const outcome = await dispatcher.execute(
      gameCommand({
        gameId,
        expectedSnapshotId: makeSnapshotId("s-obsoleto"),
        type: "advance",
      }),
    );

    expect(outcome.kind).toBe("stale");
    expect(ruleEvaluated).toBe(false);
    if (outcome.kind === "stale") {
      // Se conserva la última confirmada y su Estado aleatorio exacto.
      expect(outcome.current.id).toBe(initial.id);
      expect(outcome.current.randomState.position).toBe(7);
    }
    const latest = await repository.loadLatest(gameId);
    expect(latest.id).toBe(initial.id);
    expect(latest.state.turn).toBe(0);
  });

  it("ante rechazo del Motor conserva la última confirmada y el Estado aleatorio", async () => {
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameId = makeGameId("g-reject");
    const initial = makeSnapshot("s-0", gameId, 0, 5);
    await seedInitial(adapter, initial);

    // Catálogo sin reglas aplicables => el Motor devuelve rejected.
    const dispatcher = makeDispatcher(
      repository,
      createRulesEngine(),
      makeCatalog([]),
    );

    const outcome = await dispatcher.execute(
      gameCommand({ gameId, expectedSnapshotId: initial.id, type: "advance" }),
    );

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.current.randomState.position).toBe(5);
      expect(outcome.current.id).toBe(initial.id);
    }
    const latest = await repository.loadLatest(gameId);
    expect(latest.id).toBe(initial.id);
  });

  it("un fallo de commit conserva la última confirmada (nada a medias)", async () => {
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameId = makeGameId("g-fail");
    const initial = makeSnapshot("s-0", gameId, 0, 0);
    await seedInitial(adapter, initial);

    // Decorador que carga con normalidad pero falla al confirmar: simula un
    // commit transaccional abortado sin escribir nada (requisitos 7.8, 21.10).
    const failingRepository: GameRepository = {
      loadLatest: (id) => repository.loadLatest(id),
      commit: () => Promise.reject(new Error("commit-abortado")),
      list: () => repository.list(),
      isolateCorrupt: (id, reason) => repository.isolateCorrupt(id, reason),
    };

    const dispatcher = makeDispatcher(
      failingRepository,
      createRulesEngine(),
      makeCatalog([advanceRule()]),
    );

    const outcome = await dispatcher.execute(
      gameCommand({ gameId, expectedSnapshotId: initial.id, type: "advance" }),
    );

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.current.id).toBe(initial.id);
    }

    // La última confirmada persistida sigue siendo la inicial (nada escrito).
    const latest = await repository.loadLatest(gameId);
    expect(latest.id).toBe(initial.id);
    expect(latest.state.turn).toBe(0);
  });
});

describe("GameCommandDispatcher — aislamiento entre Partidas", () => {
  it("un commit de la Partida A no toca los registros de B", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameA = makeGameId("g-A");
    const gameB = makeGameId("g-B");
    const initialA = makeSnapshot("A-0", gameA, 0, 0);
    const initialB = makeSnapshot("B-0", gameB, 0, 0);
    await seedInitial(adapter, initialA);
    await seedInitial(adapter, initialB);

    const dispatcher = makeDispatcher(
      repository,
      createRulesEngine(),
      makeCatalog([advanceRule()]),
      "A",
    );
    await dispatcher.execute(
      gameCommand({ gameId: gameA, expectedSnapshotId: initialA.id, type: "advance" }),
    );

    // B permanece intacta.
    const latestB = await repository.loadLatest(gameB);
    expect(latestB.id).toBe(initialB.id);
    expect(latestB.state.turn).toBe(0);
    // A avanzó.
    const latestA = await repository.loadLatest(gameA);
    expect(latestA.state.turn).toBe(1);
  });
});

describe("PerGameQueue — serialización por gameId", () => {
  it("dos tareas de la misma clave no se entrelazan y respetan el orden", async () => {
    const queue = new PerGameQueue();
    const key = makeGameId("g-1");
    const events: string[] = [];

    const first = queue.enqueue(key, async () => {
      events.push("first-start");
      await Promise.resolve();
      await Promise.resolve();
      events.push("first-end");
    });
    const second = queue.enqueue(key, async () => {
      events.push("second-start");
      events.push("second-end");
    });

    await Promise.all([first, second]);
    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("tareas de claves distintas avanzan sin bloquearse mutuamente", async () => {
    const queue = new PerGameQueue();
    const order: string[] = [];

    const slow = queue.enqueue(makeGameId("g-1"), async () => {
      await Promise.resolve();
      await Promise.resolve();
      order.push("slow");
    });
    const fast = queue.enqueue(makeGameId("g-2"), async () => {
      order.push("fast");
    });

    await Promise.all([slow, fast]);
    expect(order[0]).toBe("fast");
    expect(order).toContain("slow");
  });

  it("un fallo de una tarea no rompe la cola de esa clave", async () => {
    const queue = new PerGameQueue();
    const key = makeGameId("g-1");
    const results: string[] = [];

    const failing = queue.enqueue(key, async () => {
      throw new Error("boom");
    });
    const following = queue.enqueue(key, async () => {
      results.push("following-ran");
      return "ok";
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("ok");
    expect(results).toEqual(["following-ran"]);
  });
});

describe("GameCommandDispatcher — serialización de execute concurrentes", () => {
  it("dos execute concurrentes sobre el mismo gameId se resuelven en secuencia", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = makeRepository(adapter);
    const gameId = makeGameId("g-seq");
    const initial = makeSnapshot("s-0", gameId, 0, 0);
    await seedInitial(adapter, initial);

    const dispatcher = makeDispatcher(
      repository,
      createRulesEngine(),
      makeCatalog([advanceRule()]),
    );

    // El primero usa la Instantánea inicial y avanza el puntero; el segundo,
    // encolado, todavía apunta a la inicial y quedará stale (control optimista).
    // No hay entrelazado gracias a la cola por gameId.
    const [firstOutcome, secondOutcome] = await Promise.all([
      dispatcher.execute(
        gameCommand({ gameId, expectedSnapshotId: initial.id, type: "advance" }),
      ),
      dispatcher.execute(
        gameCommand({ gameId, expectedSnapshotId: initial.id, type: "advance" }),
      ),
    ]);

    expect(firstOutcome.kind).toBe("committed");
    expect(secondOutcome.kind).toBe("stale");
    const latest = await repository.loadLatest(gameId);
    expect(latest.state.turn).toBe(1);
  });
});
