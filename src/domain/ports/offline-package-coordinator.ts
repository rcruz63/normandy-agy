/**
 * Puerto del coordinador de paquete sin conexión (diseño §7).
 *
 * `stage` descarga y verifica todos los recursos antes de marcar completitud;
 * `activate` cambia el puntero de caché (con confirmación si hay Partida
 * abierta); `rollback` restaura el paquete válido anterior sin borrarlo. La
 * recuperación de red no toca IndexedDB ni datos de Partidas.
 */
import type { PackageVersion } from "../identity/index.js";
import type {
  ActivationResult,
  OfflineAvailability,
  OfflinePackageManifest,
  StagedPackageResult,
} from "./placeholders.js";

export interface OfflinePackageCoordinator {
  inspect(): Promise<OfflineAvailability>;
  stage(manifest: OfflinePackageManifest): Promise<StagedPackageResult>;
  activate(version: PackageVersion): Promise<ActivationResult>;
  rollback(failedVersion: PackageVersion): Promise<void>;
}
