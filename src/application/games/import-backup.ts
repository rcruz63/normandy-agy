/**
 * Caso de uso «importar copia de seguridad» con flujo fail-closed, staging y
 * confirmación cancelable ante colisión de `gameId` (Tarea 16.2, requisitos
 * 22.4, 22.5, 22.11).
 *
 * La importación es EXPLÍCITA en el dispositivo destino y no abre ningún canal
 * de sincronización (22.11). El flujo replica los seis pasos del diseño §6:
 *
 * 1. Leer los bytes del archivo SIN escribir el Almacenamiento: la validación
 *    del envoltorio/formato/canonicalización/suma la aporta {@link BackupCodec}
 *    (Tarea 16.1); un {@link BackupFailure} se devuelve tal cual, sin tocar el
 *    Almacenamiento (fail-closed, 22.5).
 * 2. Validar en PROFUNDIDAD cada agregado reutilizando el `InvariantValidator`
 *    del dominio (Instantáneas, registros y Estado aleatorio) y la coherencia de
 *    identificadores/Versión de guardado. Cualquier fallo devuelve un
 *    {@link ImportFailure} tipado ANTES de escribir nada.
 * 3. Escribir TODOS los agregados en una generación de STAGING de importación,
 *    distinta de la activa: no se toca ninguna Partida activa.
 * 4. Detectar colisiones de `gameId` contra la generación activa y exponerlas en
 *    un {@link ImportPreview}. Por defecto la importación de un agregado en
 *    colisión queda BLOQUEADA: la confirmación exige `replace` EXPLÍCITO de ese
 *    mismo `gameId` o `cancel` global; NUNCA se renombra en silencio.
 * 5. Al confirmar, escribir los agregados resueltos en la generación activa en
 *    UNA sola transacción y, DESPUÉS y dentro de la misma transacción, actualizar
 *    el puntero de generación activa (consolidación, diseño §6).
 * 6. Al cancelar, descartar el staging (material de trabajo invisible para la
 *    activa) y conservar la generación activa intacta.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta el códec (dominio), el
 * validador de invariantes (dominio) y el adaptador de IndexedDB (staging,
 * detección de colisión, commit atómico y cambio de generación). No interpreta
 * reglas, no accede a DOM/red/reloj/`Math.random` ni duplica la validación de
 * invariantes.
 */
import type { GameId } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import { validateSnapshot } from "../../domain/invariants/index.js";
import type { BackupCodec } from "../../domain/ports/index.js";
import type {
  BackupFailure,
  GameAggregate,
  ValidatedBackup,
} from "../../domain/persistence/index.js";
import {
  CURRENT_ENVELOPE_VERSION,
  compatibilityEvidence,
  type CompatibilityEvidence,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
  type EnvelopeIncompatibilityReason,
} from "../../domain/persistence/index.js";
import {
  IndexedDbStoreAdapter,
  type GameKey,
  type GenerationId,
  type ImportAggregateWrite,
  type SnapshotKey,
} from "../../adapters/browser/indexeddb/index.js";
import {
  ACTIVE_GENERATION_META_KEY,
  DEFAULT_GENERATION_ID,
  IMPORT_STAGING_GENERATION_ID,
  toGameRecordPayload,
  type ActiveGenerationMeta,
  type GameRecordPayload,
} from "./game-store-model.js";

// ---------------------------------------------------------------------------
// Motivos de fallo de la importación (fail-closed, tipados)
// ---------------------------------------------------------------------------

/**
 * Motivos por los que la validación PROFUNDA de la importación falla-cerrado,
 * en coherencia de estilo con `BackupRejectionReason`/`EnvelopeRejectionReason`.
 * Complementan los del códec (que cubren envoltorio/canonicalización/suma):
 *
 * - `invariant-violation`: una Instantánea rompe una Invariante del dominio.
 * - `snapshot-mismatch`: el `gameId`/Versión de guardado del agregado no
 *   concuerda con su Instantánea (o el estado que envuelve).
 * - `duplicate-game-id`: el paquete contiene dos agregados con el mismo `gameId`.
 * - `exported-ids-mismatch`: `exportedGameIds` no corresponde con los agregados.
 */
export type ImportContentRejectionReason =
  | "invariant-violation"
  | "snapshot-mismatch"
  | "duplicate-game-id"
  | "exported-ids-mismatch";

/** Todos los motivos propios del flujo posterior a validar el archivo. */
export type ImportRejectionReason =
  | ImportContentRejectionReason
  | EnvelopeIncompatibilityReason;

