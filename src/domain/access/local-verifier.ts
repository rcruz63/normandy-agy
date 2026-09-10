/**
 * Verificador local puro del Bloqueo local (Tarea 23.2, requisitos 26.10–26.12,
 * diseño §10).
 *
 * El Bloqueo local usa la MISMA credencial (usuario + clave) que el Control de
 * acceso en línea, pero un verificador INDEPENDIENTE con su propio
 * `algorithmVersion`, parámetros, sal y material verificador. Este módulo
 * contiene ÚNICAMENTE la derivación y comparación puras: dado usuario, clave,
 * sal y parámetros produce un digest de tamaño fijo y compara en tiempo
 * constante. NO almacena la clave ni una representación recuperable (26.12): el
 * digest es de longitud fija frente a una entrada arbitraria y por tanto no
 * reversible.
 *
 * INDEPENDENCIA del Control de acceso: el algoritmo, la sal y los parámetros son
 * distintos de los del `AccessVerifierRenderer`. Comprometer o inspeccionar uno
 * no revela el otro; ambos derivan de la misma credencial pero producen material
 * no intercambiable.
 *
 * FRONTERA DE CAPAS: módulo PURO de `domain/`. No importa DOM, IndexedDB, red,
 * reloj ni `crypto.subtle` del navegador, y nunca usa `Math.random`. La
 * persistencia del material vive en `adapters/browser/`; el bloqueo/mensajería
 * de la Interfaz, en `ui/`.
 */
import type { Brand } from "../identity/index.js";

/** Versión del algoritmo del Verificador local (independiente del de acceso). */
export const LOCAL_VERIFIER_ALGORITHM_V1 = "local-lock-verifier-v1" as const;

/** Tipo opaco de las versiones de algoritmo del Verificador local. */
export type LocalVerifierAlgorithmVersion = Brand<
  string,
  "LocalVerifierAlgorithmVersion"
>;

/** Iteraciones de mezcla de la versión 1 del Verificador local. */
export const LOCAL_VERIFIER_ITERATIONS_V1 = 6144 as const;

/** Palabras de 32 bits del digest (256 bits): tamaño fijo, no recuperable. */
const DIGEST_WORDS = 8 as const;

const MASK32 = 0xffffffff;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
// Constante distinta de la del Control de acceso para reforzar la independencia
// de dominios de derivación con la misma credencial.
const LOCAL_DOMAIN_TAG = 0x5f3759df;

function add32(a: number, b: number): number {
  return (a + b) & MASK32;
}

function mul32(a: number, b: number): number {
  return Math.imul(a, b) & MASK32;
}

function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) & MASK32;
}

/** Codifica una cadena a bytes UTF-8 sin depender de `TextEncoder`. */
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
 * Material verificador local, versionado y NO recuperable. Se persiste (en
 * `adapters/browser/`, no aquí) para poder verificar la credencial sin
 * conservarla. No contiene la clave ni el usuario en claro.
 */
export type LocalVerifierMaterial = Readonly<{
  algorithmVersion: LocalVerifierAlgorithmVersion;
  salt: string;
  iterations: number;
  digest: string;
}>;

/** Credencial introducida por el Propietario para inicializar/verificar. */
export type LocalCredential = Readonly<{
  username: string;
  key: string;
}>;

/** Error del Verificador local ante entradas inválidas (sin exponer secretos). */
export class LocalVerifierError extends Error {
  public readonly field: string;

  public constructor(field: string, detail: string) {
    super(`Verificador local inválido en «${field}»: ${detail}.`);
    this.name = "LocalVerifierError";
    this.field = field;
  }
}

/** Construye una {@link LocalVerifierAlgorithmVersion} validando no vacío. */
export function localVerifierAlgorithmVersion(
  value: string,
): LocalVerifierAlgorithmVersion {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LocalVerifierError("algorithmVersion", "no puede estar vacío");
  }
  return value as LocalVerifierAlgorithmVersion;
}

