/**
 * Implementación pura del puerto `MigrationRegistry` (Tarea 16.3, requisitos
 * 22.6, 22.8, 22.9, 22.10).
 *
 * `plan(from, to)` compone la cadena EXPLÍCITA de migradores registrados que
 * lleva de una Versión de guardado a otra; si no existe ruta devuelve
 * `undefined` (nunca un `default` silencioso). `migrate(input, plan)` aplica la
 * cadena sobre la generación de entrada (pasos 2-3 del diseño §6), verifica la
 * conservación de todas las Partidas, ambos registros y el Estado aleatorio, y
 * ejecuta las Invariantes del dominio por Instantánea migrada, devolviendo un
 * {@link MigrationResult} tipado (éxito o fallo fail-fast).
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es DETERMINISTA.
 * No importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`; no realiza ninguna llamada a servidor (requisito 22.10). La copia
 * recuperable, el staging y el cambio de `activeGenerationId` viven en la capa
 * de aplicación (`application/games/migrate-storage.ts`).
 */
import type { SaveVersion } from "../identity/index.js";
import type { GameSnapshot } from "../engine/state.js";
import { validateSnapshot } from "../invariants/index.js";
import type { MigrationRegistry } from "../ports/backup-codec.js";
import {
  migrationFailure,
  migrationSuccess,
  type MigrationPlan,
  type MigrationResult,
  type Migrator,
  type StorageGeneration,
} from "./migration.js";

/**
 * Longitud máxima de una cadena de migradores. Acota la búsqueda de ruta para
 * descartar ciclos accidentales entre Versiones de guardado sin recorrer un
 * grafo infinito; en la práctica las Versiones avanzan de forma monótona.
 */
const MAX_MIGRATION_STEPS = 64;

/**
 * Registro puro de migradores indexados por su Versión de guardado de origen.
 * Compone planes encadenando pasos contiguos y aplica la cadena verificando la
 * conservación de campos e Invariantes.
 */
export class InMemoryMigrationRegistry implements MigrationRegistry {
  /** Migradores por Versión de guardado de origen (a lo sumo uno por origen). */
  private readonly byOrigin: ReadonlyMap<SaveVersion, Migrator>;

  public constructor(migrators: readonly Migrator[]) {
    this.byOrigin = indexByOrigin(migrators);
  }

  /**
   * Compone la cadena de migradores de `from` a `to`. Devuelve `undefined` si
   * `from`/`to` no están registrados como ruta contigua (sin saltos ni
   * `default` silencioso). Una migración de `from === to` es un plan vacío
   * válido: no hay nada que transformar.
   */
  public plan(from: SaveVersion, to: SaveVersion): MigrationPlan | undefined {
    if (from === to) {
      return Object.freeze({ from, to, steps: Object.freeze([]) });
    }
    const steps: Migrator[] = [];
    let current = from;
    while (current !== to && steps.length < MAX_MIGRATION_STEPS) {
      const step = this.byOrigin.get(current);
      if (step === undefined) {
        return undefined;
      }
      steps.push(step);
      current = step.to;
    }
    if (current !== to) {
      return undefined;
    }
    return Object.freeze({ from, to, steps: Object.freeze([...steps]) });
  }

  /**
   * Aplica el plan sobre `input` y verifica la migración (diseño §6, pasos
   * 2-3). Fail-fast: ante el primer fallo devuelve un {@link MigrationFailure}
   * sin exponer una generación parcialmente migrada.
   */
  public migrate(input: StorageGeneration, plan: MigrationPlan): MigrationResult {
    const chainFailure = validatePlanShape(input, plan);
    if (chainFailure !== undefined) {
      return chainFailure;
    }

    const migrated = applyChain(input, plan);

    const versionFailure = checkTargetVersion(migrated, plan.to);
    if (versionFailure !== undefined) {
      return versionFailure;
    }

    const preservationFailure = checkPreservation(input, migrated);
    if (preservationFailure !== undefined) {
      return preservationFailure;
    }

    const invariantFailure = checkInvariants(migrated);
    if (invariantFailure !== undefined) {
      return invariantFailure;
    }

    return migrationSuccess(migrated);
  }
}

