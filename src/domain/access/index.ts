/**
 * Punto de entrada del submódulo de Control de acceso local del dominio
 * (Tarea 23.2).
 *
 * Reexporta el Verificador local puro (derivación/comparación versionada, no
 * recuperable) y la máquina de estado pura del Bloqueo local. Módulo PURO de
 * `domain/`: sin DOM, IndexedDB, red, reloj ni `crypto.subtle`, y sin
 * `Math.random`. La persistencia del material vive en `adapters/browser/`; el
 * bloqueo/mensajería de la Interfaz, en `ui/`.
 */
export {
  LOCAL_VERIFIER_ALGORITHM_V1,
  LOCAL_VERIFIER_ITERATIONS_V1,
  LocalVerifierError,
  constantTimeEquals,
  createLocalVerifierMaterial,
  deriveLocalDigest,
  localVerifierAlgorithmVersion,
  verifyLocalCredential,
} from "./local-verifier.js";
export type {
  LocalCredential,
  LocalVerifierAlgorithmVersion,
  LocalVerifierMaterial,
} from "./local-verifier.js";

export {
  attemptUnlock,
  evaluateStartupLock,
  projectLockView,
} from "./local-lock.js";
export type {
  LocalLockStartup,
  LocalLockStatus,
  LocalLockView,
  LocalUnlockResult,
} from "./local-lock.js";
