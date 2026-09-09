import { describe, expect, it } from "vitest";
import {
  gameId,
  snapshotId,
} from "../../src/domain/identity/index.js";
import {
  RECOVERY_EXPORT_FORMAT,
  RECOVERY_INTEGRITY_PURPOSE,
} from "../../src/domain/persistence/index.js";
import {
  PendingDiagnosticRegistry,
  RecoveryExporter,
  previousBackupRequiredDiagnostic,
  quarantineWriteFailureDiagnostic,
} from "../../src/application/games/index.js";

describe("RecoveryExporter — exportación local estructurada", () => {
  it("serializa un paquete versionado y declara que la suma no es firma ni cifrado", () => {
    const id = gameId("g-export");
    const diagnostic = previousBackupRequiredDiagnostic("diag-main", id);
    const exporter = new RecoveryExporter({
      pendingDiagnostics: new PendingDiagnosticRegistry(),
    });

    const pkg = exporter.export({ diagnostic });
    const serialized = JSON.parse(new TextDecoder().decode(pkg.bytes)) as {
      format: string;
      integrityPurpose: string;
      diagnostic: { diagnosticId: string };
    };

    expect(pkg.format).toBe(RECOVERY_EXPORT_FORMAT);
    expect(pkg.integrityPurpose).toBe(RECOVERY_INTEGRITY_PURPOSE);
    expect(serialized.format).toBe(RECOVERY_EXPORT_FORMAT);
    expect(serialized.integrityPurpose).toBe(
      "accidental-alteration-detection-only",
    );
    expect(serialized.diagnostic.diagnosticId).toBe("diag-main");
  });

  it("incluye el diagnóstico en memoria una sola vez antes de reintentar", () => {
    const id = gameId("g-pending");
    const lastSnapshotId = snapshotId("snap-compatible");
    const pendingDiagnostics = new PendingDiagnosticRegistry();
    const first = pendingDiagnostics.record({
      diagnosticId: "diag-write-1",
      gameId: id,
      phase: "quarantine-write",
      diagnostic: quarantineWriteFailureDiagnostic("cuota agotada"),
      lastConfirmedSnapshotId: lastSnapshotId,
    });
    const repeated = pendingDiagnostics.record({
      diagnosticId: "diag-write-2",
      gameId: id,
      phase: "quarantine-write",
      diagnostic: quarantineWriteFailureDiagnostic("cuota agotada de nuevo"),
      lastConfirmedSnapshotId: lastSnapshotId,
    });
    const exporter = new RecoveryExporter({ pendingDiagnostics });
    const pkg = exporter.export({
      diagnostic: previousBackupRequiredDiagnostic("diag-main", id),
    });

    expect(repeated).toBe(first);
    expect(pendingDiagnostics.size).toBe(1);
    expect(pkg.pendingDiagnostics).toHaveLength(1);
    expect(pkg.pendingDiagnostics[0]?.diagnosticId).toBe("diag-write-1");
    expect(pkg.pendingDiagnostics[0]?.lastConfirmedSnapshotId).toBe(
      lastSnapshotId,
    );
  });
});
