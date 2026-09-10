/**
 * Algoritmo de verificación versionado y AUTÓNOMO del Control de acceso
 * (Tarea 23.1, requisitos 26.2, 26.3).
 *
 * El diseño (§10) NO fija el algoritmo criptográfico concreto: exige que sea
 * compatible con el runtime 2.0 de CloudFront Functions, que quede versionado
 * (`algorithmVersion`) y que produzca material verificador NO recuperable. El
 * runtime 2.0 no expone `crypto.subtle`/Web Crypto ni red ni variables de
 * entorno, por lo que aquí se define una derivación AUTÓNOMA en JavaScript puro
 * que puede ejecutarse idénticamente:
 *
 * - en el proceso de despliegue (Node), para calcular el digest de la
 *   credencial configurada, y
 * - dentro de la propia CloudFront Function, para recalcular el digest de la
 *   credencial entrante y compararlo en tiempo constante.
 *
 * IMPORTANTE sobre las garantías: esta derivación NO es una primitiva
 * criptográfica revisada. Es un marcador versionado y no recuperable a la
 * espera de la revisión de seguridad exigida por el diseño; la propiedad de
 * "no recuperable" se apoya en un digest de tamaño fijo con sal e iteraciones.
 * Cuando la revisión apruebe una primitiva concreta compatible con runtime 2.0,
 * se registra bajo un NUEVO `algorithmVersion` sin reescribir este.
 *
 * FRONTERA DE CAPAS: este módulo pertenece a `infrastructure/` (código de
 * despliegue). La PWA NUNCA lo importa. No contiene secretos: recibe la
 * credencial por parámetro y devuelve solo material derivado.
 */

/** Versión del algoritmo verificador del Control de acceso (viewer-request). */
export const ACCESS_VERIFIER_ALGORITHM_V1 = "access-verifier-v1" as const;

/** Tipo de las versiones de algoritmo verificador reconocidas. */
export type AccessVerifierAlgorithmVersion =
  typeof ACCESS_VERIFIER_ALGORITHM_V1;

/** Número de iteraciones de mezcla de la versión 1 (endurece la derivación). */
export const ACCESS_VERIFIER_ITERATIONS_V1 = 4096 as const;

/**
 * Número de palabras de 32 bits del digest (256 bits). Un digest de tamaño
 * fijo impide reconstruir la credencial a partir del material verificador.
 */
const DIGEST_WORDS = 8 as const;

const MASK32 = 0xffffffff;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Suma módulo 2^32 evitando el desbordamiento de enteros de JavaScript. */
function add32(a: number, b: number): number {
  return (a + b) & MASK32;
}

/** Multiplicación módulo 2^32 estable en runtime 2.0 (usa `Math.imul`). */
function mul32(a: number, b: number): number {
  return Math.imul(a, b) & MASK32;
}

/** Rotación a la izquierda de 32 bits. */
function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) & MASK32;
}

/**
 * Convierte una cadena a bytes UTF-8 sin depender de `TextEncoder` (no está
 * garantizado en runtime 2.0). Cubre el rango BMP y pares subrogados.
 */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < text.length) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      }
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * Deriva un digest hexadecimal de 256 bits a partir de una `sal` y una
 * `credencial` (habitualmente `usuario + ":" + clave`) mediante mezcla iterada
 * autónoma. Función pura y determinista: la misma entrada produce el mismo
 * digest en Node y en runtime 2.0.
 *
 * No es reversible: el digest tiene tamaño fijo (256 bits) frente a una entrada
 * de longitud arbitraria, por lo que no permite recuperar la credencial.
 */
export function deriveAccessDigest(
  algorithmVersion: AccessVerifierAlgorithmVersion,
  salt: string,
  credential: string,
): string {
  if (algorithmVersion !== ACCESS_VERIFIER_ALGORITHM_V1) {
    throw new Error(`Versión de verificador no soportada: ${algorithmVersion}.`);
  }
  const bytes = utf8Bytes(`${salt}\u0000${credential}`);
  const state: number[] = new Array<number>(DIGEST_WORDS);
  for (let word = 0; word < DIGEST_WORDS; word += 1) {
    // Semillas distintas por palabra a partir del FNV offset basis.
    state[word] = (FNV_OFFSET_BASIS ^ mul32(word + 1, FNV_PRIME)) & MASK32;
  }
  for (
    let iteration = 0;
    iteration < ACCESS_VERIFIER_ITERATIONS_V1;
    iteration += 1
  ) {
    for (let position = 0; position < bytes.length; position += 1) {
      const byte = bytes[position] as number;
      const word = position % DIGEST_WORDS;
      let mixed = state[word] as number;
      mixed = mul32(mixed ^ byte, FNV_PRIME);
      mixed = rotl32(mixed, 7 + (iteration & 0x0f));
      mixed = add32(mixed, iteration + 1);
      state[word] = mixed;
    }
    // Difusión entre palabras para que cada byte afecte a todo el digest.
    for (let word = 0; word < DIGEST_WORDS; word += 1) {
      const previous = state[(word + DIGEST_WORDS - 1) % DIGEST_WORDS] as number;
      state[word] = mul32((state[word] as number) ^ rotl32(previous, 13), FNV_PRIME);
    }
  }
  let hex = "";
  for (let word = 0; word < DIGEST_WORDS; word += 1) {
    hex += ((state[word] as number) >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/**
 * Compara dos digests hexadecimales en TIEMPO CONSTANTE respecto a su
 * contenido: recorre siempre la longitud completa y acumula diferencias sin
 * cortocircuito. Devuelve `false` de inmediato solo ante longitudes distintas,
 * lo que no revela información del secreto (el largo del digest es público y
 * fijo).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
