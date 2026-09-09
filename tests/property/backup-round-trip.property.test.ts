import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { IDBFactory } from "fake-indexeddb";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
  type GameId,
} from "../../src/domain/identity/index.js";
import type {
  CompatibilityPolicy,
  EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import { createBackupCodec } from "../../src/domain/persistence/backup-codec.js";
import type { GameAggregate } from "../../src/domain/persistence/index.js";
import type { BackupCodec } from "../../src/domain/ports/index.js";
import {
  IndexedDbStoreAdapter,
  type GameKey,
  type GenerationId,
  type SnapshotKey,
} from "../../src/adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  CreateGame,
  DEFAULT_GENERATION_ID,
  ImportBackup,
  ImportPreview,
  IndexedDbGameRepository,
  type ActiveGenerationMeta,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

/**
 * Propiedad 18 (Tarea 16.4): «Round-trip de exportación e importación».
 *
 * Exportar un conjunto de Partidas con `BackupCodec.encode`, luego `validate`
 * de los bytes e IMPORTAR en un Almacén IndexedDB vacío recupera Estados de
 * partida ESTRUCTURALMENTE EQUIVALENTES —Instantánea íntegra: Estado, ambos
 * registros y Estado aleatorio— SIN abrir canal de sincronización: origen y
 * destino son dos `IDBFactory`/adaptadores separados (requisito 22.11).
 *
 * La Suma DETECTA alteración accidental: si se corrompen los bytes, la
 * importación falla-cerrado (`BackupFailure`) y NO modifica el Almacén destino
 * —ni Partidas ni puntero de generación activa— (fail-closed, requisito 22.5).
 *
 * Valida requisitos 22.2, 22.3, 22.4, 22.5, 22.11.
 *
 * Los auxiliares y arbitrarios viven FUERA del `it`. La property es asíncrona
 * (`fc.asyncProperty`) porque cada réplica abre dos bases `fake-indexeddb`,
 * crea las Partidas de origen, exporta, importa en el destino vacío y compara
 * el Almacén por igualdad estructural.
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

// --- Escenario generado -----------------------------------------------------

/** Insumos de una Partida a exportar: sufijo de `gameId` único y Semilla. */
type GameSeed = Readonly<{ suffix: string; seed: string }>;

/**
 * Insumos de una réplica: el conjunto de Partidas a exportar (de 1 a N, con
 * sufijos de `gameId` únicos) y un flag `corrupt` que decide la rama a ejercer.
 */
type Scenario = Readonly<{
  games: readonly GameSeed[];
  corrupt: boolean;
}>;

/** Normaliza un fragmento a caracteres seguros para identificadores/Semillas. */
function sanitize(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length === 0 ? fallback : cleaned;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), {
    minLength: 1,
    maxLength: 4,
    selector: (raw) => sanitize(raw, ""),
  })
  // Descarta los conjuntos cuyos sufijos colapsan al mismo valor saneado: así
  // los `gameId` resultantes son ÚNICOS por réplica y el paquete es válido.
  .filter((raws) => {
    const suffixes = raws.map((raw, index) => sanitize(raw, `g${index}`));
    return new Set(suffixes).size === suffixes.length;
  })
  .chain((raws) => {
    const games: readonly GameSeed[] = raws.map((raw, index) => ({
      suffix: sanitize(raw, `g${index}`),
      seed: `seed-${sanitize(raw, `s${index}`)}-${index}`,
    }));
    return fc.boolean().map((corrupt) => ({ games, corrupt }) satisfies Scenario);
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

// --- Origen: creación de Partidas y exportación -----------------------------

/**
 * Crea todas las Partidas de la réplica en el adaptador de origen y devuelve el
 * {@link GameAggregate} de cada una a partir de su Instantánea inicial
 * confirmada (Estado, ambos registros y Estado aleatorio íntegros).
 */
async function exportAggregates(
  adapter: IndexedDbStoreAdapter,
  games: readonly GameSeed[],
): Promise<readonly GameAggregate[]> {
  const repository = repositoryFor(adapter);
  const createGame = new CreateGame({
    repository,
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator("snap"),
  });
  const aggregates: GameAggregate[] = [];
  for (const game of games) {
    const id = makeGameId(`g-${game.suffix}`);
    const created = await createGame.execute(initialInput(id, game.seed));
    aggregates.push({
      gameId: id,
      saveVersion: created.snapshot.state.saveVersion,
      snapshot: created.snapshot,
    });
  }
  return aggregates;
}

/**
 * Corrompe un byte de una COPIA de los bytes exportados sin recalcular la Suma,
 * de modo que `validate` los rechace por `integrity-mismatch`. Devuelve la copia
 * alterada; los bytes originales quedan intactos.
 */
function corruptBytes(bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  // Voltea el bit menos significativo de un byte central: sigue siendo UTF-8
  // válido en el rango ASCII pero cambia la forma canónica y su Suma.
  const target = Math.floor(copy.length / 2);
  const current = copy[target] ?? 0;
  copy[target] = current ^ 1;
  return copy;
}

// --- Destino: lectura del Almacén importado ---------------------------------

/**
 * Foto directa de una Partida en la generación activa del destino: Instantánea
 * enlazada por el puntero `latestSnapshotId` del resumen. Devuelve `undefined`
 * en ambos campos cuando la Partida no existe en el destino.
 */
type ImportedGame = Readonly<{
  summary: GameRecordPayload | undefined;
  snapshot: GameSnapshot | undefined;
}>;

async function readImported(
  adapter: IndexedDbStoreAdapter,
  gameId: GameId,
): Promise<ImportedGame> {
  const gameKey: GameKey = { generationId: activeGeneration, gameId };
  const summary = await adapter.getGame<GameRecordPayload>(gameKey);
  if (summary === undefined) {
    return { summary: undefined, snapshot: undefined };
  }
  const snapshotKey: SnapshotKey = {
    generationId: activeGeneration,
    gameId,
    snapshotId: summary.latestSnapshotId,
  };
  const snapshot = await adapter.getSnapshot<GameSnapshot>(snapshotKey);
  return { summary, snapshot };
}

/** Construye la instancia del caso de uso de importación para un destino. */
function importBackupFor(
  codec: BackupCodec,
  adapter: IndexedDbStoreAdapter,
): ImportBackup {
  return new ImportBackup({
    codec,
    adapter,
    compatibility,
    compatibilityPolicy: policy,
  });
}

// --- Ramas de la propiedad --------------------------------------------------

/**
 * Rama sana (22.2/22.3/22.4/22.11): importa el paquete en un destino vacío y
 * comprueba que cada Instantánea recuperada es ESTRUCTURALMENTE EQUIVALENTE a
 * la exportada, sin colisiones y con el puntero de generación activa fijado.
 */
async function assertRoundTrip(
  destination: IndexedDbStoreAdapter,
  importBackup: ImportBackup,
  bytes: Uint8Array,
  aggregates: readonly GameAggregate[],
): Promise<void> {
  const preview = await importBackup.execute(bytes);
  expect(preview).toBeInstanceOf(ImportPreview);
  if (!(preview instanceof ImportPreview)) {
    throw new Error("se esperaba una previsualización de importación válida");
  }
  expect(preview.hasCollisions).toBe(false);
  await preview.confirm();

  for (const aggregate of aggregates) {
    const imported = await readImported(destination, aggregate.gameId);
    expect(imported.snapshot).toStrictEqual(aggregate.snapshot);
    expect(imported.summary?.latestSnapshotId).toBe(aggregate.snapshot.id);
  }

  const activeMeta = await destination.getMeta<ActiveGenerationMeta>(
    ACTIVE_GENERATION_META_KEY,
  );
  expect(activeMeta?.activeGenerationId).toBe(activeGeneration);
}

/**
 * Rama corrupta (22.5): importar bytes alterados falla-cerrado con
 * `integrity-mismatch` y NO escribe la generación activa del destino —ni
 * Partidas ni el puntero de generación activa quedan afectados—.
 */
async function assertFailClosed(
  destination: IndexedDbStoreAdapter,
  importBackup: ImportBackup,
  corrupted: Uint8Array,
  aggregates: readonly GameAggregate[],
): Promise<void> {
  const outcome = await importBackup.execute(corrupted);
  expect(outcome).not.toBeInstanceOf(ImportPreview);
  if (outcome instanceof ImportPreview) {
    throw new Error("los bytes corruptos no debían producir una previsualización");
  }
  // Fail-closed: alterar un byte invalida el paquete. Según qué byte cambie,
  // el rechazo es por Suma que no cuadra o por bytes que dejan de ser un
  // documento canónico; en ambos casos es un `BackupFailure`, nunca escritura.
  expect(outcome.ok).toBe(false);

  // La generación ACTIVA del destino permanece intacta: ninguna Partida se
  // consolidó y el puntero de generación activa no se escribió.
  for (const aggregate of aggregates) {
    const imported = await readImported(destination, aggregate.gameId);
    expect(imported.summary).toBeUndefined();
    expect(imported.snapshot).toBeUndefined();
  }
  const activeMeta = await destination.getMeta<ActiveGenerationMeta>(
    ACTIVE_GENERATION_META_KEY,
  );
  expect(activeMeta).toBeUndefined();
}

// --- Propiedad --------------------------------------------------------------

describe("Property 18: Round-trip de exportación e importación", () => {
  it("recupera Estados equivalentes al importar y falla-cerrado ante corrupción", async () => {
    // Feature: fields-of-normandy-pwa, Property 18: Round-trip de exportación e importación
    const codec = createBackupCodec();
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const origin = await openAdapter(new IDBFactory());
        const destination = await openAdapter(new IDBFactory());
        try {
          const aggregates = await exportAggregates(origin, scenario.games);
          const pkg = await codec.encode(aggregates);
          const importBackup = importBackupFor(codec, destination);

          if (scenario.corrupt) {
            await assertFailClosed(
              destination,
              importBackup,
              corruptBytes(pkg.bytes),
              aggregates,
            );
            return;
          }
          await assertRoundTrip(destination, importBackup, pkg.bytes, aggregates);
        } finally {
          origin.close();
          destination.close();
        }
      }),
      { numRuns: 100 },
    );
  });
});