/** Crea un {@link MigrationRegistry} a partir de una lista de migradores. */
export function createMigrationRegistry(
  migrators: readonly Migrator[],
): MigrationRegistry {
  return new InMemoryMigrationRegistry(migrators);
}

// ---------------------------------------------------------------------------
// Composición del registro
// ---------------------------------------------------------------------------

/** Error tipado al registrar dos migradores con la misma Versión de origen. */
export class DuplicateMigratorError extends Error {
  public readonly from: SaveVersion;

  public constructor(from: SaveVersion) {
    super(`Ya existe un migrador con Versión de guardado de origen «${from}».`);
    this.name = "DuplicateMigratorError";
    this.from = from;
  }
}

/**
 * Indexa los migradores por su Versión de origen. Rechaza rutas ambiguas (dos
 * migradores desde el mismo origen) para que un plan sea determinista.
 */
function indexByOrigin(
  migrators: readonly Migrator[],
): ReadonlyMap<SaveVersion, Migrator> {
  const byOrigin = new Map<SaveVersion, Migrator>();
  for (const migrator of migrators) {
    if (byOrigin.has(migrator.from)) {
      throw new DuplicateMigratorError(migrator.from);
    }
    byOrigin.set(migrator.from, migrator);
  }
  return byOrigin;
}

// ---------------------------------------------------------------------------
// Aplicación y verificación (pasos 2-3)
// ---------------------------------------------------------------------------

/**
 * Comprueba la forma del plan respecto de la entrada: la Versión de guardado de
 * `input` coincide con el origen del plan, el plan no está vacío (salvo cuando
 * `from === to`) y cada paso encadena con el siguiente. Devuelve el primer
 * fallo o `undefined`.
 */
function validatePlanShape(
  input: StorageGeneration,
  plan: MigrationPlan,
): MigrationResult | undefined {
  if (input.saveVersion !== plan.from) {
    return migrationFailure(
      "plan-version-mismatch",
      `la generación de entrada declara Versión de guardado «${input.saveVersion}» ` +
        `pero el plan parte de «${plan.from}»`,
    );
  }
  if (plan.steps.length === 0) {
    if (plan.from !== plan.to) {
      return migrationFailure(
        "empty-plan",
        `no hay migradores para pasar de «${plan.from}» a «${plan.to}»`,
      );
    }
    return undefined;
  }
  let expectedOrigin = plan.from;
  for (const [index, step] of plan.steps.entries()) {
    if (step.from !== expectedOrigin) {
      return migrationFailure(
        "broken-chain",
        `el paso ${index} parte de «${step.from}» pero se esperaba «${expectedOrigin}»`,
      );
    }
    expectedOrigin = step.to;
  }
  return undefined;
}

/** Aplica en orden cada migrador del plan sobre la generación de entrada. */
function applyChain(
  input: StorageGeneration,
  plan: MigrationPlan,
): StorageGeneration {
  let current = input;
  for (const step of plan.steps) {
    current = step.apply(current);
  }
  return current;
}

/**
 * Comprueba que la Versión de guardado resultante coincide con el destino del
 * plan (requisito 22.8: la nueva Versión de guardado se confirma solo si es la
 * esperada). Devuelve un fallo `integrity-mismatch` o `undefined`.
 */
function checkTargetVersion(
  migrated: StorageGeneration,
  target: SaveVersion,
): MigrationResult | undefined {
  if (migrated.saveVersion !== target) {
    return migrationFailure(
      "integrity-mismatch",
      `la generación migrada declara Versión de guardado «${migrated.saveVersion}» ` +
        `pero el plan apunta a «${target}»`,
    );
  }
  return undefined;
}

/**
 * Verifica la CONSERVACIÓN de campos (requisitos 22.6, 22.9): la migración no
 * puede descartar ninguna Partida ni vaciar sus registros o su Estado
 * aleatorio. Compara el conjunto de `gameId` de entrada con el de salida y, por
 * cada Partida conservada, que ambos registros no se acorten y que el Estado
 * aleatorio siga presente y no retroceda. Devuelve el primer fallo o
 * `undefined`.
 */
