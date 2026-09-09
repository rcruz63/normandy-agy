import { describe, expect, it } from "vitest";
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
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import {
  gameSnapshot,
  gameState,
} from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
} from "../../src/domain/engine/transition.js";
import { computeIntegrity } from "../../src/domain/persistence/index.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import type {
  CatalogRuleView,
  RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import { createRulesEngine } from "../../src/domain/engine/rules-engine.js";
import type {
  CommitReceipt,
  Diagnostic,
  GameRepository,
  GameSummary,
  PersistableTransition,
} from "../../src/domain/ports/index.js";
import {
  IndexedDbStoreAdapter,
  OBJECT_STORES,
  openDatabase,
  requestToPromise,
  runTransaction,
  type GameKey,
  type GenerationId,
  type QuarantineRecord,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  CorruptionRecoveryService,
  CreateGame,
  DEFAULT_GENERATION_ID,
  GameCommandDispatcher,
  GameNotFoundError,
  IndexedDbGameRepository,
  PendingDiagnosticRegistry,
  QuotaProbe,
  ResumeGame,
  toGameRecordPayload,
  CORRUPT_SNAPSHOT_MESSAGE_KEY,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
  type StorageEstimate,
  type StorageEstimator,
} from "../../src/application/games/index.js";

/**
 * Pruebas de integración de persistencia y recuperación (Tarea 15.7,
 * requisitos 6.2, 7.7, 21.6, 23.11, 31.7).
 *
 * Deterministas sobre `fake-indexeddb` con la `IDBFactory` INYECTADA (sin
 * globals). Cubren, con casos separados y nombres descriptivos:
 *
 *  1. Reabrir el contexto tras cerrar el adaptador y comprobar la última
 *     confirmada íntegra (Estado, registros, azar) — 6.2/7.7.
 *  2. Aborto del commit en el punto de fallo: reabrir y comprobar que la última
 *     confirmada es la anterior (nada a medias) — 7.7.
 *  3. Crear y reanudar VEINTE Partidas distintas sin mezclar Semillas/estado —
 *     6.2/31.7.
 *  4. Corromper un agregado → cuarentena y conservación del resto — 21.6.
 *  5. Sonda de cuota que informa falta de espacio sin mutar Partidas — 23.11.
 *  6. Eliminación externa de un registro por fuera del repositorio: fallo-rápido
 *     controlado sin perder las demás Partidas — 7.7.
 *
 * Los auxiliares y fixtures viven FUERA de los `it`, reutilizando el estilo de
 * `game-lifecycle.test.ts`, `game-repository-unit-of-work.test.ts`,
 * `corruption-recovery.test.ts` y `commit-atomicity.property.test.ts`.
 */

// --- Constantes de la prueba ------------------------------------------------

/** Mínimo de Partidas por Entorno probado (31.7): se cubre con exactamente 20. */
const GAME_COUNT = 20;

/** Capacidad requerida que la sonda de cuota evalúa contra la estimación. */
const REQUIRED_BYTES = 4096;

/** Estimación deliberadamente insuficiente: apenas hay espacio disponible. */
const TIGHT_QUOTA_BYTES = 1000;
const TIGHT_USAGE_BYTES = 900;

// --- Fixtures de compatibilidad --------------------------------------------

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: ALGORITHM_SPLITMIX64_V1,
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [1],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: [ALGORITHM_SPLITMIX64_V1],
};

const activeGeneration: GenerationId = DEFAULT_GENERATION_ID;

/** Clave del metadato de última confirmación (formato del repositorio). */
function confirmationMetaKey(id: GameId): string {
  return `latest-confirmation:${activeGeneration}:${id}`;
}

// --- Preparación de Misión reutilizada (dominio, Tarea 11.2) ----------------

function missionSetup(): MissionSetup {
  return prepareMission({
    missionNumber: 1,
    duration: { baseTurns: 4 },
    durationChoice: "base",
    britishForces: [
      { kind: "rifle-squad", squad: "A", labelEs: "Escuadra de fusileros A" },
    ],
    fixedGermanUnits: { present: false },
    objective: { kind: "eliminate-single-revealed-german" },
    revealTable: { missionRef: "FON-ML-2022-M01" },
  });
}

function identityFor(id: GameId): GameIdentity {
  return {
    gameId: id,
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
  };
}