/** Rechazo por contenido incoherente aunque sus versiones sean soportadas. */
export type ImportContentFailure = Readonly<{
  ok: false;
  category: "invalid-content";
  reason: ImportContentRejectionReason;
  detail: string;
}>;

/** Rechazo estructurado de compatibilidad, siempre anterior al staging. */
export type ImportCompatibilityFailure = Readonly<{
  ok: false;
  category: "incompatible-version";
  phase: "import";
  reason: EnvelopeIncompatibilityReason;
  compatibility: CompatibilityEvidence;
}>;

/** Rechazo profundo o de compatibilidad de la importación. */
export type ImportFailure = ImportContentFailure | ImportCompatibilityFailure;

/** Cualquier rechazo de importación: del códec (16.1) o de la validación profunda. */
export type ImportRejection = BackupFailure | ImportFailure;

function importFailure(
  reason: ImportContentRejectionReason,
  detail: string,
): ImportContentFailure {
  return Object.freeze({
    ok: false,
    category: "invalid-content",
    reason,
    detail,
  });
}

function incompatibilityFailure(
  reason: EnvelopeIncompatibilityReason,
  found: Parameters<typeof compatibilityEvidence>[0],
  policy: CompatibilityPolicy,
): ImportCompatibilityFailure {
  return Object.freeze({
    ok: false,
    category: "incompatible-version",
    phase: "import",
    reason,
    compatibility: compatibilityEvidence(found, policy),
  });
}

// ---------------------------------------------------------------------------
// Resolución de colisiones
// ---------------------------------------------------------------------------

/**
 * Decisión EXPLÍCITA sobre un `gameId` en colisión con la generación activa. No
 * existe la opción de renombrar (rompería la trazabilidad, diseño §6): solo se
 * puede reemplazar el mismo agregado.
 */
export type CollisionResolution = "replace";

/** Mapa de resoluciones por `gameId` en colisión aportado al confirmar. */
export type CollisionResolutions = Readonly<Record<GameId, CollisionResolution>>;

/** Estado del ciclo de vida de una previsualización de importación (fail-fast). */
type ImportLifecycle = "pending" | "confirmed" | "cancelled";

/** Error tipado al operar sobre una previsualización de importación ya resuelta. */
export class ImportAlreadyResolvedError extends Error {
  public constructor(lifecycle: ImportLifecycle) {
    super(`La importación ya estaba ${lifecycle}.`);
    this.name = "ImportAlreadyResolvedError";
  }
}

/**
 * Error tipado cuando la confirmación no resuelve EXPLÍCITAMENTE una colisión de
 * `gameId`. Bloquea por defecto: sin `replace` explícito no se importa el
 * agregado en colisión (diseño §6, paso 4).
 */
export class UnresolvedCollisionError extends Error {
  public readonly gameId: GameId;

  public constructor(gameId: GameId) {
    super(
      `La Partida «${gameId}» colisiona con la generación activa y requiere ` +
        "reemplazo explícito o cancelar la importación.",
    );
    this.name = "UnresolvedCollisionError";
    this.gameId = gameId;
  }
}

// ---------------------------------------------------------------------------
// Previsualización cancelable
// ---------------------------------------------------------------------------

/**
 * Previsualización de una importación ya validada y preparada en staging. Expone
 * los `gameId` en colisión con la generación activa y las dos únicas acciones:
 * confirmar (resolviendo cada colisión con `replace` explícito) o cancelar
 * conservando la generación activa. Es de un solo uso: confirmar o cancelar dos
 * veces falla-rápido.
 */
export class ImportPreview {
  /** `gameId` importables que colisionan con la generación activa. */
  public readonly collisions: readonly GameId[];
  /** Todos los `gameId` presentes en el paquete importado. */
  public readonly importedGameIds: readonly GameId[];

  private readonly consolidate: (
    resolutions: CollisionResolutions,
  ) => Promise<void>;
  private lifecycle: ImportLifecycle = "pending";

  public constructor(params: {
    collisions: readonly GameId[];
    importedGameIds: readonly GameId[];
    consolidate: (resolutions: CollisionResolutions) => Promise<void>;
  }) {
    this.collisions = params.collisions;
    this.importedGameIds = params.importedGameIds;
    this.consolidate = params.consolidate;
  }

  /** ¿Sigue pendiente de confirmar o cancelar? */
  public get isPending(): boolean {
    return this.lifecycle === "pending";
  }

  /** ¿Hay al menos una colisión que exija decisión explícita? */
  public get hasCollisions(): boolean {
    return this.collisions.length > 0;
  }

