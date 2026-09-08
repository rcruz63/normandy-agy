/**
 * Modelo de aleatoriedad reproducible versionada (diseño §3, Tarea 6.1).
 *
 * Define los tipos concretos `RandomState`, `RandomConsumption`,
 * `RandomRequest`, `RandomStep`, `RandomContext` y `RandomDomain` que la
 * máquina de estado pura {@link VersionedRandom} consume y produce. El diseño
 * no fija formato, longitud ni rango de Semilla: es un valor opaco serializable
 * (`string`) validado por la implementación (requisito 19.2, diseño §3).
 *
 * Frontera: este módulo vive en `domain/` y es puro. No importa DOM, IndexedDB,
 * red, reloj (`Date`) ni SDK de AWS, y NUNCA usa `Math.random` (requisito 19).
 *
 * Nota de cableado: la Tarea 1 declaró marcadores para `RandomState`,
 * `RandomRequest` y `RandomConsumption` en `domain/ports/placeholders.ts`. La
 * sustitución de esos marcadores por estos tipos concretos se hará en una tarea
 * posterior de cableado; aquí se definen y exportan de forma autónoma.
 */
import type { Brand } from "../identity/index.js";
import type { GameId, RandomAlgorithmVersion } from "../identity/index.js";

/** Identificador opaco de un Consumo aleatorio, único dentro de la Partida. */
export type RandomConsumptionId = Brand<string, "RandomConsumptionId">;

/**
 * Dominio solicitado a la fuente aleatoria. El diseño lo referencia sin fijar
 * su forma; se modela como una unión discriminada mínima y suficiente para las
 * resoluciones del juego (tiradas d6/2d6, elección uniforme en un intervalo).
 *
 * - `dice`: `count` dados de `sides` caras cada uno (1..sides), p. ej. 2d6.
 * - `uniform`: un entero uniforme en `[min, max]` inclusive.
 */
export type RandomDomain =
  | Readonly<{ kind: "dice"; sides: number; count: number }>
  | Readonly<{ kind: "uniform"; min: number; max: number }>;

/**
 * Contexto de una petición de aleatoriedad: describe para qué se consume, sin
 * acoplarse al Motor de reglas. `label` es una etiqueta estable y `detail` un
 * mapa inmutable opcional de datos auxiliares (p. ej. actor, tabla).
 */
export type RandomContext = Readonly<{
  label: string;
  detail?: Readonly<Record<string, string>>;
}>;

/**
 * Petición de un paso aleatorio. Incluye la Partida (para derivar el
 * identificador único de Consumo) y el contexto de la resolución.
 */
export type RandomRequest = Readonly<{
  gameId: GameId;
  domain: RandomDomain;
  context: RandomContext;
}>;

/**
 * Estado aleatorio (diseño §3). Contiene la Semilla opaca, la posición de
 * secuencia actual y la Versión del algoritmo aleatorio (requisito 19.2).
 */
export type RandomState = Readonly<{
  seed: string;
  position: number;
  algorithmVersion: RandomAlgorithmVersion;
}>;

/**
 * Consumo aleatorio (diseño §3). Registra la Partida, un identificador único
 * dentro de ella, la posición consecutiva de secuencia, el contexto, el dominio
 * solicitado, el resultado bruto y el resultado interpretado (requisitos 19.3,
 * 19.4).
 */
export type RandomConsumption = Readonly<{
  gameId: GameId;
  id: RandomConsumptionId;
  position: number;
  context: RandomContext;
  requestedDomain: RandomDomain;
  rawResult: readonly number[];
  interpretedResult: unknown;
}>;

/** Resultado de un paso: nuevo Estado aleatorio y Consumo producido. */
export type RandomStep = Readonly<{
  state: RandomState;
  consumption: RandomConsumption;
}>;

/** Error lanzado por la máquina de estado ante entradas inválidas. */
export class RandomError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Aleatoriedad inválida en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "RandomError";
    this.field = field;
    this.rawValue = rawValue;
  }
}