function checkPreservation(
  before: StorageGeneration,
  after: StorageGeneration,
): MigrationResult | undefined {
  const migratedById = indexSnapshotsByGameId(after.games);

  if (after.games.length !== before.games.length) {
    return migrationFailure(
      "field-not-preserved",
      `la migración cambió el número de Partidas de ${before.games.length} a ${after.games.length}`,
    );
  }

  for (const original of before.games) {
    const migrated = migratedById.get(original.gameId);
    if (migrated === undefined) {
      return migrationFailure(
        "field-not-preserved",
        `la migración descartó la Partida «${original.gameId}»`,
      );
    }
    const snapshotFailure = checkSnapshotPreservation(original, migrated);
    if (snapshotFailure !== undefined) {
      return snapshotFailure;
    }
  }
  return undefined;
}

/**
 * Comprueba que una Instantánea migrada conserva ambos registros y el Estado
 * aleatorio de la original: los registros no pueden acortarse y la posición
 * aleatoria no puede retroceder ni cambiar de algoritmo. Un migrador puede
 * AÑADIR entradas o AVANZAR el Estado aleatorio si su conversión lo declara,
 * pero nunca DESCARTAR lo ya confirmado (diseño §6).
 */
function checkSnapshotPreservation(
  original: GameSnapshot,
  migrated: GameSnapshot,
): MigrationResult | undefined {
  if (migrated.simpleLog.length < original.simpleLog.length) {
    return migrationFailure(
      "field-not-preserved",
      `la migración acortó el Registro simple de «${original.gameId}» de ` +
        `${original.simpleLog.length} a ${migrated.simpleLog.length} entradas`,
    );
  }
  if (migrated.detailedLog.length < original.detailedLog.length) {
    return migrationFailure(
      "field-not-preserved",
      `la migración acortó el Registro detallado de «${original.gameId}» de ` +
        `${original.detailedLog.length} a ${migrated.detailedLog.length} entradas`,
    );
  }
  if (migrated.randomState.algorithmVersion !== original.randomState.algorithmVersion) {
    return migrationFailure(
      "field-not-preserved",
      `la migración alteró el algoritmo aleatorio de «${original.gameId}» de ` +
        `«${original.randomState.algorithmVersion}» a «${migrated.randomState.algorithmVersion}»`,
    );
  }
  if (migrated.randomState.position < original.randomState.position) {
    return migrationFailure(
      "field-not-preserved",
      `la migración retrocedió el Estado aleatorio de «${original.gameId}» de ` +
        `${original.randomState.position} a ${migrated.randomState.position}`,
    );
  }
  return undefined;
}

/**
 * Ejecuta las Invariantes del dominio sobre cada Instantánea migrada (paso 3,
 * requisito 22.6). Devuelve el primer `invariant-violation` con sus violaciones
 * o `undefined` si todas son válidas.
 */
function checkInvariants(
  migrated: StorageGeneration,
): MigrationResult | undefined {
  for (const snapshot of migrated.games) {
    const result = validateSnapshot(snapshot);
    if (result.kind !== "valid") {
      const first = result.violations[0];
      return migrationFailure(
        "invariant-violation",
        `la Instantánea migrada de «${snapshot.gameId}» viola ` +
          `${result.violations.length} invariante(s); primera en ` +
          `«${first?.path ?? "desconocido"}»`,
        result.violations,
      );
    }
  }
  return undefined;
}

/** Indexa las Instantáneas de una generación por `gameId` para búsqueda O(1). */
function indexSnapshotsByGameId(
  games: readonly GameSnapshot[],
): ReadonlyMap<GameSnapshot["gameId"], GameSnapshot> {
  const byId = new Map<GameSnapshot["gameId"], GameSnapshot>();
  for (const snapshot of games) {
    byId.set(snapshot.gameId, snapshot);
  }
  return byId;
}
