/**
 * Modelo de «sobre versionado» (envelope) de persistencia y su validación
 * estructural (Tarea 15.1, requisitos 6.3, 22.1, 28.6).
 *
 * Un sobre envuelve cada agregado persistido (Instantánea, resumen de Partida,
 * copia de migración, metadato…) con la metainformación que TODA lectura debe
 * validar antes de confiar en el contenido:
 *
 * - versión del esquema lógico del sobre (`envelopeVersion`);
 * - Versión de guardado (`saveVersion`) y compatibilidad de ejecución
 *   (`rulesVersion`, `algorithmVersion`);
 * - `gameId` interno declarado en el propio sobre (defensa frente a claves
 *   cruzadas o corrupción de índices);
 * - {@link IntegrityDescriptor} calculado sobre el `payload` canónico.
 *
 * La suma de integridad DETECTA alteración accidental; NO es firma ni cifrado
 * (requisito 22). El algoritmo se versiona a través de `IntegrityDescriptor`.
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es PURO. No
 * importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`. Reutiliza el {@link IntegrityDescriptor} real de `engine/state.ts`
 * (no lo duplica). El I/O contra IndexedDB vive exclusivamente en el adaptador
 * de `adapters/browser/indexeddb/`, que consume estas funciones.
 */
import type {
  GameId,
  RulesVersion,
  SaveVersion,
  SnapshotId,
} from "../identity/index.js";
import type { IntegrityDescriptor } from "../engine/state.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/**
 * Versión del esquema lógico del sobre. Se incrementa cuando cambia la FORMA
 * del sobre (no la del contenido envuelto), permitiendo evolución sin upgrades
 * destructivos del esquema físico de IndexedDB.
 */
export const CURRENT_ENVELOPE_VERSION = 1 as const;

/**
 * Identificador del algoritmo de integridad usado por
 * {@link computeIntegrity}. Es una suma de DETECCIÓN de alteración accidental
 * (FNV-1a de 32 bits sobre la serialización canónica), no una firma ni cifrado.
 */
export const INTEGRITY_ALGORITHM = "fnv1a-32" as const;

/** Base de conversión hexadecimal de la suma de integridad. */
const HEX_RADIX = 16;

/** Desplazamiento de máscara a 32 bits sin signo. */
const UINT32_MASK = 0xffffffff;

/** Offset basis de FNV-1a de 32 bits. */
const FNV_OFFSET_BASIS = 0x811c9dc5;

/** Primo de FNV-1a de 32 bits. */
const FNV_PRIME = 0x01000193;

// ---------------------------------------------------------------------------
// Modelo de sobre
// ---------------------------------------------------------------------------

/**
 * Descriptor de compatibilidad de un sobre. Toda lectura verifica que estas
 * versiones sean aceptadas por el Entorno actual antes de usar el `payload`.
 */
export type EnvelopeCompatibility = Readonly<{
  saveVersion: SaveVersion;
  rulesVersion: RulesVersion;
  algorithmVersion: string;
}>;

/**
 * Sobre versionado inmutable que envuelve un `payload` de tipo `T`.
 *
 * `gameId` se incluye de forma redundante dentro del sobre (además de formar
 * parte de la clave del object store) para detectar claves cruzadas o índices
 * corruptos en cada lectura. Los sobres que no pertenecen a una Partida
 * concreta (p. ej. metadatos o preferencias globales) omiten `gameId`.
 */
export type VersionedEnvelope<T> = Readonly<{
  envelopeVersion: number;
  compatibility: EnvelopeCompatibility;
  gameId?: GameId;
  payload: T;
  integrity: IntegrityDescriptor;
}>;

/** Entrada para {@link sealEnvelope}; la integridad la calcula el sellado. */
export type SealEnvelopeInput<T> = Readonly<{
  compatibility: EnvelopeCompatibility;
  gameId?: GameId;
  payload: T;
}>;

/** Motivos tipados por los que la validación de un sobre falla-cerrado. */
export type EnvelopeRejectionReason =
  | "unsupported-envelope-version"
  | "unsupported-save-version"
  | "unsupported-rules-version"
  | "unsupported-algorithm-version"
  | "game-id-mismatch"
  | "integrity-mismatch"
  | "malformed-envelope";

/** Subconjunto que bloquea por incompatibilidad y nunca implica corrupción. */
export type EnvelopeIncompatibilityReason = Extract<
  EnvelopeRejectionReason,
  | "unsupported-envelope-version"
  | "unsupported-save-version"
  | "unsupported-rules-version"
  | "unsupported-algorithm-version"
>;

