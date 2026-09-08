/**
 * PRNG determinista autónomo basado en contador (estilo SplitMix64), Tarea 6.1.
 *
 * Se implementa con `BigInt` para aritmética de 64 bits reproducible en todo
 * Entorno probado. Es una función pura: dada la misma Semilla numérica y la
 * misma posición produce siempre el mismo bloque de 64 bits. NUNCA usa
 * `Math.random` (requisito 19).
 *
 * La secuencia es contable por posición: el valor en la posición `n` no depende
 * de haber recorrido las posiciones anteriores, lo que permite reanudar desde
 * cualquier posición guardada sin repetir ni omitir (requisito 19.7, base de la
 * continuidad tras reanudación).
 *
 * Frontera: módulo puro de `domain/`. No importa DOM, IndexedDB, red, reloj ni
 * SDK de AWS.
 */

const MASK64 = (1n << 64n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15n; // constante de oro de SplitMix64
const MIX1 = 0xbf58476d1ce4e5b9n;
const MIX2 = 0x94d049bb133111ebn;

/** Mezcla final de SplitMix64 sobre un valor de 64 bits. */
function mix64(value: bigint): bigint {
  let z = value & MASK64;
  z = ((z ^ (z >> 30n)) * MIX1) & MASK64;
  z = ((z ^ (z >> 27n)) * MIX2) & MASK64;
  z = z ^ (z >> 31n);
  return z & MASK64;
}

/**
 * Devuelve el bloque de 64 bits (como `bigint` sin signo) para una Semilla y
 * una posición dadas. Contador puro: `block(seed, n)` es independiente de
 * `block(seed, n-1)`.
 */
export function block64(seed: bigint, position: number): bigint {
  const counter = (seed + BigInt(position + 1) * GAMMA) & MASK64;
  return mix64(counter);
}

/**
 * Extrae un entero uniforme en `[0, boundExclusive)` a partir del bloque de la
 * posición `position`, usando rechazo por lotes de bloques consecutivos para
 * evitar sesgo de módulo. Devuelve el valor y cuántas posiciones consumió.
 *
 * `boundExclusive` debe ser un entero positivo y caber holgadamente en los 64
 * bits disponibles.
 */
export function uniformFromBlocks(
  seed: bigint,
  position: number,
  boundExclusive: bigint,
): Readonly<{ value: bigint; consumed: number }> {
  // Umbral de rechazo: mayor múltiplo de bound que cabe en 2^64.
  const limit = (MASK64 + 1n) - ((MASK64 + 1n) % boundExclusive);
  let offset = 0;
  // Cota de seguridad muy amplia; el rechazo termina con probabilidad 1.
  for (; offset < 1_000_000; offset += 1) {
    const candidate = block64(seed, position + offset);
    if (candidate < limit) {
      return { value: candidate % boundExclusive, consumed: offset + 1 };
    }
  }
  // Inalcanzable en la práctica; se conserva determinismo devolviendo el módulo.
  return {
    value: block64(seed, position) % boundExclusive,
    consumed: 1,
  };
}
