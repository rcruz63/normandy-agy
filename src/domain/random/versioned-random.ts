/**
 * `VersionedRandom` como máquina de estado pura (Tarea 6.1, diseño §3).
 *
 * `next(state, request)` es una transición determinista: la misma pareja
 * `(state, request)` produce siempre el mismo {@link RandomStep}. El Consumo
 * lleva un identificador único dentro de la Partida y la siguiente posición
 * consecutiva de secuencia (requisitos 19.3, 19.5).
 *
 * El registro de algoritmos es INMUTABLE: un mismo `algorithmVersion` nunca
 * cambia de procedimiento. Una versión nueva usa otro identificador y se añade
 * al registro sin alterar las existentes. `supports()` refleja el registro
 * (requisito 19.11).
 *
 * Frontera: módulo puro de `domain/`. No importa DOM, IndexedDB, red, reloj
 * (`Date`) ni SDK de AWS, y NUNCA usa `Math.random` (requisito 19).
 */
import type { RandomAlgorithmVersion } from "../identity/index.js";
import { randomAlgorithmVersion } from "../identity/index.js";
import type {
  RandomConsumption,
  RandomConsumptionId,
  RandomDomain,
  RandomRequest,
  RandomState,
  RandomStep,
} from "./model.js";
import { RandomError } from "./model.js";
import { uniformFromBlocks } from "./prng.js";

/** Versión del algoritmo de la primera implementación de referencia. */
export const ALGORITHM_SPLITMIX64_V1 = randomAlgorithmVersion(
  "splitmix64-v1",
);

/**
 * Procedimiento inmutable asociado a una Versión de algoritmo. Fija cómo se
 * valida la Semilla y cómo se resuelve un dominio en resultado bruto e
 * interpretado, avanzando la posición de secuencia.
 */
type AlgorithmProcedure = Readonly<{
  version: RandomAlgorithmVersion;
  parseSeed(seed: string): bigint;
  resolve(
    seed: bigint,
    position: number,
    domain: RandomDomain,
  ): Readonly<{
    rawResult: readonly number[];
    interpretedResult: unknown;
    nextPosition: number;
  }>;
}>;

/** Valida un dominio y devuelve su cota superior exclusiva de muestreo. */
function assertDomain(domain: RandomDomain): void {
  if (domain.kind === "dice") {
    if (
      !Number.isInteger(domain.sides) ||
      domain.sides < 1 ||
      !Number.isInteger(domain.count) ||
      domain.count < 1
    ) {
      throw new RandomError("domain", domain, "dados con sides>=1 y count>=1");
    }
  } else {
    if (
      !Number.isInteger(domain.min) ||
      !Number.isInteger(domain.max) ||
      domain.max < domain.min
    ) {
      throw new RandomError(
        "domain",
        domain,
        "uniforme con min<=max enteros",
      );
    }
  }
}

/**
 * Contrato estructural de la máquina de aleatoriedad versionada con los tipos
 * CONCRETOS del submódulo (`RandomState`/`RandomRequest`/`RandomStep`).
 *
 * El puerto `domain/ports/versioned-random.ts` declara `VersionedRandom` con
 * marcas opacas provisionales (Tarea 1); mientras ese cableado no sustituya los
 * marcadores por estos tipos concretos, los consumidores de la capa de
 * aplicación que necesitan los datos reales (p. ej. el Coordinador de Tiradas,
 * Tarea 20.1) dependen de ESTA interfaz. {@link PureVersionedRandom} la cumple.
 */
export interface VersionedRandomMachine {
  next(state: RandomState, request: RandomRequest): RandomStep;
  supports(algorithmVersion: RandomAlgorithmVersion): boolean;
}

