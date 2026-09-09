import { describe, expect, it } from "vitest";
import fc from "fast-check";
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
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  CreateGame,
  DEFAULT_GENERATION_ID,
  GameCommandDispatcher,
  IndexedDbGameRepository,
  toGameRecordPayload,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

/**
 * Propiedad 6 de corrección (Tarea 15.5): «Commit atómico o identidad».
 *
 * El commit de una transición es INDIVISIBLE: o se confirma por COMPLETO (nueva
 * Instantánea + resumen de Partida con puntero `latestSnapshotId` + metadato de
 * última confirmación, todo visible tras el commit) o, si el commit falla/aborta
 * o el `expectedSnapshotId` es obsoleto, el almacén queda EXACTAMENTE como antes
 * (IDENTIDAD): la última Instantánea confirmada, su resumen, su puntero y su
 * metadato permanecen sin cambios; nada a medias, sin estados intermedios
 * observables.
 *
 * Valida requisitos 5.4, 5.7, 7.1, 7.5, 7.6, 7.7, 7.8, 21.4, 21.9, 21.10, 22.3,
 * 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 23.11.
 *
 * Los auxiliares y arbitrarios viven FUERA del `it`. La property es asíncrona
 * (`fc.asyncProperty`) porque cada réplica abre `fake-indexeddb`, crea la
 * Partida, ejecuta la transición y compara el almacén por igualdad estructural.
 */

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

// --- Escenario generado -----------------------------------------------------

/**
 * Ramas observables del commit:
 * - `commit`: la transición se confirma por completo (atomicidad hacia delante).
 * - `fail`: el commit transaccional aborta; el almacén conserva la identidad.
 * - `stale`: `expectedSnapshotId` obsoleto; se rechaza sin tocar el almacén.
 */
type Branch = "commit" | "fail" | "stale";

/** Insumos generados de una réplica de la propiedad. */
type Scenario = Readonly<{
  gameSuffix: string;
  seed: string;
  branch: Branch;
}>;

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  gameSuffix: fc.string({ minLength: 1, maxLength: 6 }).map((raw) =>
    raw.replace(/[^a-zA-Z0-9]/g, "x"),
  ),
  seed: fc.string({ minLength: 1, maxLength: 8 }).map((raw) =>
    raw.trim().length === 0 ? "seed" : raw,
  ),
  branch: fc.constantFrom<Branch>("commit", "fail", "stale"),
});

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

// --- Infraestructura de prueba ----------------------------------------------

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

/**
 * Repositorio que confirma con un commit transaccional que ABORTA: abre la base
 * por su cuenta, escribe Instantánea + resumen + metadato en UNA transacción y
 * lanza dentro de ella para forzar el aborto. `fake-indexeddb` revierte todo, de
 * modo que ningún registro sobrevive: es el fallo de commit «nada a medias» de
 * los requisitos 7.8 y 21.10. Delega el resto de operaciones en el repositorio
 * real para que la carga previa siga siendo fiel.
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
            // Forzar el aborto ANTES de completar: la transacción revierte los
            // dos `put` anteriores (atomicidad real de `fake-indexeddb`).
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

// --- Propiedad --------------------------------------------------------------

describe("Property 6: Commit atómico o identidad", () => {
  it("confirma por completo o deja el almacén intacto; nunca a medias", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Feature: fields-of-normandy-pwa, Property 6: Commit atómico o identidad
        const factory = new IDBFactory();
        const adapter = await openAdapter(factory);
        const realRepository = repositoryFor(adapter);
        const id = makeGameId(`g-${scenario.gameSuffix}`);

        const createGame = new CreateGame({
          repository: realRepository,
          clock: fixedClock("2024-06-01T00:00:00.000Z"),
          idGenerator: counterIdGenerator("snap"),
        });
        const created = await createGame.execute(initialInput(id, scenario.seed));
        const initial = created.snapshot;

        // Identidad de referencia: foto del almacén tras la Instantánea inicial.
        const before = await photograph(adapter, id, initial.id);
        expect(before.snapshot?.id).toBe(initial.id);
        expect(before.summary?.latestSnapshotId).toBe(initial.id);

        const expectedSnapshotId =
          scenario.branch === "stale"
            ? makeSnapshotId("s-obsoleto")
            : initial.id;
        const repository =
          scenario.branch === "fail"
            ? abortingCommitRepository(factory, realRepository)
            : realRepository;
        const dispatcher = makeDispatcher(repository);

        const outcome = await dispatcher.execute(
          gameCommand({ gameId: id, expectedSnapshotId, type: "advance" }),
        );

        if (scenario.branch === "commit") {
          // ATOMICIDAD HACIA DELANTE: nueva Instantánea, resumen y metadato
          // apuntan de forma coherente a la nueva confirmación.
          expect(outcome.kind).toBe("committed");
          if (outcome.kind !== "committed") {
            throw new Error("se esperaba una confirmación");
          }
          const newId = outcome.receipt.latestSnapshotId;
          const after = await photograph(adapter, id, newId);
          expect(after.snapshot?.id).toBe(newId);
          expect(after.snapshot?.previousSnapshotId).toBe(initial.id);
          expect(after.snapshot?.state.turn).toBe(initial.state.turn + 1);
          expect(after.summary?.latestSnapshotId).toBe(newId);
          expect(after.meta?.latestSnapshotId).toBe(newId);
          // La última confirmada visible es la nueva y es coherente.
          const latest = await realRepository.loadLatest(id);
          expect(latest.id).toBe(newId);
          adapter.close();
          return;
        }

        // RAMAS DE IDENTIDAD (`fail` y `stale`): el desenlace conserva la última
        // confirmada y el almacén queda EXACTAMENTE como antes del intento.
        expect(outcome.kind).toBe(scenario.branch === "fail" ? "failed" : "stale");
        if (outcome.kind === "committed") {
          throw new Error("no debía confirmarse en una rama de identidad");
        }
        expect(outcome.current.id).toBe(initial.id);

        const after = await photograph(adapter, id, initial.id);
        expect(after).toStrictEqual(before);
        // El puntero de la última confirmada sigue siendo la Instantánea inicial.
        const latest = await realRepository.loadLatest(id);
        expect(latest.id).toBe(initial.id);
        expect(latest.state.turn).toBe(initial.state.turn);
        adapter.close();
      }),
      { numRuns: 100 },
    );
  });
});
