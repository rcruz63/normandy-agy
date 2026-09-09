/**
 * Cuarentena y recuperación de corrupción (Tarea 15.4).
 *
 * Orquesta la carga segura de una Partida detectando corrupción de sobre y
 * reaccionando según los requisitos 19.9, 19.10, 21.5, 21.6, 21.7 y 21.8:
 *
 * - 21.6 Cuarentena: si al reanudar el sobre falla su validación
 *   ({@link EnvelopeValidationError} de `openEnvelope`), se AÍSLA en `quarantine`
 *   SIN borrar sus bytes, se EXCLUYE esa Partida de la reanudación y se
 *   CONSERVAN intactas las demás. No se pierde información.
 * - 21.7/21.8 Diagnóstico de restauración: cuando la reanudación desde una
 *   Instantánea confirmada tiene éxito, se devuelve la fecha (`confirmedAt`) e
 *   id (`snapshotId`) de la Instantánea restaurada para que la UI los informe.
 * - 19.9/19.10/21.5 `PendingDiagnostic`: si la escritura de cuarentena también
 *   falla (IndexedDB no acepta escritura), el diagnóstico NO se pierde: se
 *   conserva en el {@link PendingDiagnosticRegistry} en memoria para que la
 *   exportación de recuperación (Tarea 17.1) lo incorpore.
 *
 * FRONTERA DE CAPAS: vive en `application/`. Orquesta puertos (repositorio,
 * caso de uso de reanudación) y la primitiva de bytes del adaptador; no
 * interpreta reglas ni ejecuta I/O de IndexedDB por sí mismo. La marca de
 * detección (`detectedAtId`) llega por inyección (`idGenerator`): no lee reloj
 * ni `Math.random`. Reutiliza la lógica de `ResumeGame` (no la duplica) y el
 * `list()` del repositorio, filtrando las Partidas en cuarentena.
 */
import type { GameId, SnapshotId } from "../../domain/identity/index.js";
import type { GameSnapshot } from "../../domain/engine/state.js";
import type { GameRepository, GameSummary } from "../../domain/ports/index.js";
import {
  EnvelopeValidationError,
  envelopeCompatibilityEvidence,
  isEnvelopeIncompatibilityReason,
  type EnvelopeIncompatibilityReason,
  type RecoveryArtifact,
  type RecoveryExportPackage,
} from "../../domain/persistence/index.js";
import type { QuarantineRecord } from "../../adapters/browser/indexeddb/index.js";
import type { IdGenerator } from "./indexeddb-game-repository.js";
import { GameNotFoundError } from "./indexeddb-game-repository.js";
import { ResumeGame } from "./resume-game.js";
import { PendingDiagnosticRegistry } from "./pending-diagnostic.js";
import { RecoveryExporter } from "./recovery-export.js";
import { QuarantineLedger } from "./quarantine-ledger.js";
import {
  corruptSnapshotDiagnostic,
  incompatibleVersionDiagnostic,
  previousBackupRequiredDiagnostic,
  quarantineWriteFailureDiagnostic,
} from "./recovery-diagnostics.js";

/**
 * Almacén de sobres corruptos: primitiva de bytes del adaptador de IndexedDB.
 *
 * Coincide estructuralmente con {@link IndexedDbStoreAdapter}: `isolateCorrupt`
 * archiva un sobre SIN borrar sus bytes y `getQuarantined` los recupera por su
 * clave `[gameId, detectedAtId]`. Se declara como puerto mínimo para que el
 * servicio dependa de la capacidad, no de la clase concreta (y para poder
 * inyectar un almacén que rechace escrituras en pruebas).
 */
export interface QuarantineArchive {
  isolateCorrupt(record: QuarantineRecord): Promise<void>;
  getQuarantined(
    gameId: GameId,
    detectedAtId: string,
  ): Promise<QuarantineRecord | undefined>;
}

/**
 * Aviso de Instantánea restaurada (21.7/21.8): fecha e id de la Instantánea
 * confirmada desde la que se reanuda tras un cierre inesperado.
 */
export type RestoredSnapshotNotice = Readonly<{
  snapshotId: SnapshotId;
  confirmedAt: string;
}>;