function initialInput(id: GameId, seed: string): InitialSnapshotInput {
  return { missionSetup: missionSetup(), identity: identityFor(id), seed };
}

// --- Infraestructura de prueba ---------------------------------------------

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

function fixedClock(value: string): Clock {
  return { now: (): string => value };
}

function repositoryFor(adapter: IndexedDbStoreAdapter): IndexedDbGameRepository {
  return new IndexedDbGameRepository({
    adapter,
    compatibility,
    idGenerator: counterIdGenerator("quarantine"),
    generationId: activeGeneration,
  });
}

function createGameFor(repository: GameRepository): CreateGame {
  return new CreateGame({
    repository,
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator("snap"),
  });
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

const advanceCatalog: RulesCatalogView = { rules: [advanceRule()], actions: [] };

function makeDispatcher(repository: GameRepository): GameCommandDispatcher {
  return new GameCommandDispatcher({
    repository,
    engine: createRulesEngine(),
    catalog: advanceCatalog,
    clock: fixedClock("2024-06-01T00:00:01.000Z"),
    idGenerator: counterIdGenerator("commit"),
  });
}

// --- Sonda de cuota falsa (puerto de estimación inyectado) ------------------

/** Estimador de capacidad que reporta una capacidad fija observada. */
function fakeEstimator(estimate: StorageEstimate): StorageEstimator {
  return { estimate: (): Promise<StorageEstimate> => Promise.resolve(estimate) };
}

// --- Manipulación directa del store (condiciones externas legítimas) --------

/**
 * Corrompe la Instantánea de una Partida alterando el `payload` del sobre sin
 * recalcular su integridad, de modo que `openEnvelope` falle por
 * `integrity-mismatch`. Acceso directo al store como haría una corrupción
 * externa; no borra bytes (patrón de `corruption-recovery.test.ts`).
 */
async function corruptSnapshot(
  factory: IDBFactory,
  gameId: GameId,
  snapshotId: string,
): Promise<void> {
  const database = await openDatabase(factory);
  await runTransaction(
    database,
    [OBJECT_STORES.snapshots],
    "readwrite",
    async (transaction) => {
      const store = transaction.objectStore(OBJECT_STORES.snapshots);
      const key = [activeGeneration, gameId, snapshotId];
      const raw = (await requestToPromise(store.get(key))) as {
        envelope: { payload: { state: { turn: number } } };
      };
      raw.envelope.payload.state = {
        ...raw.envelope.payload.state,
        turn: raw.envelope.payload.state.turn + 999,
      };
      await requestToPromise(store.put(raw));
    },
  );
  database.close();
}

/**
 * Borra directamente el registro de `snapshots` de una Partida por FUERA del
 * repositorio (transacción `delete` directa), simulando una eliminación externa
 * del almacén. El repositorio no expone una primitiva de borrado, así que se usa
 * el runtime de bajo nivel (`openDatabase`/`runTransaction`/`requestToPromise`),
 * manipulación de prueba legítima que no añade lógica de producción.
 */
async function deleteSnapshotRecord(
  factory: IDBFactory,
  gameId: GameId,
  snapshotId: string,
): Promise<void> {
  const database = await openDatabase(factory);
  await runTransaction(
    database,
    [OBJECT_STORES.snapshots],
    "readwrite",
    async (transaction) => {
      const store = transaction.objectStore(OBJECT_STORES.snapshots);
      const key = [activeGeneration, gameId, snapshotId];
      await requestToPromise(store.delete(key));
    },
  );
  database.close();
}

// --- Lectura cruda del almacén (foto de identidad) --------------------------

/** Foto directa del almacén de una Partida: Instantánea, resumen y metadato. */
type StorePhoto = Readonly<{
  snapshot: GameSnapshot | undefined;
  summary: GameRecordPayload | undefined;
  meta: { readonly gameId: GameId; readonly latestSnapshotId: SnapshotId } | undefined;
}>;

async function photograph(
  adapter: IndexedDbStoreAdapter,
  id: GameId,
  latestSnapshotId: SnapshotId,
): Promise<StorePhoto> {
  const snapshotKey: SnapshotKey = {
    generationId: activeGeneration,
    gameId: id,
    snapshotId: latestSnapshotId,
  };
  const gameKey: GameKey = { generationId: activeGeneration, gameId: id };
  const snapshot = await adapter.getSnapshot<GameSnapshot>(snapshotKey);
  const summary = await adapter.getGame<GameRecordPayload>(gameKey);
  const meta = await adapter.getMeta<{
    gameId: GameId;
    latestSnapshotId: SnapshotId;
  }>(confirmationMetaKey(id));
  return { snapshot, summary, meta };
}

/**
 * Repositorio cuyo `commit` ABORTA la transacción del store dentro de
 * `runTransaction`: escribe Instantánea + resumen en una única transacción y
 * lanza dentro de ella, de modo que `fake-indexeddb` revierte TODO (nada a
 * medias, requisito 7.7). Delega el resto de operaciones en el repositorio real.
 */
function abortingCommitRepository(
  factory: IDBFactory,
  real: IndexedDbGameRepository,
): GameRepository {
  return {
    loadLatest: (id) => real.loadLatest(id),
    list: (): Promise<readonly GameSummary[]> => real.list(),
    isolateCorrupt: (id: GameId, reason: Diagnostic) =>
      real.isolateCorrupt(id, reason),
    commit: async (proposal: PersistableTransition): Promise<CommitReceipt> => {
      const database = await openDatabase(factory);
      try {
        await runTransaction(
          database,
          [OBJECT_STORES.snapshots, OBJECT_STORES.games, OBJECT_STORES.meta],
          "readwrite",
          async (transaction) => {
            const summary = toGameRecordPayload(proposal.next);
            await requestToPromise(
              transaction.objectStore(OBJECT_STORES.snapshots).put({
                generationId: activeGeneration,
                gameId: proposal.gameId,
                snapshotId: proposal.next.id,
                envelope: { payload: proposal.next },
              }),
            );
            await requestToPromise(
              transaction.objectStore(OBJECT_STORES.games).put({
                generationId: activeGeneration,
                gameId: proposal.gameId,
                envelope: { payload: summary },
              }),
            );
            // Aborta ANTES de completar: la transacción revierte ambos `put`.
            throw new Error("commit-abortado");
          },
        );
      } finally {
        database.close();
      }
      throw new Error("inalcanzable: la transacción abortada rechaza antes");
    },
  };
}

// --- 1. Reabrir el contexto (6.2/7.7) ---------------------------------------

describe("Persistencia — reabrir el contexto conserva la última confirmada (6.2/7.7)", () => {
  it("tras cerrar y reabrir el adaptador, loadLatest devuelve la última confirmada íntegra", async () => {
    const factory = new IDBFactory();
    const firstAdapter = await openAdapter(factory);
    const firstRepository = repositoryFor(firstAdapter);
    const id = makeGameId("g-reopen");

    const created = await createGameFor(firstRepository).execute(
      initialInput(id, "seed-REOPEN"),
    );

    // Confirma una transición (avanza el turno y una posición aleatoria).
    const dispatcher = makeDispatcher(firstRepository);
    const outcome = await dispatcher.execute(
      gameCommand({ gameId: id, expectedSnapshotId: created.snapshot.id, type: "advance" }),
    );
    expect(outcome.kind).toBe("committed");
    if (outcome.kind !== "committed") {
      throw new Error("se esperaba una confirmación");
    }
    const committedId = outcome.receipt.latestSnapshotId;

    // Cierra el contexto por completo.
    firstAdapter.close();

    // Abre un adaptador NUEVO sobre la MISMA IDBFactory (mismo almacén físico).
    const secondAdapter = await openAdapter(factory);
    const secondRepository = repositoryFor(secondAdapter);
    const latest = await secondRepository.loadLatest(id);

    expect(latest.id).toBe(committedId);
    expect(latest.previousSnapshotId).toBe(created.snapshot.id);
    expect(latest.state.turn).toBe(created.snapshot.state.turn + 1);
    expect(latest.randomState.seed).toBe("seed-REOPEN");
    expect(latest.randomState.position).toBe(created.snapshot.randomState.position + 1);

    // El resumen y el metadato también sobreviven y son coherentes.
    const photo = await photograph(secondAdapter, id, committedId);
    expect(photo.summary?.latestSnapshotId).toBe(committedId);
    expect(photo.meta?.latestSnapshotId).toBe(committedId);
    secondAdapter.close();
  });
});

// --- 2. Aborto del commit en el punto de fallo (7.7) ------------------------

describe("Persistencia — aborto del commit conserva la anterior tras reabrir (7.7)", () => {
  it("un commit abortado no deja nada a medias; al reabrir la última confirmada es la inicial", async () => {
    const factory = new IDBFactory();
    const firstAdapter = await openAdapter(factory);
    const realRepository = repositoryFor(firstAdapter);
    const id = makeGameId("g-abort");

    const created = await createGameFor(realRepository).execute(
      initialInput(id, "seed-ABORT"),
    );
    const before = await photograph(firstAdapter, id, created.snapshot.id);

    // El commit del despachador se hace contra un repositorio cuyo commit aborta.
    const dispatcher = makeDispatcher(
      abortingCommitRepository(factory, realRepository),
    );
    const outcome = await dispatcher.execute(
      gameCommand({ gameId: id, expectedSnapshotId: created.snapshot.id, type: "advance" }),
    );
    expect(outcome.kind).toBe("failed");

    firstAdapter.close();

    // Reabre el contexto: la última confirmada sigue siendo la inicial.
    const secondAdapter = await openAdapter(factory);
    const secondRepository = repositoryFor(secondAdapter);
    const latest = await secondRepository.loadLatest(id);
    expect(latest.id).toBe(created.snapshot.id);
    expect(latest.state.turn).toBe(created.snapshot.state.turn);

    // El almacén quedó EXACTAMENTE como antes del intento (identidad).
    const after = await photograph(secondAdapter, id, created.snapshot.id);
    expect(after).toStrictEqual(before);
    secondAdapter.close();
  });
});

// --- 3. Crear y reanudar VEINTE Partidas (6.2/31.7) -------------------------

describe("Persistencia — crear y reanudar al menos veinte Partidas (6.2/31.7)", () => {
  it("cada una de las veinte Partidas restaura su propia Semilla y estado sin mezclarse", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = createGameFor(repository);

    const ids: GameId[] = [];
    const seeds: string[] = [];
    for (let index = 0; index < GAME_COUNT; index += 1) {
      const id = makeGameId(`g-many-${index}`);
      const seed = `seed-${index}`;
      ids.push(id);
      seeds.push(seed);
      await createGame.execute(initialInput(id, seed));
    }

    // Se crearon exactamente veinte Partidas en la generación activa.
    const summaries = await repository.list();
    expect(summaries).toHaveLength(GAME_COUNT);

    // Reanuda todas: cada una devuelve su propia Semilla, sin contaminación.
    const resumeGame = new ResumeGame({ repository });
    const resumedSeeds: string[] = [];
    for (const id of ids) {
      const resumed = await resumeGame.execute(id);
      expect(resumed.snapshot.gameId).toBe(id);
      expect(resumed.snapshot.randomState.position).toBe(0);
      resumedSeeds.push(resumed.snapshot.randomState.seed);
    }
    expect(resumedSeeds).toEqual(seeds);
    adapter.close();
  });
});