/** Distingue incompatibilidad soportable de corrupción persistente real. */
export function isEnvelopeIncompatibilityReason(
  reason: EnvelopeRejectionReason,
): reason is EnvelopeIncompatibilityReason {
  return (
    reason === "unsupported-envelope-version" ||
    reason === "unsupported-save-version" ||
    reason === "unsupported-rules-version" ||
    reason === "unsupported-algorithm-version"
  );
}

/**
 * Error tipado de validación de sobre. Conserva el sobre estructural recibido y
 * la política que lo rechazó para poder exportarlo localmente sin volver a
 * leerlo ni relajar la validación. Un sobre malformado puede no estar disponible.
 */
export class EnvelopeValidationError extends Error {
  public readonly reason: EnvelopeRejectionReason;
  public readonly detail: string;
  public readonly envelope: VersionedEnvelope<unknown> | undefined;
  public readonly policy: CompatibilityPolicy | undefined;
  public readonly context: EnvelopeReadContext;

  public constructor(
    reason: EnvelopeRejectionReason,
    detail: string,
    options: Readonly<{
      envelope?: VersionedEnvelope<unknown>;
      policy?: CompatibilityPolicy;
      context?: EnvelopeReadContext;
    }> = {},
  ) {
    super(`Sobre versionado inválido (${reason}): ${detail}.`);
    this.name = "EnvelopeValidationError";
    this.reason = reason;
    this.detail = detail;
    this.envelope = options.envelope;
    this.policy = options.policy;
    this.context = options.context ?? Object.freeze({});
  }
}

// ---------------------------------------------------------------------------
// Serialización canónica e integridad (puras y deterministas)
// ---------------------------------------------------------------------------

/**
 * Serializa un valor a una cadena canónica estable: claves de objeto ordenadas
 * alfabéticamente y sin espacios superfluos. Es determinista e independiente
 * del orden de inserción, condición necesaria para que la suma de integridad
 * detecte alteraciones de forma reproducible.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/**
 * Calcula la suma FNV-1a de 32 bits de una cadena, en hexadecimal de ancho
 * fijo. Función pura sin dependencias de plataforma (no usa `crypto`).
 */
function fnv1a32(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) & UINT32_MASK;
  }
  const unsigned = hash >>> 0;
  return unsigned.toString(HEX_RADIX).padStart(8, "0");
}

/**
 * Calcula el {@link IntegrityDescriptor} de un `payload` sobre su forma
 * canónica. Detección de alteración accidental (requisito 22), no firma.
 */
export function computeIntegrity(payload: unknown): IntegrityDescriptor {
  return Object.freeze({
    algorithm: INTEGRITY_ALGORITHM,
    value: fnv1a32(canonicalize(payload)),
  });
}

// ---------------------------------------------------------------------------
// Sellado y validación
// ---------------------------------------------------------------------------

/**
 * Sella un `payload` en un {@link VersionedEnvelope} inmutable con la versión
 * de esquema actual y la suma de integridad recién calculada. Los sobres sin
 * `gameId` (metadatos/preferencias globales) omiten la clave.
 */
export function sealEnvelope<T>(input: SealEnvelopeInput<T>): VersionedEnvelope<T> {
  const base = {
    envelopeVersion: CURRENT_ENVELOPE_VERSION,
    compatibility: Object.freeze({ ...input.compatibility }),
    payload: input.payload,
    integrity: computeIntegrity(input.payload),
  };
  if (input.gameId !== undefined) {
    return Object.freeze({ ...base, gameId: input.gameId });
  }
  return Object.freeze(base);
}

/**
 * Conjunto de versiones que el Entorno actual acepta al leer un sobre. Se pasa
 * explícitamente en cada lectura para que la compatibilidad sea una decisión
 * de la capa que abre la base, no un estado global implícito.
 */
export type CompatibilityPolicy = Readonly<{
  supportedEnvelopeVersions: readonly number[];
  supportedSaveVersions: readonly SaveVersion[];
  supportedRulesVersions: readonly RulesVersion[];
  supportedAlgorithmVersions: readonly string[];
}>;

/** Contexto opcional de validación según la clave física leída. */
export type EnvelopeReadContext = Readonly<{
  expectedGameId?: GameId;
  expectedSnapshotId?: SnapshotId;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertEnvelopeShape(
  candidate: unknown,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext,
): asserts candidate is VersionedEnvelope<unknown> {
  const options = { policy, context };
  if (!isRecord(candidate)) {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "no es un objeto",
      options,
    );
  }
  if (typeof candidate["envelopeVersion"] !== "number") {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "falta envelopeVersion",
      options,
    );
  }
  const compatibility = candidate["compatibility"];
  if (!isRecord(compatibility)) {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "falta compatibility",
      options,
    );
  }
  if (
    typeof compatibility["saveVersion"] !== "string" ||
    typeof compatibility["rulesVersion"] !== "string" ||
    typeof compatibility["algorithmVersion"] !== "string"
  ) {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "compatibility no declara saveVersion, rulesVersion y algorithmVersion",
      options,
    );
  }
  const integrity = candidate["integrity"];
  if (
    !isRecord(integrity) ||
    typeof integrity["algorithm"] !== "string" ||
    typeof integrity["value"] !== "string"
  ) {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "integrity no declara algorithm y value",
      options,
    );
  }
  if (!hasOwn(candidate, "payload")) {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "falta payload",
      options,
    );
  }
  if (hasOwn(candidate, "gameId") && typeof candidate["gameId"] !== "string") {
    throw new EnvelopeValidationError(
      "malformed-envelope",
      "gameId debe ser una cadena cuando está presente",
      options,
    );
  }
}