  /**
   * Confirma la importación (paso 5). Exige que CADA `gameId` en colisión traiga
   * un `replace` explícito en `resolutions`; si falta alguno, falla-rápido con
   * {@link UnresolvedCollisionError} sin tocar la generación activa. En éxito,
   * escribe los agregados en la activa en UNA sola transacción y, después,
   * cambia el puntero de generación activa. De un solo uso.
   */
  public async confirm(
    resolutions: CollisionResolutions = {},
  ): Promise<void> {
    this.assertPending();
    this.assertCollisionsResolved(resolutions);
    await this.consolidate(resolutions);
    this.lifecycle = "confirmed";
  }

  /**
   * Cancela la importación (paso 6): descarta el staging y conserva la
   * generación activa intacta. De un solo uso.
   */
  public cancel(): void {
    this.assertPending();
    this.lifecycle = "cancelled";
  }

  private assertPending(): void {
    if (this.lifecycle !== "pending") {
      throw new ImportAlreadyResolvedError(this.lifecycle);
    }
  }

  private assertCollisionsResolved(resolutions: CollisionResolutions): void {
    for (const gameId of this.collisions) {
      if (resolutions[gameId] !== "replace") {
        throw new UnresolvedCollisionError(gameId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------------------

/** Dependencias inyectadas del caso de uso de importación. */
export type ImportBackupDeps = Readonly<{
  codec: BackupCodec;
  adapter: IndexedDbStoreAdapter;
  /** Compatibilidad base del Entorno para sellar los sobres importados. */
  compatibility: EnvelopeCompatibility;
  /** Política completa que debe superarse antes de escribir staging. */
  compatibilityPolicy: CompatibilityPolicy;
  /** Generación activa; por defecto {@link DEFAULT_GENERATION_ID}. */
  activeGenerationId?: GenerationId;
  /** Generación de staging; por defecto {@link IMPORT_STAGING_GENERATION_ID}. */
  stagingGenerationId?: GenerationId;
}>;

/**
 * Orquesta la importación fail-closed de una copia. `execute` valida y prepara
 * el staging; devuelve un {@link ImportPreview} cancelable o un rechazo tipado
 * sin haber tocado la generación activa.
 */
export class ImportBackup {
  private readonly codec: BackupCodec;
  private readonly adapter: IndexedDbStoreAdapter;
  private readonly compatibility: EnvelopeCompatibility;
  private readonly compatibilityPolicy: CompatibilityPolicy;
  private readonly activeGenerationId: GenerationId;
  private readonly stagingGenerationId: GenerationId;

  public constructor(deps: ImportBackupDeps) {
    this.codec = deps.codec;
    this.adapter = deps.adapter;
    this.compatibility = deps.compatibility;
    this.compatibilityPolicy = deps.compatibilityPolicy;
    this.activeGenerationId = deps.activeGenerationId ?? DEFAULT_GENERATION_ID;
    this.stagingGenerationId =
      deps.stagingGenerationId ?? IMPORT_STAGING_GENERATION_ID;
  }

  /**
   * Ejecuta los pasos 1-4 del flujo. Devuelve {@link ImportPreview} cuando el
   * paquete es válido y está preparado en staging, o un {@link ImportRejection}
   * (del códec o de la validación profunda) sin escribir la generación activa.
   */
  public async execute(bytes: Uint8Array): Promise<ImportPreview | ImportRejection> {
    // Pasos 1-2 (envoltorio/formato/canonicalización/suma): puro, sin escribir.
    const validated = await this.codec.validate(bytes);
    if (!validated.ok) {
      return validated;
    }

    // Paso 2a: compatibilidad completa ANTES de cualquier staging/escritura.
    const incompatibility = this.validateCompatibility(validated);
    if (incompatibility !== undefined) {
      return incompatibility;
    }

    // Paso 2b (profundo): identificadores, Versión de guardado e invariantes.
    const deepFailure = this.validateDeeply(validated);
    if (deepFailure !== undefined) {
      return deepFailure;
    }

    // Paso 3: escribir el staging aislado (no toca la generación activa).
    await this.stageAggregates(validated.games);

    // Paso 4: detectar colisiones de `gameId` contra la generación activa.
    const importedGameIds = validated.games.map((aggregate) => aggregate.gameId);
    const collisions = await this.detectCollisions(importedGameIds);

    return new ImportPreview({
      collisions,
      importedGameIds,
      consolidate: (resolutions) =>
        this.consolidate(validated.games, resolutions),
    });
  }

  /** Comprueba todas las versiones antes del primer `put` de staging. */
  private validateCompatibility(
    validated: ValidatedBackup,
  ): ImportCompatibilityFailure | undefined {
    return findImportIncompatibility(validated, this.compatibilityPolicy);
  }

  /**
   * Valida en profundidad todos los agregados: unicidad de `gameId`, coherencia
   * con `exportedGameIds`, concordancia de `gameId`/Versión de guardado con la
   * Instantánea y sus Invariantes de dominio. Devuelve el primer fallo o
   * `undefined` si todo es válido (fail-fast).
   */
  private validateDeeply(validated: ValidatedBackup): ImportFailure | undefined {
    const seen = new Set<GameId>();
    for (const aggregate of validated.games) {
      if (seen.has(aggregate.gameId)) {
        return importFailure(
          "duplicate-game-id",
          `el paquete contiene dos agregados con el mismo gameId «${aggregate.gameId}»`,
        );
      }
      seen.add(aggregate.gameId);

      const coherence = checkAggregateCoherence(aggregate);
      if (coherence !== undefined) {
        return coherence;
      }

      const result = validateSnapshot(aggregate.snapshot);
      if (result.kind !== "valid") {
        const first = result.violations[0];
        return importFailure(
          "invariant-violation",
          `la Instantánea de «${aggregate.gameId}» viola ${result.violations.length} ` +
            `invariante(s); primera en «${first?.path ?? "desconocido"}»`,
        );
      }
    }

    return this.checkExportedIds(validated);
  }

  /**
   * Comprueba que `exportedGameIds` corresponde exactamente (mismo conjunto y
   * mismo tamaño) con los `gameId` de los agregados, sin huecos ni sobrantes.
   */
  private checkExportedIds(validated: ValidatedBackup): ImportFailure | undefined {
    const aggregateIds = validated.games.map((aggregate) => aggregate.gameId);
    if (validated.exportedGameIds.length !== aggregateIds.length) {
      return importFailure(
        "exported-ids-mismatch",
        "exportedGameIds no coincide en tamaño con los agregados del paquete",
      );
    }
    const declared = new Set<GameId>(validated.exportedGameIds);
    for (const gameId of aggregateIds) {
      if (!declared.has(gameId)) {
        return importFailure(
          "exported-ids-mismatch",
          `el agregado «${gameId}» no figura en exportedGameIds`,
        );
      }
    }
    return undefined;
  }

  /**
   * Escribe cada agregado en la generación de staging (Instantánea + resumen con
   * puntero `latestSnapshotId`). No toca la generación activa: el staging es
   * material de trabajo aislado por `generationId`.
   */
  private async stageAggregates(
    games: readonly GameAggregate[],
  ): Promise<void> {
    for (const aggregate of games) {
      const write = this.aggregateWrite(this.stagingGenerationId, aggregate);
      await this.adapter.putSnapshot(write.snapshot.key, write.snapshot.write);
      await this.adapter.putGame(write.game.key, write.game.write);
    }
  }

  /**
   * Detecta qué `gameId` del paquete ya existen en la generación activa. Lee sin
   * escribir; cada lectura del adaptador valida el sobre existente.
   */
  private async detectCollisions(
    importedGameIds: readonly GameId[],
  ): Promise<readonly GameId[]> {
    const collisions: GameId[] = [];
    for (const gameId of importedGameIds) {
      const existing = await this.adapter.getGame<GameRecordPayload>({
        generationId: this.activeGenerationId,
        gameId,
      });
      if (existing !== undefined) {
        collisions.push(gameId);
      }
    }
    return Object.freeze(collisions);
  }

  /**
   * Paso 5: escribe los agregados resueltos en la generación activa en UNA sola
   * transacción y, después, actualiza el puntero de generación activa dentro de
   * esa misma transacción. Un agregado en colisión solo se incluye si trae
   * `replace` explícito (la previsualización ya lo garantiza antes de llamar).
   */
  private async consolidate(
    games: readonly GameAggregate[],
    _resolutions: CollisionResolutions,
  ): Promise<void> {
    const aggregates = games.map((aggregate) =>
      this.aggregateWrite(this.activeGenerationId, aggregate),
    );
    const activeMeta: ActiveGenerationMeta = {
      activeGenerationId: this.activeGenerationId,
    };

    await this.adapter.commitImport<
      GameSnapshot,
      GameRecordPayload,
      ActiveGenerationMeta
    >({
      aggregates,
      meta: {
        key: ACTIVE_GENERATION_META_KEY,
        write: { compatibility: this.compatibility, payload: activeMeta },
      },
    });
  }

  /**
   * Compone la escritura de un agregado (Instantánea + resumen) bajo una
   * generación dada. La compatibilidad del sobre se deriva del propio agregado
   * (Versión de guardado/reglas/algoritmo) sobre la base del Entorno.
   */
  private aggregateWrite(
    generationId: GenerationId,
    aggregate: GameAggregate,
  ): ImportAggregateWrite<GameSnapshot, GameRecordPayload> {
    const compatibility = this.deriveCompatibility(aggregate);
    const snapshotKey: SnapshotKey = {
      generationId,
      gameId: aggregate.gameId,
      snapshotId: aggregate.snapshot.id,
    };
    const gameKey: GameKey = { generationId, gameId: aggregate.gameId };
    return {
      snapshot: {
        key: snapshotKey,
        write: {
          compatibility,
          gameId: aggregate.gameId,
          payload: aggregate.snapshot,
        },
      },
      game: {
        key: gameKey,
        write: {
          compatibility,
          gameId: aggregate.gameId,
          payload: toGameRecordPayload(aggregate.snapshot),
        },
      },
    };
  }

  /**
   * Deriva la compatibilidad del sobre a partir del agregado importado: la
   * Versión de guardado y el algoritmo aleatorio provienen de la Instantánea; la
   * Versión de reglas, de su Estado. Así el sobre importado declara sus propias
   * versiones y cualquier lectura posterior las valida.
   */
  private deriveCompatibility(aggregate: GameAggregate): EnvelopeCompatibility {
    return {
      saveVersion: aggregate.saveVersion,
      rulesVersion: aggregate.snapshot.state.rulesVersion,
      algorithmVersion: aggregate.snapshot.randomState.algorithmVersion,
    };
  }
}

/**
 * Devuelve la primera incompatibilidad del paquete o de sus agregados. Incluye
 * la versión de sobre que el importador va a sellar, aunque el archivo no
 * transporte sobres IndexedDB.
 */
function findImportIncompatibility(
  validated: ValidatedBackup,
  policy: CompatibilityPolicy,
): ImportCompatibilityFailure | undefined {
  const packageVersions = {
    envelopeVersion: CURRENT_ENVELOPE_VERSION,
    saveVersion: validated.saveVersion,
  };
  if (!policy.supportedEnvelopeVersions.includes(CURRENT_ENVELOPE_VERSION)) {
    return incompatibilityFailure(
      "unsupported-envelope-version",
      packageVersions,
      policy,
    );
  }
  if (!policy.supportedSaveVersions.includes(validated.saveVersion)) {
    return incompatibilityFailure(
      "unsupported-save-version",
      packageVersions,
      policy,
    );
  }
  for (const aggregate of validated.games) {
    const failure = aggregateIncompatibility(aggregate, policy);
    if (failure !== undefined) {
      return failure;
    }
  }
  return undefined;
}

function aggregateIncompatibility(
  aggregate: GameAggregate,
  policy: CompatibilityPolicy,
): ImportCompatibilityFailure | undefined {
  const found = {
    envelopeVersion: CURRENT_ENVELOPE_VERSION,
    saveVersion: aggregate.saveVersion,
    rulesVersion: aggregate.snapshot.state.rulesVersion,
    algorithmVersion: aggregate.snapshot.randomState.algorithmVersion,
  };
  if (!policy.supportedSaveVersions.includes(aggregate.saveVersion)) {
    return incompatibilityFailure("unsupported-save-version", found, policy);
  }
  if (!policy.supportedRulesVersions.includes(found.rulesVersion)) {
    return incompatibilityFailure("unsupported-rules-version", found, policy);
  }
  if (!policy.supportedAlgorithmVersions.includes(found.algorithmVersion)) {
    return incompatibilityFailure(
      "unsupported-algorithm-version",
      found,
      policy,
    );
  }
  return undefined;
}

/**
 * Comprueba la coherencia de un agregado con su Instantánea: `gameId` del
 * agregado, de la Instantánea y del Estado envuelto deben coincidir, y la
 * Versión de guardado del agregado con la del Estado. Devuelve un fallo tipado o
 * `undefined`.
 */
function checkAggregateCoherence(
  aggregate: GameAggregate,
): ImportFailure | undefined {
  if (aggregate.gameId !== aggregate.snapshot.gameId) {
    return importFailure(
      "snapshot-mismatch",
      `el gameId del agregado «${aggregate.gameId}» no coincide con el de su Instantánea`,
    );
  }
  if (aggregate.gameId !== aggregate.snapshot.state.gameId) {
    return importFailure(
      "snapshot-mismatch",
      `el gameId del agregado «${aggregate.gameId}» no coincide con el del Estado envuelto`,
    );
  }
  if (aggregate.saveVersion !== aggregate.snapshot.state.saveVersion) {
    return importFailure(
      "snapshot-mismatch",
      `la Versión de guardado del agregado «${aggregate.gameId}» no coincide con la del Estado`,
    );
  }
  return undefined;
}