// --- 4. Corromper un agregado → cuarentena (21.6) ---------------------------

describe("Persistencia — corromper un agregado aísla y conserva el resto (21.6)", () => {
  it("la Partida corrupta se pone en cuarentena (bytes recuperables) y las demás siguen intactas", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = createGameFor(repository);

    const corrupt = makeGameId("g-corrupt");
    const healthy = makeGameId("g-healthy");
    const corruptCreated = await createGame.execute(initialInput(corrupt, "seed-C"));
    await createGame.execute(initialInput(healthy, "seed-H"));

    await corruptSnapshot(factory, corrupt, corruptCreated.snapshot.id);

    const service = new CorruptionRecoveryService({
      repository,
      archive: adapter,
      idGenerator: counterIdGenerator("detected"),
      pendingDiagnostics: new PendingDiagnosticRegistry(),
    });

    const result = await service.resume(corrupt);
    expect(result.kind).toBe("quarantined");
    if (result.kind !== "quarantined") {
      throw new Error("se esperaba cuarentena");
    }
    expect(result.isolated).toBe(true);
    expect(result.reasonKey).toBe(CORRUPT_SNAPSHOT_MESSAGE_KEY);

    // Los bytes aislados se conservan y son recuperables por su clave.
    const archived = await adapter.getQuarantined(corrupt, result.detectedAtId);
    expect(archived).toBeDefined();
    const record = archived as QuarantineRecord;
    expect(record.gameId).toBe(corrupt);

    // La Partida corrupta queda excluida; la sana permanece reanudable e intacta.
    const resumable = await service.listResumable();
    expect(resumable.map((summary) => summary.gameId)).toEqual([healthy]);
    const healthyResult = await service.resume(healthy);
    expect(healthyResult.kind).toBe("restored");
    if (healthyResult.kind !== "restored") {
      throw new Error("se esperaba restaurada");
    }
    expect(healthyResult.snapshot.randomState.seed).toBe("seed-H");
    adapter.close();
  });
});

