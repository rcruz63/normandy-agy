/**
 * `AccessVerifierRenderer`: generador de la CloudFront Function `viewer-request`
 * del Control de acceso (Tarea 23.1, requisitos 26.1–26.9, diseño §10).
 *
 * Se ejecuta EXCLUSIVAMENTE durante el despliegue. Recibe el único nombre de
 * usuario configurable (26.1) y la clave de alta entropía (26.2) por un canal
 * protegido y EFÍMERO (parámetros de construcción; nunca se leen de disco ni de
 * variables persistentes). A partir de ellos:
 *
 * 1. deriva material verificador VERSIONADO y NO recuperable (digest de tamaño
 *    fijo con sal, {@link deriveAccessDigest}); la clave nunca se conserva;
 * 2. genera el CÓDIGO fuente de una CloudFront Function compatible con el
 *    runtime 2.0 (sin variables de entorno, sin red, sin `crypto.subtle`) que
 *    incrusta únicamente `algorithmVersion`, `salt`, iteraciones y el digest;
 * 3. NUNCA imprime, persiste en archivos del repositorio, sube a S3 ni incorpora
 *    al bundle el usuario, la clave o la cabecera `Authorization` (26.6–26.7).
 *
 * La función generada, en cada solicitud del visor (26.3, 26.5):
 * - exige EXACTAMENTE una cabecera HTTP Basic válida para la combinación
 *   configurada;
 * - deriva y compara mediante el verificador versionado en tiempo constante;
 * - ante ausencia o discrepancia devuelve `401` + `WWW-Authenticate` +
 *   `Cache-Control: no-store` SIN acceder al origen (26.4);
 * - ante éxito ELIMINA la cabecera sensible `Authorization` antes de continuar;
 * - no escribe logs ni incluye valores sensibles en errores.
 *
 * El cambio o recuperación de credencial exige regenerar y redesplegar la
 * función (26.8); no existe flujo de recuperación en la PWA (26.9).
 *
 * FRONTERA DE CAPAS: módulo de `infrastructure/` (despliegue). La PWA no lo
 * importa. No produce artefactos con secretos: devuelve solo el código de la
 * función (que contiene material derivado no recuperable) y metadatos públicos.
 */
import {
  ACCESS_VERIFIER_ALGORITHM_V1,
  ACCESS_VERIFIER_ITERATIONS_V1,
  type AccessVerifierAlgorithmVersion,
  deriveAccessDigest,
} from "./verifier-algorithm.js";

/** Ámbito (`realm`) anunciado en el desafío HTTP Basic. Valor no sensible. */
export const ACCESS_REALM = "Fields of Normandy" as const;

/**
 * Credencial de despliegue efímera. El único usuario configurable (26.1) y la
 * clave de alta entropía (26.2). Se recibe por parámetro y NO se conserva más
 * allá del cálculo del digest.
 */
export type AccessCredential = Readonly<{
  username: string;
  key: string;
}>;

/**
 * Material verificador versionado y NO recuperable que se incrusta en la
 * función generada. No contiene la clave ni el usuario en claro utilizables
 * para autenticarse: solo la sal, la versión, las iteraciones y el digest.
 */
export type AccessVerifierMaterial = Readonly<{
  algorithmVersion: AccessVerifierAlgorithmVersion;
  salt: string;
  iterations: number;
  /** Digest hexadecimal de la combinación `usuario:clave`. */
  digest: string;
}>;

/**
 * Resultado de renderizar la función de acceso: el CÓDIGO fuente listo para
 * asociar al evento `viewer-request` y el material verificador incrustado
 * (público, no recuperable). No incluye la credencial en claro.
 */
export type RenderedAccessFunction = Readonly<{
  algorithmVersion: AccessVerifierAlgorithmVersion;
  code: string;
  material: AccessVerifierMaterial;
}>;

/** Error del renderer ante entradas inválidas (sin exponer valores sensibles). */
export class AccessRenderError extends Error {
  public readonly field: string;

  public constructor(field: string, detail: string) {
    super(`Renderizado de acceso inválido en «${field}»: ${detail}.`);
    this.name = "AccessRenderError";
    this.field = field;
  }
}

function assertUsername(username: string): void {
  if (typeof username !== "string" || username.trim().length === 0) {
    throw new AccessRenderError("username", "el usuario no puede estar vacío");
  }
  if (username.includes(":")) {
    // HTTP Basic separa usuario y clave con ':'; el usuario no puede contenerlo.
    throw new AccessRenderError("username", "el usuario no puede contener ':'");
  }
}

function assertKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new AccessRenderError("key", "la clave no puede estar vacía");
  }
}

function assertSalt(salt: string): void {
  if (typeof salt !== "string" || salt.length < 16) {
    throw new AccessRenderError(
      "salt",
      "la sal debe aportar al menos 16 caracteres de entropía",
    );
  }
}

/**
 * `AccessVerifierRenderer`. Recibe la sal por construcción (el proceso de
 * despliegue la genera con una fuente criptográfica) y expone la generación de
 * la función. No almacena la credencial: se pasa por método y solo se usa para
 * derivar el digest.
 */
export class AccessVerifierRenderer {
  private readonly algorithmVersion: AccessVerifierAlgorithmVersion;
  private readonly salt: string;
  private readonly iterations: number;