/** Procedimiento de la versión de referencia `splitmix64-v1`. */
const SPLITMIX64_V1: AlgorithmProcedure = Object.freeze({
  version: ALGORITHM_SPLITMIX64_V1,
  parseSeed(seed: string): bigint {
    if (typeof seed !== "string" || seed.trim().length === 0) {
      throw new RandomError("seed", seed, "no puede estar vacía");
    }
    // Semilla opaca: se deriva de forma estable a un entero de 64 bits mezclando
    // los puntos de código. El formato exacto no está fijado por el diseño.
    let acc = 0xcbf29ce484222325n; // base FNV de 64 bits
    for (const ch of seed) {
      const cp = BigInt(ch.codePointAt(0) ?? 0);
      acc = ((acc ^ cp) * 0x100000001b3n) & ((1n << 64n) - 1n);
    }
    return acc;
  },
  resolve(seed, position, domain) {
    assertDomain(domain);
    if (domain.kind === "dice") {
      const bound = BigInt(domain.sides);
      const raw: number[] = [];
      let pos = position;
      for (let i = 0; i < domain.count; i += 1) {
        const draw = uniformFromBlocks(seed, pos, bound);
        raw.push(Number(draw.value) + 1); // caras 1..sides
        pos += draw.consumed;
      }
      const interpreted = raw.reduce((sum, face) => sum + face, 0);
      return { rawResult: raw, interpretedResult: interpreted, nextPosition: pos };
    }
    const span = BigInt(domain.max - domain.min + 1);
    const draw = uniformFromBlocks(seed, position, span);
    const value = Number(draw.value) + domain.min;
    return {
      rawResult: [value],
      interpretedResult: value,
      nextPosition: position + draw.consumed,
    };
  },
});

/**
 * Registro inmutable de procedimientos por Versión de algoritmo. Añadir una
 * versión nueva significa añadir una entrada con OTRO identificador; jamás
 * reasignar el procedimiento de una entrada existente (requisito 19.11).
 */
const REGISTRY: ReadonlyMap<string, AlgorithmProcedure> = new Map([
  [ALGORITHM_SPLITMIX64_V1 as string, SPLITMIX64_V1],
]);

/** Deriva el identificador único de Consumo dentro de la Partida. */
function consumptionId(
  state: RandomState,
  gameId: string,
  position: number,
): RandomConsumptionId {
  // Único dentro de la Partida: combina gameId, versión, semilla y posición.
  // La posición es estrictamente creciente por Partida, garantizando unicidad.
  return `${gameId}:${state.algorithmVersion as string}:${state.position}->${position}` as RandomConsumptionId;
}

/**
 * Implementación pura de {@link VersionedRandom} respaldada por el registro
 * inmutable de algoritmos.
 */
export class PureVersionedRandom implements VersionedRandomMachine {
  public supports(algorithmVersion: RandomAlgorithmVersion): boolean {
    return REGISTRY.has(algorithmVersion as string);
  }

  public next(state: RandomState, request: RandomRequest): RandomStep {
    const procedure = REGISTRY.get(state.algorithmVersion as string);
    if (procedure === undefined) {
      throw new RandomError(
        "algorithmVersion",
        state.algorithmVersion,
        "versión no soportada por el registro",
      );
    }
    if (!Number.isInteger(state.position) || state.position < 0) {
      throw new RandomError(
        "position",
        state.position,
        "debe ser un entero no negativo",
      );
    }

    const seed = procedure.parseSeed(state.seed);
    const resolved = procedure.resolve(seed, state.position, request.domain);

    const consumption: RandomConsumption = Object.freeze({
      gameId: request.gameId,
      id: consumptionId(state, request.gameId as string, resolved.nextPosition),
      position: resolved.nextPosition,
      context: request.context,
      requestedDomain: request.domain,
      rawResult: Object.freeze([...resolved.rawResult]),
      interpretedResult: resolved.interpretedResult,
    });

    const nextState: RandomState = Object.freeze({
      seed: state.seed,
      position: resolved.nextPosition,
      algorithmVersion: state.algorithmVersion,
    });

    return Object.freeze({ state: nextState, consumption });
  }
}

/** Instancia compartida sin estado interno mutable. */
export const pureVersionedRandom = new PureVersionedRandom();

/**
 * Construye un Estado aleatorio inicial validando la Versión de algoritmo y la
 * Semilla contra el procedimiento del registro. Posición inicial en 0.
 */
export function initialRandomState(
  seed: string,
  algorithmVersion: RandomAlgorithmVersion = ALGORITHM_SPLITMIX64_V1,
): RandomState {
  const procedure = REGISTRY.get(algorithmVersion as string);
  if (procedure === undefined) {
    throw new RandomError(
      "algorithmVersion",
      algorithmVersion,
      "versión no soportada por el registro",
    );
  }
  procedure.parseSeed(seed); // valida la Semilla opaca
  return Object.freeze({ seed, position: 0, algorithmVersion });
}