// --- 5. Sonda de cuota insuficiente (23.11) ---------------------------------

describe("Persistencia — la sonda de cuota informa falta de espacio sin mutar Partidas (23.11)", () => {
  it("con estimación insuficiente fits es false y las Partidas existentes siguen intactas", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = createGameFor(repository);

    const id = makeGameId("g-quota");
    const created = await createGame.execute(initialInput(id, "seed-Q"));
    const before = await photograph(adapter, id, created.snapshot.id);

    // Sonda con estimación deliberadamente insuficiente para lo requerido.
    const probe = new QuotaProbe(
      fakeEstimator({ usage: TIGHT_USAGE_BYTES, quota: TIGHT_QUOTA_BYTES }),
    );
    const result = await probe.probe(REQUIRED_BYTES);

    expect(result.requiredBytes).toBe(REQUIRED_BYTES);
    expect(result.availableBytes).toBe(TIGHT_QUOTA_BYTES - TIGHT_USAGE_BYTES);
    expect(result.fits).toBe(false);

    // La sonda es de solo lectura: la Partida existente no se ha tocado.
    const after = await photograph(adapter, id, created.snapshot.id);
    expect(after).toStrictEqual(before);
    const latest = await repository.loadLatest(id);
    expect(latest.id).toBe(created.snapshot.id);
    expect(latest.randomState.seed).toBe("seed-Q");
    adapter.close();
  });
});

