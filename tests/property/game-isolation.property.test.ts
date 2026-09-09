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
import { computeIntegrity } from "../../src/domain/persistence/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import { gameSnapshot, gameState } from "../../src/domain/engine/state.js";
import {
  gameCommand,
  transitionProposal,
} from "../../src/domain/engine/transition.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import type {
  CatalogRuleView,
  RulesCatalogView,
} from "../../src/domain/engine/rules-engine.js";
import { createRulesEngine } from "../../src/domain/engine/rules-engine.js";
import type { GameSummary } from "../../src/domain/ports/index.js";
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
  CorruptionRecoveryService,
  CreateGame,
  DEFAULT_GENERATION_ID,
  GameCommandDispatcher,
  IndexedDbGameRepository,
  PendingDiagnosticRegistry,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

/**
 * Propiedad 7 de corrección (Tarea 15.6): «Aislamiento entre Partidas».
 *
 * Las Partidas están AISLADAS entre sí. Operar sobre una Partida —crearla,
 * confirmar una transición o aislarla por corrupción (cuarentena)— NO altera el
 * Estado, los registros ni el Estado aleatorio de NINGUNA otra Partida. Un
 * commit de la Partida A no toca los registros de B; poner A en cuarentena no
 * afecta a B (B sigue reanudable e intacta); los registros quedan aislados por
 * `gameId` (20.5). Con N Partidas y una secuencia de operaciones dirigida a un
 * SUBCONJUNTO, todas las Partidas NO tocadas conservan EXACTAMENTE su última
 * Instantánea confirmada, su resumen, su puntero y su Estado aleatorio.
 *
 * Valida requisitos 6.1, 6.3, 6.5, 6.7, 7.5, 7.6, 18.3, 20.5, 21.6.
 *
 * Los auxiliares y arbitrarios viven FUERA del `it`. La property es asíncrona
 * (`fc.asyncProperty`) porque cada réplica abre `fake-indexeddb`, crea varias
 * Partidas, aplica operaciones a un subconjunto y compara el almacén de las no
 * tocadas por igualdad estructural.
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

/** Operación dirigida a una Partida del subconjunto objetivo. */
type Operation = "commit" | "quarantine";

/** Insumos de una Partida generada: sufijo único y Semilla reproducible. */
type GameSeed = Readonly<{ suffix: string; seed: string }>;

/**
 * Insumos de una réplica: el conjunto completo de Partidas distintas y, para
 * cada índice objetivo, la operación a aplicar. Los índices objetivo son un
 * subconjunto de las Partidas creadas; el resto NO se toca.
 */
type Scenario = Readonly<{
  games: readonly GameSeed[];
  targets: ReadonlyMap<number, Operation>;
}>;