/** Resultado de una reanudación segura y fail-closed. */
export type SafeResumeResult =
  | Readonly<{
      kind: "restored";
      snapshot: GameSnapshot;
      notice: RestoredSnapshotNotice;
    }>
  | Readonly<{
      kind: "quarantined";
      gameId: GameId;
      detectedAtId: string;
      reasonKey: string;
      /** `true` si el aislamiento se persistió; `false` si solo quedó pendiente. */
      isolated: boolean;
    }>
  | Readonly<{
      kind: "incompatible";
      gameId: GameId;
      diagnostic: ReturnType<typeof incompatibleVersionDiagnostic>;
      recoveryExport: RecoveryExportPackage;
    }>
  | Readonly<{
      kind: "backup-required";
      gameId: GameId;
      diagnostic: ReturnType<typeof previousBackupRequiredDiagnostic>;
      recoveryExport: RecoveryExportPackage;
    }>;

/** Dependencias inyectadas del servicio de cuarentena y recuperación. */
export type CorruptionRecoveryDeps = Readonly<{
  repository: GameRepository;
  archive: QuarantineArchive;
  idGenerator: IdGenerator;
  pendingDiagnostics: PendingDiagnosticRegistry;
  ledger?: QuarantineLedger;
  resumeGame?: ResumeGame;
}>;

/**
 * Servicio de cuarentena y recuperación de corrupción. Envuelve la reanudación
 * y el listado del repositorio aplicando la política de aislamiento y el aviso
 * de Instantánea restaurada.
 */
export class CorruptionRecoveryService {
  private readonly repository: GameRepository;
  private readonly archive: QuarantineArchive;
  private readonly idGenerator: IdGenerator;
  private readonly pendingDiagnostics: PendingDiagnosticRegistry;
  private readonly recoveryExporter: RecoveryExporter;
  private readonly ledger: QuarantineLedger;
  private readonly resumeGame: ResumeGame;

  public constructor(deps: CorruptionRecoveryDeps) {
    this.repository = deps.repository;
    this.archive = deps.archive;
    this.idGenerator = deps.idGenerator;
    this.pendingDiagnostics = deps.pendingDiagnostics;
    this.recoveryExporter = new RecoveryExporter({
      pendingDiagnostics: deps.pendingDiagnostics,
    });
    this.ledger = deps.ledger ?? new QuarantineLedger();
    this.resumeGame = deps.resumeGame ?? new ResumeGame({ repository: deps.repository });
  }

  /** Índice de cuarentena consultable por la UI/pruebas (solo lectura). */
  public get quarantine(): QuarantineLedger {
    return this.ledger;
  }

  /** Diagnósticos pendientes en memoria consultables por la UI/pruebas. */
  public get pending(): PendingDiagnosticRegistry {
    return this.pendingDiagnostics;
  }

  /**
   * Reanuda una Partida de forma segura. Si su sobre está corrupto, la aísla y
   * devuelve un resultado `quarantined`; si es válido, devuelve `restored` con
   * el aviso de fecha/id de la Instantánea restaurada (21.7/21.8).
   *
   * Solo captura {@link EnvelopeValidationError} (corrupción de sobre); cualquier
   * otro error se propaga (fail-fast, sin `catch` genéricos).
   */
  public async resume(gameId: GameId): Promise<SafeResumeResult> {
    try {
      const resumed = await this.resumeGame.execute(gameId);
      return Object.freeze({
        kind: "restored",
        snapshot: resumed.snapshot,
        notice: Object.freeze({
          snapshotId: resumed.summary.latestSnapshotId,
          confirmedAt: resumed.summary.confirmedAt,
        }),
      });
    } catch (error) {
      if (error instanceof EnvelopeValidationError) {
        if (isEnvelopeIncompatibilityReason(error.reason)) {
          return this.blockIncompatible(gameId, error, error.reason);
        }
        return this.quarantineCorrupt(gameId, error);
      }
      if (error instanceof GameNotFoundError) {
        return this.requirePreviousBackup(gameId);
      }
      throw error;
    }
  }

  /**
   * Proyecta los resúmenes reanudables: los del repositorio EXCLUYENDO las
   * Partidas en cuarentena (21.6). Las demás Partidas permanecen intactas y
   * reanudables.
   */
  public async listResumable(): Promise<readonly GameSummary[]> {
    const summaries = await this.repository.list();
    return Object.freeze(
      summaries.filter((summary) => !this.ledger.isQuarantined(summary.gameId)),
    );
  }

