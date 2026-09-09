/**
 * Orquestación de la exportación local de recuperación (Tarea 17.1).
 *
 * Copia los diagnósticos pendientes directamente desde el registro en memoria
 * y delega la serialización canónica al dominio. No persiste, no transmite y no
 * vacía el registro: una descarga fallida puede repetirse sin perder evidencia.
 */
import {
  createRecoveryExport,
  type ExportedPendingDiagnostic,
  type RecoveryArtifact,
  type RecoveryDiagnostic,
  type RecoveryExportPackage,
} from "../../domain/persistence/index.js";
import { PendingDiagnosticRegistry } from "./pending-diagnostic.js";

/** Dependencias del exportador local de recuperación. */
export type RecoveryExporterDeps = Readonly<{
  pendingDiagnostics: PendingDiagnosticRegistry;
}>;

/** Entrada de una exportación explícita iniciada por la capa consumidora. */
export type RecoveryExportRequest = Readonly<{
  diagnostic: RecoveryDiagnostic;
  artifact?: RecoveryArtifact;
}>;

/** Construye paquetes descargables sin realizar I/O ni limpiar memoria. */
export class RecoveryExporter {
  private readonly pendingDiagnostics: PendingDiagnosticRegistry;

  public constructor(deps: RecoveryExporterDeps) {
    this.pendingDiagnostics = deps.pendingDiagnostics;
  }

  /** Incluye una foto de todos los diagnósticos que IndexedDB no pudo guardar. */
  public export(request: RecoveryExportRequest): RecoveryExportPackage {
    const pendingDiagnostics = this.pendingDiagnostics
      .list()
      .map(toExportedPendingDiagnostic);
    if (request.artifact === undefined) {
      return createRecoveryExport({
        diagnostic: request.diagnostic,
        pendingDiagnostics,
      });
    }
    return createRecoveryExport({
      diagnostic: request.diagnostic,
      artifact: request.artifact,
      pendingDiagnostics,
    });
  }
}

function toExportedPendingDiagnostic(
  pending: ReturnType<PendingDiagnosticRegistry["list"]>[number],
): ExportedPendingDiagnostic {
  const base = {
    diagnosticId: pending.diagnosticId,
    gameId: pending.gameId,
    phase: pending.phase,
    diagnostic: pending.diagnostic,
  };
  const withSnapshot =
    pending.lastConfirmedSnapshotId === undefined
      ? base
      : {
          ...base,
          lastConfirmedSnapshotId: pending.lastConfirmedSnapshotId,
        };
  return Object.freeze(
    pending.lastConfirmedAt === undefined
      ? withSnapshot
      : { ...withSnapshot, lastConfirmedAt: pending.lastConfirmedAt },
  );
}