  public constructor(
    salt: string,
    algorithmVersion: AccessVerifierAlgorithmVersion = ACCESS_VERIFIER_ALGORITHM_V1,
  ) {
    assertSalt(salt);
    this.salt = salt;
    this.algorithmVersion = algorithmVersion;
    this.iterations = ACCESS_VERIFIER_ITERATIONS_V1;
  }

  /**
   * Deriva el material verificador (no recuperable) para la credencial dada.
   * La credencial se consume aquí y no se conserva. El resultado no contiene la
   * clave ni permite recuperarla.
   */
  public deriveMaterial(credential: AccessCredential): AccessVerifierMaterial {
    assertUsername(credential.username);
    assertKey(credential.key);
    const digest = deriveAccessDigest(
      this.algorithmVersion,
      this.salt,
      `${credential.username}:${credential.key}`,
    );
    return Object.freeze({
      algorithmVersion: this.algorithmVersion,
      salt: this.salt,
      iterations: this.iterations,
      digest,
    });
  }

  /**
   * Genera la CloudFront Function `viewer-request` para la credencial dada.
   * Deriva el material y produce el código que lo incrusta. La credencial NO
   * aparece en el código: solo el material versionado no recuperable.
   */
  public render(credential: AccessCredential): RenderedAccessFunction {
    const material = this.deriveMaterial(credential);
    const code = renderFunctionCode(material);
    return Object.freeze({
      algorithmVersion: this.algorithmVersion,
      code,
      material,
    });
  }
}

/**
 * Emite el código fuente (runtime 2.0) de la función `viewer-request`. El
 * cuerpo inlinea la MISMA derivación y comparación en tiempo constante que usa
 * el despliegue (garantizando equivalencia) y solo incrusta material público.
 */
export function renderFunctionCode(material: AccessVerifierMaterial): string {
  const injected = JSON.stringify({
    algorithmVersion: material.algorithmVersion,
    salt: material.salt,
    iterations: material.iterations,
    digest: material.digest,
    realm: ACCESS_REALM,
  });
  // NOTA: el runtime 2.0 admite `let`/`const`, `Math.imul` y ausencia de
  // variables de entorno/red. El cuerpo no emite logs (`console`) ni incluye la
  // credencial. `VERIFIER` contiene solo material no recuperable.
  return `// CloudFront Functions runtime 2.0 — Control de acceso HTTP Basic.
// Generado por AccessVerifierRenderer (Tarea 23.1). NO contiene la credencial:
// solo material verificador versionado y no recuperable.
var VERIFIER = ${injected};

function add32(a, b) { return (a + b) & 0xffffffff; }
function mul32(a, b) { return Math.imul(a, b) & 0xffffffff; }
function rotl32(v, b) { return ((v << b) | (v >>> (32 - b))) & 0xffffffff; }

function utf8Bytes(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i += 1) {
    var cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      var low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (cp < 0x80) { bytes.push(cp); }
    else if (cp < 0x800) { bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); }
    else if (cp < 0x10000) { bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
    else { bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
  }
  return bytes;
}

function deriveDigest(salt, credential, iterations) {
  var bytes = utf8Bytes(salt + "\\u0000" + credential);
  var state = new Array(8);
  for (var w = 0; w < 8; w += 1) { state[w] = (0x811c9dc5 ^ mul32(w + 1, 0x01000193)) & 0xffffffff; }
  for (var it = 0; it < iterations; it += 1) {
    for (var p = 0; p < bytes.length; p += 1) {
      var word = p % 8;
      var m = state[word];
      m = mul32(m ^ bytes[p], 0x01000193);
      m = rotl32(m, 7 + (it & 0x0f));
      m = add32(m, it + 1);
      state[word] = m;
    }
    for (var w2 = 0; w2 < 8; w2 += 1) {
      var prev = state[(w2 + 7) % 8];
      state[w2] = mul32(state[w2] ^ rotl32(prev, 13), 0x01000193);
    }
  }
  var hex = "";
  for (var k = 0; k < 8; k += 1) { hex += (state[k] >>> 0).toString(16).padStart(8, "0"); }
  return hex;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) { return false; }
  var diff = 0;
  for (var i = 0; i < a.length; i += 1) { diff |= a.charCodeAt(i) ^ b.charCodeAt(i); }
  return diff === 0;
}

function unauthorized() {
  return {
    statusCode: 401,
    statusDescription: "Unauthorized",
    headers: {
      "www-authenticate": { value: 'Basic realm="' + VERIFIER.realm + '", charset="UTF-8"' },
      "cache-control": { value: "no-store" }
    }
  };
}

function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var auth = headers.authorization;
  if (!auth || !auth.value) { return unauthorized(); }

  var parts = auth.value.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "basic") { return unauthorized(); }

  var decoded;
  try {
    var bytes = String.bytesFrom(parts[1], "base64");
    decoded = bytes.toString("utf-8");
  } catch (_error) {
    return unauthorized();
  }

  var separator = decoded.indexOf(":");
  if (separator < 0) { return unauthorized(); }

  var candidateDigest = deriveDigest(VERIFIER.salt, decoded, VERIFIER.iterations);
  if (!constantTimeEquals(candidateDigest, VERIFIER.digest)) { return unauthorized(); }

  // Éxito: eliminar la cabecera sensible antes de continuar al origen.
  delete headers.authorization;
  return request;
}
`;
}