/** Normaliza un fragmento a caracteres seguros para identificadores/Semillas. */
function sanitize(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length === 0 ? fallback : cleaned;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), {
    minLength: 2,
    maxLength: 5,
    selector: (raw) => sanitize(raw, ""),
  })
  // Descarta los conjuntos cuyos sufijos colapsan al mismo valor saneado: así
  // los `gameId` resultantes son ÚNICOS por réplica y el escenario es válido.
  .filter((raws) => {
    const suffixes = raws.map((raw, index) => sanitize(raw, `g${index}`));
    return new Set(suffixes).size === suffixes.length;
  })
  .chain((raws) => {
    const games: readonly GameSeed[] = raws.map((raw, index) => ({
      suffix: sanitize(raw, `g${index}`),
      seed: `seed-${sanitize(raw, `s${index}`)}-${index}`,
    }));
    const indices = games.map((_game, index) => index);
    return fc
      .subarray(indices, { minLength: 0, maxLength: games.length })
      .chain((selected) =>
        fc
          .array(fc.constantFrom<Operation>("commit", "quarantine"), {
            minLength: selected.length,
            maxLength: selected.length,
          })
          .map((operations) => {
            const targets = new Map<number, Operation>();
            selected.forEach((index, position) => {
              const operation = operations[position] ?? "commit";
              targets.set(index, operation);
            });
            return { games, targets } satisfies Scenario;
          }),
      );
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

function makeDispatcher(
  repository: IndexedDbGameRepository,
  idPrefix: string,
): GameCommandDispatcher {
  return new GameCommandDispatcher({
    repository,
    engine: createRulesEngine(),
    catalog: advanceCatalog,
    clock: fixedClock("2024-06-01T00:00:01.000Z"),
    idGenerator: counterIdGenerator(idPrefix),
  });
}

/**
 * Corrompe la Instantánea de una Partida alterando el `payload` del sobre sin
 * recalcular su integridad, de modo que su lectura falle por `integrity-mismatch`
 * y el servicio de recuperación la aísle. Escribe SOLO el registro de esa
 * Partida (misma técnica que `tests/integration/corruption-recovery.test.ts`).
 */
async function corruptSnapshot(
  factory: IDBFactory,
  gameId: GameId,
  snapshotId: SnapshotId,
): Promise<void> {
  const database = await openDatabase(factory);
  try {
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
  } finally {
    database.close();
  }
}

// --- Lectura cruda del almacén (foto de identidad) --------------------------

/** Foto directa del almacén de una Partida: Instantánea, resumen y metadato. */
type StorePhoto = Readonly<{
  snapshot: GameSnapshot | undefined;
  summary: GameRecordPayload | undefined;
  meta:
    | { readonly gameId: GameId; readonly latestSnapshotId: SnapshotId }
    | undefined;
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

// --- Contexto de una Partida creada -----------------------------------------

/** Estado de referencia de una Partida creada: identidad, foto e índice. */
type CreatedGame = Readonly<{
  index: number;
  gameId: GameId;
  seed: string;
  initialSnapshotId: SnapshotId;
  photo: StorePhoto;
}>;

// --- Propiedad --------------------------------------------------------------

describe("Property 7: Aislamiento entre Partidas", () => {
  it("operar sobre unas Partidas no altera los registros de las demás", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Feature: fields-of-normandy-pwa, Property 7: Aislamiento entre Partidas
        const factory = new IDBFactory();
        const adapter = await openAdapter(factory);
        const repository = repositoryFor(adapter);
        const createGame = new CreateGame({
          repository,
          clock: fixedClock("2024-06-01T00:00:00.000Z"),
          idGenerator: counterIdGenerator("snap"),
        });

        // Crea TODAS las Partidas con una Instantánea inicial única cada una y
        // fotografía el almacén de cada una como identidad de referencia.
        const created: CreatedGame[] = [];
        for (const [index, game] of scenario.games.entries()) {
          const id = makeGameId(`g-${game.suffix}`);
          const result = await createGame.execute(initialInput(id, game.seed));
          const photo = await photograph(adapter, id, result.snapshot.id);
          created.push({
            index,
            gameId: id,
            seed: game.seed,
            initialSnapshotId: result.snapshot.id,
            photo,
          });
        }

        // Aislamiento de registros por `gameId` (20.5): cada foto inicial es de
        // su propia Partida y su Estado aleatorio conserva su Semilla.
        for (const game of created) {
          expect(game.photo.snapshot?.gameId).toBe(game.gameId);
          expect(game.photo.snapshot?.randomState.seed).toBe(game.seed);
          expect(game.photo.summary?.latestSnapshotId).toBe(
            game.initialSnapshotId,
          );
        }

        const recovery = new CorruptionRecoveryService({
          repository,
          archive: adapter,
          idGenerator: counterIdGenerator("detected"),
          pendingDiagnostics: new PendingDiagnosticRegistry(),
        });

        // Aplica la operación a cada Partida objetivo; el resto NO se toca.
        const quarantined = new Set<GameId>();
        for (const game of created) {
          const operation = scenario.targets.get(game.index);
          if (operation === undefined) {
            continue;
          }
          if (operation === "commit") {
            const dispatcher = makeDispatcher(repository, `commit-${game.index}`);
            const outcome = await dispatcher.execute(
              gameCommand({
                gameId: game.gameId,
                expectedSnapshotId: game.initialSnapshotId,
                type: "advance",
              }),
            );
            expect(outcome.kind).toBe("committed");
            continue;
          }
          // Cuarentena (21.6): corromper el sobre y reanudar de forma segura.
          await corruptSnapshot(factory, game.gameId, game.initialSnapshotId);
          const result = await recovery.resume(game.gameId);
          expect(result.kind).toBe("quarantined");
          quarantined.add(game.gameId);
        }

        // Las Partidas NO objetivo conservan EXACTAMENTE su foto de identidad:
        // Instantánea, resumen, puntero y Estado aleatorio intactos.
        for (const game of created) {
          if (scenario.targets.has(game.index)) {
            continue;
          }
          const after = await photograph(adapter, game.gameId, game.initialSnapshotId);
          expect(after).toStrictEqual(game.photo);
          const latest = await repository.loadLatest(game.gameId);
          expect(latest.id).toBe(game.initialSnapshotId);
          expect(latest.randomState.seed).toBe(game.seed);
        }

        // Las Partidas objetivo cambiaron de forma coherente y sin filtrarse:
        // un commit avanza SU puntero; una cuarentena excluye SOLO a esa Partida.
        for (const game of created) {
          const operation = scenario.targets.get(game.index);
          if (operation === "commit") {
            const before = game.photo.snapshot;
            if (before === undefined) {
              throw new Error("se esperaba la Instantánea inicial fotografiada");
            }
            const latest = await repository.loadLatest(game.gameId);
            expect(latest.previousSnapshotId).toBe(game.initialSnapshotId);
            expect(latest.state.turn).toBe(before.state.turn + 1);
            expect(latest.gameId).toBe(game.gameId);
          }
        }

        // La cuarentena de una Partida no afecta a las demás: toda Partida sin
        // cuarentena sigue reanudable (B intacta cuando A está en cuarentena).
        const resumable = await recovery.listResumable();
        const resumableIds = new Set(resumable.map((s: GameSummary) => s.gameId));
        for (const game of created) {
          if (quarantined.has(game.gameId)) {
            expect(resumableIds.has(game.gameId)).toBe(false);
          } else {
            expect(resumableIds.has(game.gameId)).toBe(true);
          }
        }

        adapter.close();
      }),
      { numRuns: 100 },
    );
  });
});
