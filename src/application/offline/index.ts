/**
 * Orquestación del Paquete sin conexión y su actualización segura (Tarea 19.2).
 *
 * Punto de entrada del coordinador que implementa el puerto
 * `OfflinePackageCoordinator` (diseño §7) sobre los adaptadores de Cache Storage
 * y descarga y las comprobaciones de arranque inyectadas. Descarga y verifica
 * todo antes de completar (fail-closed), activa con confirmación si hay Partida
 * abierta, restaura `previous` sin borrar ante fallo y limpia cachés solo tras
 * un arranque confirmado, nunca datos de Partidas.
 */
export {
  DefaultOfflinePackageCoordinator,
  PackageNotStagedError,
  ActivationConfirmationRequiredError,
} from "./offline-package-coordinator.js";
export type {
  OfflinePackageCoordinatorDeps,
  OfflinePackageState,
  OfflinePackagePointer,
  OpenGamePolicy,
  OfflineHealthChecker,
  ActivateOptions,
} from "./offline-package-coordinator.js";