  /**
   * Bloquea una versión no soportada sin cuarentena ni escritura y entrega el
   * sobre original en una exportación local, junto con versiones encontradas y
   * soportadas. La Instantánea compatible anterior permanece sin tocar.
   */
  private blockIncompatible(
    gameId: GameId,
    error: EnvelopeValidationError,
    reason: EnvelopeIncompatibilityReason,
  ): SafeResumeResult {
    if (error.envelope === undefined || error.policy === undefined) {
      throw new Error(
        "La incompatibilidad no conserva el sobre y la política que la rechazaron.",
      );
    }
    const diagnosticId = this.idGenerator.next();
    const compatibility = envelopeCompatibilityEvidence(
      error.envelope,
      error.policy,
    );
    const snapshotId = error.context.expectedSnapshotId;
    const diagnostic = incompatibleVersionDiagnostic(
      snapshotId === undefined
        ? { diagnosticId, gameId, reason, compatibility }
        : {
            diagnosticId,
            gameId,
            snapshotId,
            reason,
            compatibility,
          },
    );
    const artifact = this.incompatibleArtifact(gameId, error, snapshotId);
    const recoveryExport = this.recoveryExporter.export({ diagnostic, artifact });
    return Object.freeze({
      kind: "incompatible",
      gameId,
      diagnostic,
      recoveryExport,
    });
  }

  /** Proyecta la pérdida local sin convertirla en corrupción ni restaurar sola. */
  private requirePreviousBackup(gameId: GameId): SafeResumeResult {
    const diagnostic = previousBackupRequiredDiagnostic(
      this.idGenerator.next(),
      gameId,
    );
    const recoveryExport = this.recoveryExporter.export({ diagnostic });
    return Object.freeze({
      kind: "backup-required",
      gameId,
      diagnostic,
      recoveryExport,
    });
  }

  private incompatibleArtifact(
    gameId: GameId,
    error: EnvelopeValidationError,
    snapshotId: SnapshotId | undefined,
  ): RecoveryArtifact {
    if (error.envelope === undefined) {
      throw new Error("El sobre incompatible no está disponible para exportar.");
    }
    const base = {
      kind: "versioned-envelope" as const,
      gameId,
      envelope: error.envelope,
    };
    return Object.freeze(
      snapshotId === undefined ? base : { ...base, snapshotId },
    );
  }

  /**
   * Aísla un sobre corrupto sin borrar bytes y lo marca como excluido. Si la
   * escritura de cuarentena también falla, conserva el diagnóstico en memoria.
   */
  private async quarantineCorrupt(
    gameId: GameId,
    error: EnvelopeValidationError,
  ): Promise<SafeResumeResult> {
    const detectedAtId = this.idGenerator.next();
    const diagnostic = corruptSnapshotDiagnostic(error.reason, error.detail);
    const reasonKey = diagnostic.message.messageKey;
    const record: QuarantineRecord = {
      gameId,
      detectedAtId,
      reasonKey,
      isolatedPayload: { gameId, reason: error.reason, detail: error.detail },
    };

    const isolated = await this.tryIsolate(
      gameId,
      record,
      error.context.expectedSnapshotId,
    );
    this.ledger.record({ gameId, detectedAtId, reasonKey });

    return Object.freeze({
      kind: "quarantined",
      gameId,
      detectedAtId,
      reasonKey,
      isolated,
    });
  }

  /**
   * Intenta persistir el aislamiento. Devuelve `true` si se escribió; si la
   * escritura falla, conserva el diagnóstico pendiente en memoria (19.9, 19.10)
   * y devuelve `false`. No silencia el error: lo transforma en diagnóstico
   * consultable.
   */
  private async tryIsolate(
    gameId: GameId,
    record: QuarantineRecord,
    snapshotId: SnapshotId | undefined,
  ): Promise<boolean> {
    try {
      await this.archive.isolateCorrupt(record);
      return true;
    } catch (writeError) {
      const detail =
        writeError instanceof Error ? writeError.message : String(writeError);
      const pending = {
        diagnosticId: record.detectedAtId,
        gameId,
        phase: "quarantine-write" as const,
        diagnostic: quarantineWriteFailureDiagnostic(detail),
      };
      this.pendingDiagnostics.record(
        snapshotId === undefined
          ? pending
          : { ...pending, lastConfirmedSnapshotId: snapshotId },
      );
      return false;
    }
  }
}
