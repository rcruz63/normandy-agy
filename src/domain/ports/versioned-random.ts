/**
 * Puerto de aleatoriedad reproducible versionada (diseño §3).
 *
 * `VersionedRandom` es una máquina de estado pura. La Semilla es un valor opaco
 * serializable validado por la implementación; el diseño no fija su formato,
 * longitud ni rango. El registro de implementaciones es inmutable: un mismo
 * `algorithmVersion` nunca cambia de procedimiento. Nunca se usa `Math.random`.
 */
import type { RandomAlgorithmVersion } from "../identity/index.js";
import type { RandomConsumption, RandomRequest, RandomState } from "./placeholders.js";

export type RandomStep = Readonly<{
  state: RandomState;
  consumption: RandomConsumption;
}>;

export interface VersionedRandom {
  next(state: RandomState, request: RandomRequest): RandomStep;
  supports(algorithmVersion: RandomAlgorithmVersion): boolean;
}
