import { beforeEach, describe, expect, it } from "vitest";
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
  GameAggregate,
} from "../../src/domain/persistence/index.js";
import type { GameSnapshot } from "../../src/domain/engine/state.js";
import { ALGORITHM_SPLITMIX64_V1 } from "../../src/domain/random/versioned-random.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import { createBackupCodec } from "../../src/domain/persistence/backup-codec.js";
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
  UnresolvedCollisionError,
  type ActiveGenerationMeta,
  type Clock,
  type GameIdentity,
  type GameRecordPayload,
  type IdGenerator,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

/**
 * Pruebas de integración DETERMINISTAS de traslado de Partidas entre
 * dispositivos (Tarea 16.6, requisitos 22.10, 22.11).
 *
 * Cubren el hueco que la Propiedad 18 (Tarea 16.4) no ejercita de forma
 * explícita: la IMPORTACIÓN EXPLÍCITA en destino con COLISIÓN de `gameId`. Cada
 * escenario usa dos `IDBFactory` SEPARADAS —origen y destino— sin ningún canal
 * de sincronización (22.10): la única transferencia son los bytes que produce
 * `BackupCodec.encode` en origen y consume `ImportBackup.execute` en destino
 * (22.11). No hay reloj real, `Math.random` ni acceso a red: reloj,
 * `idGenerator` y `snapshotIdGenerator` se inyectan.
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

/** Construye el caso de uso de importación para un adaptador destino. */
function importBackupFor(
  codec: BackupCodec,
  adapter: IndexedDbStoreAdapter,
): ImportBackup {
  return new ImportBackup({ codec, adapter, compatibility });
}

// --- Origen: creación de Partidas y agregado exportable ---------------------

/**
 * Crea una Partida en la generación activa del adaptador de ORIGEN con un
 * `snapshotIdGenerator` y una Semilla dados, y devuelve su {@link GameAggregate}
 * a partir de la Instantánea inicial confirmada (Estado, ambos registros y
 * Estado aleatorio íntegros), listo para exportar.
 */
async function createExportableGame(
  origin: IndexedDbStoreAdapter,
  id: GameId,
  seed: string,
  snapshotPrefix: string,
): Promise<GameAggregate> {
  const createGame = new CreateGame({
    repository: repositoryFor(origin),
    clock: fixedClock("2024-06-01T00:00:00.000Z"),
    idGenerator: counterIdGenerator(snapshotPrefix),
  });
  const created = await createGame.execute(initialInput(id, seed));
  return {
    gameId: id,
    saveVersion: created.snapshot.state.saveVersion,
    snapshot: created.snapshot,
  };
}

// --- Destino: lectura del Almacén importado ---------------------------------

/**
 * Foto directa de una Partida en la generación activa de un adaptador: resumen
 * (con puntero `latestSnapshotId`) e Instantánea enlazada. Devuelve ambos
 * campos `undefined` cuando la Partida no existe en esa generación.
 */
type StoredGame = Readonly<{
  summary: GameRecordPayload | undefined;
  snapshot: GameSnapshot | undefined;
}>;

