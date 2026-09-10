/**
 * Punto de entrada del Control de acceso de despliegue (Tarea 23.1).
 *
 * Reexporta el algoritmo verificador versionado y el `AccessVerifierRenderer`
 * que genera la CloudFront Function `viewer-request`. Módulo de
 * `infrastructure/`: la PWA no lo importa y no contiene secretos.
 */
export {
  ACCESS_VERIFIER_ALGORITHM_V1,
  ACCESS_VERIFIER_ITERATIONS_V1,
  constantTimeEquals,
  deriveAccessDigest,
} from "./verifier-algorithm.js";
export type { AccessVerifierAlgorithmVersion } from "./verifier-algorithm.js";

export {
  ACCESS_REALM,
  AccessRenderError,
  AccessVerifierRenderer,
  renderFunctionCode,
} from "./access-verifier-renderer.js";
export type {
  AccessCredential,
  AccessVerifierMaterial,
  RenderedAccessFunction,
} from "./access-verifier-renderer.js";