function assertEnvelopeVersionSupported(
  envelope: VersionedEnvelope<unknown>,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext,
): void {
  if (!policy.supportedEnvelopeVersions.includes(envelope.envelopeVersion)) {
    throw new EnvelopeValidationError(
      "unsupported-envelope-version",
      `versión de sobre ${envelope.envelopeVersion} no soportada`,
      { envelope, policy, context },
    );
  }
}

function assertCompatibilityVersionsSupported(
  envelope: VersionedEnvelope<unknown>,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext,
): void {
  const options = { envelope, policy, context };
  const { saveVersion, rulesVersion, algorithmVersion } = envelope.compatibility;
  if (!policy.supportedSaveVersions.includes(saveVersion)) {
    throw new EnvelopeValidationError(
      "unsupported-save-version",
      `Versión de guardado «${saveVersion}» no soportada`,
      options,
    );
  }
  if (!policy.supportedRulesVersions.includes(rulesVersion)) {
    throw new EnvelopeValidationError(
      "unsupported-rules-version",
      `Versión de reglas «${rulesVersion}» no soportada`,
      options,
    );
  }
  if (!policy.supportedAlgorithmVersions.includes(algorithmVersion)) {
    throw new EnvelopeValidationError(
      "unsupported-algorithm-version",
      `Versión de algoritmo «${algorithmVersion}» no soportada`,
      options,
    );
  }
}

function assertGameIdMatches(
  envelope: VersionedEnvelope<unknown>,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext,
): void {
  if (context.expectedGameId === undefined) {
    return;
  }
  if (envelope.gameId !== context.expectedGameId) {
    throw new EnvelopeValidationError(
      "game-id-mismatch",
      `gameId interno «${String(envelope.gameId)}» distinto del esperado «${context.expectedGameId}»`,
      { envelope, policy, context },
    );
  }
}

function assertIntegrityMatches(
  envelope: VersionedEnvelope<unknown>,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext,
): void {
  const recomputed = computeIntegrity(envelope.payload);
  if (
    recomputed.algorithm !== envelope.integrity.algorithm ||
    recomputed.value !== envelope.integrity.value
  ) {
    throw new EnvelopeValidationError(
      "integrity-mismatch",
      "la suma de integridad recalculada no coincide con la almacenada",
      { envelope, policy, context },
    );
  }
}

/**
 * Valida un sobre recién leído y devuelve su `payload` tipado. Comprueba, en
 * este orden y con fail-fast: forma mínima completa del sobre; versión de
 * esquema; para esquemas conocidos, `gameId` e integridad; y por último
 * compatibilidad de guardado, reglas y algoritmo. Así una corrupción de un
 * sobre actual no se reclasifica como incompatibilidad, mientras una versión
 * futura se rechaza sin interpretar su payload bajo reglas desconocidas.
 *
 * NO castea a ciegas el `payload`: el llamante conoce el tipo `T` que espera de
 * ese object store. La verificación estructural profunda del contenido (p. ej.
 * la forma de una Instantánea) corresponde a validadores del dominio (7.2) y a
 * la unidad de trabajo (15.2); aquí se garantiza la integridad del SOBRE.
 */
export function openEnvelope<T>(
  candidate: unknown,
  policy: CompatibilityPolicy,
  context: EnvelopeReadContext = {},
): T {
  assertEnvelopeShape(candidate, policy, context);
  const envelope = candidate as VersionedEnvelope<T>;

  // Una versión futura se rechaza sin interpretar su payload bajo el esquema
  // actual. Para sobres conocidos, identidad e integridad prevalecen sobre la
  // compatibilidad: una corrupción no se reclasifica como versión incompatible.
  assertEnvelopeVersionSupported(envelope, policy, context);
  assertGameIdMatches(envelope, policy, context);
  assertIntegrityMatches(envelope, policy, context);
  assertCompatibilityVersionsSupported(envelope, policy, context);
  return envelope.payload;
}