async function readActiveGame(
  adapter: IndexedDbStoreAdapter,
  gameId: GameId,
): Promise<StoredGame> {
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

/** Ejecuta la importación y devuelve la previsualización, fallando si es rechazo. */
async function previewImport(
  importBackup: ImportBackup,
  bytes: Uint8Array,
): Promise<ImportPreview> {
  const outcome = await importBackup.execute(bytes);
  expect(outcome).toBeInstanceOf(ImportPreview);
  if (!(outcome instanceof ImportPreview)) {
    throw new Error("se esperaba una previsualización de importación válida");
  }
  return outcome;
}

describe("Traslado de Partidas entre contextos — exportar en origen e importar explícitamente en destino (requisitos 22.10, 22.11)", () => {
  let origin: IndexedDbStoreAdapter;
  let destination: IndexedDbStoreAdapter;
  const codec: BackupCodec = createBackupCodec();

  beforeEach(async () => {
    // Dos IDBFactory SEPARADAS: no hay canal de sincronización entre almacenes.
    origin = await openAdapter(new IDBFactory());
    destination = await openAdapter(new IDBFactory());
  });

  it("importa explícitamente en un destino vacío sin acoplar los dos almacenes", async () => {
    const first = await createExportableGame(
      origin,
      makeGameId("g-origin-1"),
      "seed-origin-1",
      "snap-origin-a",
    );
    const second = await createExportableGame(
      origin,
      makeGameId("g-origin-2"),
      "seed-origin-2",
      "snap-origin-b",
    );

    const pkg = await codec.encode([first, second]);

    // El destino está vacío ANTES de importar: sin colisiones ni acoplamiento.
    expect(await readActiveGame(destination, first.gameId)).toStrictEqual({
      summary: undefined,
      snapshot: undefined,
    });

    const preview = await previewImport(importBackupFor(codec, destination), pkg.bytes);
    expect(preview.hasCollisions).toBe(false);
    expect([...preview.importedGameIds].sort()).toEqual(
      [first.gameId, second.gameId].sort(),
    );
    await preview.confirm();

    // Las Partidas aparecen EQUIVALENTES en el destino.
    for (const aggregate of [first, second]) {
      const imported = await readActiveGame(destination, aggregate.gameId);
      expect(imported.snapshot).toStrictEqual(aggregate.snapshot);
      expect(imported.summary?.latestSnapshotId).toBe(aggregate.snapshot.id);
    }
    const meta = await destination.getMeta<ActiveGenerationMeta>(
      ACTIVE_GENERATION_META_KEY,
    );
    expect(meta?.activeGenerationId).toBe(activeGeneration);

    // El ORIGEN no se ve afectado por la importación: los almacenes están
    // aislados (dos IDBFactory), por lo que no hubo canal de sincronización.
    for (const aggregate of [first, second]) {
      const kept = await readActiveGame(origin, aggregate.gameId);
      expect(kept.snapshot).toStrictEqual(aggregate.snapshot);
    }
  });

  it("bloquea por defecto la colisión de gameId y exige reemplazo explícito o cancelar (nunca renombra)", async () => {
    const gameId = makeGameId("g-shared");

    // El destino YA tiene esa Partida (creada en su propio contexto).
    const destinationLocal = await createExportableGame(
      destination,
      gameId,
      "seed-destination",
      "snap-destination",
    );

    // El origen exporta una versión DISTINTA de la misma Partida (otra Semilla).
    const originExport = await createExportableGame(
      origin,
      gameId,
      "seed-origin",
      "snap-origin",
    );
    // La colisión es real: las dos Instantáneas del mismo `gameId` difieren.
    expect(originExport.snapshot).not.toStrictEqual(destinationLocal.snapshot);

    const pkg = await codec.encode([originExport]);
    const preview = await previewImport(importBackupFor(codec, destination), pkg.bytes);

    // Paso 4: la colisión se detecta y bloquea por defecto.
    expect(preview.hasCollisions).toBe(true);
    expect([...preview.collisions]).toEqual([gameId]);

    // Confirmar SIN resolución explícita falla-rápido y no toca la activa.
    await expect(preview.confirm()).rejects.toBeInstanceOf(UnresolvedCollisionError);
    const stillLocal = await readActiveGame(destination, gameId);
    expect(stillLocal.snapshot).toStrictEqual(destinationLocal.snapshot);
    expect(preview.isPending).toBe(true);
  });

  it("reemplaza la Partida en colisión solo con resolución explícita replace", async () => {
    const gameId = makeGameId("g-shared");
    await createExportableGame(destination, gameId, "seed-destination", "snap-destination");
    const originExport = await createExportableGame(
      origin,
      gameId,
      "seed-origin",
      "snap-origin",
    );

    const pkg = await codec.encode([originExport]);
    const preview = await previewImport(importBackupFor(codec, destination), pkg.bytes);
    expect(preview.hasCollisions).toBe(true);

    // Reemplazo EXPLÍCITO del mismo `gameId`: la Partida del origen se consolida.
    await preview.confirm({ [gameId]: "replace" });

    const replaced = await readActiveGame(destination, gameId);
    expect(replaced.snapshot).toStrictEqual(originExport.snapshot);
    expect(replaced.summary?.latestSnapshotId).toBe(originExport.snapshot.id);
    expect(preview.isPending).toBe(false);
  });

  it("cancela la importación en colisión y conserva intacta la Partida del destino", async () => {
    const gameId = makeGameId("g-shared");
    const destinationLocal = await createExportableGame(
      destination,
      gameId,
      "seed-destination",
      "snap-destination",
    );
    const originExport = await createExportableGame(
      origin,
      gameId,
      "seed-origin",
      "snap-origin",
    );

    const pkg = await codec.encode([originExport]);
    const preview = await previewImport(importBackupFor(codec, destination), pkg.bytes);
    expect(preview.hasCollisions).toBe(true);

    // Cancelar conserva la generación activa del destino intacta.
    preview.cancel();
    expect(preview.isPending).toBe(false);

    const kept = await readActiveGame(destination, gameId);
    expect(kept.snapshot).toStrictEqual(destinationLocal.snapshot);
    expect(kept.snapshot).not.toStrictEqual(originExport.snapshot);
  });
});