// --- 6. Eliminación externa de un registro (7.7) ----------------------------

describe("Persistencia — eliminación externa falla-rápido sin perder otras Partidas (7.7)", () => {
  it("borrar la Instantánea de una Partida por fuera del repositorio provoca GameNotFoundError al reanudar, y las demás siguen intactas", async () => {
    const factory = new IDBFactory();
    const adapter = await openAdapter(factory);
    const repository = repositoryFor(adapter);
    const createGame = createGameFor(repository);

    const victim = makeGameId("g-deleted");
    const survivor = makeGameId("g-survivor");
    const victimCreated = await createGame.execute(initialInput(victim, "seed-D"));
    await createGame.execute(initialInput(survivor, "seed-S"));

    // Eliminación externa: se borra el registro de `snapshots` de la víctima
    // dejando su resumen colgado con un puntero sin Instantánea.
    await deleteSnapshotRecord(factory, victim, victimCreated.snapshot.id);

    // Comportamiento REAL observado: `loadLatest` halla el resumen pero no la
    // Instantánea apuntada, así que falla-rápido con `GameNotFoundError` (no es
    // corrupción de sobre, luego NO va a cuarentena). Se aserta ese contrato.
    const resumeGame = new ResumeGame({ repository });
    await expect(resumeGame.execute(victim)).rejects.toBeInstanceOf(
      GameNotFoundError,
    );

    // El servicio de recuperación tampoco la envía a cuarentena: propaga el
    // error de ausencia (fail-fast), no lo captura como corrupción de sobre.
    const service = new CorruptionRecoveryService({
      repository,
      archive: adapter,
      idGenerator: counterIdGenerator("detected"),
      pendingDiagnostics: new PendingDiagnosticRegistry(),
    });
    await expect(service.resume(victim)).rejects.toBeInstanceOf(GameNotFoundError);

    // La otra Partida sigue intacta y reanudable.
    const survivorResumed = await resumeGame.execute(survivor);
    expect(survivorResumed.snapshot.gameId).toBe(survivor);
    expect(survivorResumed.snapshot.randomState.seed).toBe("seed-S");
    adapter.close();
  });
});
