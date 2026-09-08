/**
 * Punto de entrada del submódulo de aleatoriedad reproducible (Tarea 6.1).
 *
 * Reexporta el modelo de tipos y la máquina de estado pura `VersionedRandom`.
 * Módulo puro de `domain/`: sin DOM, IndexedDB, red, reloj ni SDK de AWS, y sin
 * `Math.random`.
 */
export type {
  RandomConsumption,
  RandomConsumptionId,
  RandomContext,
  RandomDomain,
  RandomRequest,
  RandomState,
  RandomStep,
} from "./model.js";
export { RandomError } from "./model.js";
export {
  ALGORITHM_SPLITMIX64_V1,
  PureVersionedRandom,
  initialRandomState,
  pureVersionedRandom,
} from "./versioned-random.js";