function assertSupported(algorithmVersion: LocalVerifierAlgorithmVersion): void {
  if ((algorithmVersion as unknown as string) !== LOCAL_VERIFIER_ALGORITHM_V1) {
    throw new LocalVerifierError(
      "algorithmVersion",
      `versión no soportada: ${algorithmVersion as unknown as string}`,
    );
  }
}

function assertCredential(credential: LocalCredential): void {
  if (
    typeof credential.username !== "string" ||
    credential.username.trim().length === 0
  ) {
    throw new LocalVerifierError("username", "el usuario no puede estar vacío");
  }
  if (typeof credential.key !== "string" || credential.key.length === 0) {
    throw new LocalVerifierError("key", "la clave no puede estar vacía");
  }
}

function assertSalt(salt: string): void {
  if (typeof salt !== "string" || salt.length < 16) {
    throw new LocalVerifierError(
      "salt",
      "la sal debe aportar al menos 16 caracteres de entropía",
    );
  }
}

/**
 * Deriva un digest hexadecimal de 256 bits de la credencial con la sal y las
 * iteraciones dadas. Función PURA y determinista. No reversible: entrada
 * arbitraria → digest de tamaño fijo.
 */
export function deriveLocalDigest(
  algorithmVersion: LocalVerifierAlgorithmVersion,
  salt: string,
  credential: LocalCredential,
): string {
  assertSupported(algorithmVersion);
  assertSalt(salt);
  assertCredential(credential);
  const bytes = utf8Bytes(`${salt}\u0000${credential.username}:${credential.key}`);
  const state: number[] = new Array<number>(DIGEST_WORDS);
  for (let word = 0; word < DIGEST_WORDS; word += 1) {
    state[word] =
      (FNV_OFFSET_BASIS ^ mul32(word + 1, FNV_PRIME) ^ LOCAL_DOMAIN_TAG) & MASK32;
  }
  for (
    let iteration = 0;
    iteration < LOCAL_VERIFIER_ITERATIONS_V1;
    iteration += 1
  ) {
    for (let position = 0; position < bytes.length; position += 1) {
      const byte = bytes[position] as number;
      const word = position % DIGEST_WORDS;
      let mixed = state[word] as number;
      mixed = mul32(mixed ^ byte, FNV_PRIME);
      mixed = rotl32(mixed, 5 + (iteration & 0x0f));
      mixed = add32(mixed, iteration + 1);
      state[word] = mixed;
    }
    for (let word = 0; word < DIGEST_WORDS; word += 1) {
      const previous = state[(word + DIGEST_WORDS - 1) % DIGEST_WORDS] as number;
      state[word] = mul32(
        (state[word] as number) ^ rotl32(previous, 11),
        FNV_PRIME,
      );
    }
  }
  let hex = "";
  for (let word = 0; word < DIGEST_WORDS; word += 1) {
    hex += ((state[word] as number) >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/**
 * Crea el material verificador local para una credencial y una sal. La
 * credencial se consume aquí; el material resultante no permite recuperarla.
 */
export function createLocalVerifierMaterial(
  salt: string,
  credential: LocalCredential,
  algorithmVersion: LocalVerifierAlgorithmVersion = LOCAL_VERIFIER_ALGORITHM_V1 as LocalVerifierAlgorithmVersion,
): LocalVerifierMaterial {
  const digest = deriveLocalDigest(algorithmVersion, salt, credential);
  return Object.freeze({
    algorithmVersion,
    salt,
    iterations: LOCAL_VERIFIER_ITERATIONS_V1,
    digest,
  });
}

/**
 * Compara dos digests en TIEMPO CONSTANTE respecto a su contenido: recorre la
 * longitud completa sin cortocircuito. La longitud del digest es pública y fija.
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

/**
 * Verifica una credencial contra el material previamente creado. Devuelve
 * `true` solo si la derivación coincide en tiempo constante. Función pura: no
 * muta el material ni conserva la credencial.
 */
export function verifyLocalCredential(
  material: LocalVerifierMaterial,
  credential: LocalCredential,
): boolean {
  const candidate = deriveLocalDigest(
    material.algorithmVersion,
    material.salt,
    credential,
  );
  return constantTimeEquals(candidate, material.digest);
}
