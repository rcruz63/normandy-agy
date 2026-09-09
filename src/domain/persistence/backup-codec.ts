/**
 * Implementación del puerto `BackupCodec` (Tarea 16.1, requisitos 22.2, 22.3,
 * 22.11).
 *
 * `encode` serializa un conjunto de {@link GameAggregate} a un
 * {@link BackupPackage} sobre una representación canónica versionada: UTF-8,
 * orden estable de claves y Suma de integridad calculada sobre la forma
 * canónica. `validate` recorre el camino inverso a partir de los bytes de un
 * archivo, verificando envoltorio, versión de canonicalización, algoritmo de
 * integridad y suma ANTES de exponer los agregados; devuelve
 * {@link ValidatedBackup} en éxito o {@link BackupFailure} tipado en fallo,
 * sin escribir jamás el Almacenamiento local (requisito 22.3).
 *
 * La Suma DETECTA alteración accidental; NO es firma ni cifrado (22.11). El
 * round-trip garantiza equivalencia ESTRUCTURAL de los agregados, no identidad
 * de bytes del archivo original.
 *
 * ALCANCE (16.1): envoltorio + canonicalización + suma + identificadores +
 * forma del paquete a nivel de bytes. La validación profunda de
 * Instantáneas/registros/aleatorio e invariantes y el staging/escritura
 * corresponden a la Tarea 16.2.
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es determinista.
 * No importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`. El único efecto es el (des)codificado UTF-8 con `TextEncoder`/
 * `TextDecoder` estándar, deterministas. Reutiliza `canonicalize`,
 * `computeIntegrity` e `INTEGRITY_ALGORITHM` de `versioned-envelope.ts`.
 */
import type { GameId, SaveVersion } from "../identity/index.js";
import type { IntegrityDescriptor } from "../engine/state.js";
import {
  INTEGRITY_ALGORITHM,
  canonicalize,
  computeIntegrity,
} from "./versioned-envelope.js";
import {
  BACKUP_FORMAT,
  CURRENT_CANONICALIZATION_VERSION,
  type BackupFailure,
  type BackupPackage,
  type BackupRejectionReason,
  type GameAggregate,
  type ValidatedBackup,
} from "./backup-package.js";
import type { BackupCodec } from "../ports/backup-codec.js";

// ---------------------------------------------------------------------------
// Códecs UTF-8 estándar (deterministas, sin dependencia de DOM/Node lib)
// ---------------------------------------------------------------------------

/**
 * Superficie mínima de `TextEncoder`/`TextDecoder` que este módulo consume. Se
 * declara localmente para no acoplar el typecheck del dominio a las librerías
 * DOM o Node: son códecs estándar y deterministas del entorno de ejecución.
 */
interface Utf8Encoder {
  encode(input: string): Uint8Array;
}
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
declare const TextEncoder: { new (): Utf8Encoder };
declare const TextDecoder: { new (label: string, options: { fatal: boolean }): Utf8Decoder };

const utf8Encoder: Utf8Encoder = new TextEncoder();
const utf8Decoder: Utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// ---------------------------------------------------------------------------
// Forma canónica del paquete (sujeto de la Suma de integridad)
// ---------------------------------------------------------------------------

/**
 * Cuerpo canónico del paquete: todo salvo la Suma y los bytes derivados. La
 * integridad se calcula sobre ESTA forma, de modo que recomputarla al validar
 * es independiente del orden de serialización del archivo.
 */
type BackupBody = Readonly<{
  format: typeof BACKUP_FORMAT;
  canonicalizationVersion: string;
  integrityAlgorithm: string;
  saveVersion: SaveVersion;
  exportedGameIds: readonly GameId[];
  games: readonly GameAggregate[];
}>;

/** Documento serializado a bytes: cuerpo canónico más la Suma calculada. */
type BackupDocument = BackupBody & Readonly<{ integrity: IntegrityDescriptor }>;

function buildBody(games: readonly GameAggregate[]): BackupBody {
  return {
    format: BACKUP_FORMAT,
    canonicalizationVersion: CURRENT_CANONICALIZATION_VERSION,
    integrityAlgorithm: INTEGRITY_ALGORITHM,
    saveVersion: resolveSaveVersion(games),
    exportedGameIds: games.map((aggregate) => aggregate.gameId),
    games,
  };
}

/**
 * Determina la Versión de guardado del paquete. Todos los agregados comparten
 * Versión de guardado en una misma exportación; se toma la del primero y, si no
 * hay agregados, se exporta un paquete vacío con Versión de guardado ausente
 * representada como cadena vacía marcada (la validación profunda de 16.2 no
 * aplica a un conjunto vacío).
 */
function resolveSaveVersion(games: readonly GameAggregate[]): SaveVersion {
  const first = games[0];
  if (first === undefined) {
    return "" as SaveVersion;
  }
  return first.saveVersion;
}

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

/**
 * Serializa los agregados a un {@link BackupPackage}. Canonicaliza el cuerpo de
 * forma estable, calcula la Suma sobre esa forma y produce los bytes UTF-8 del
 * documento completo.
 */
function encodePackage(games: readonly GameAggregate[]): BackupPackage {
  const body = buildBody(games);
  const integrity = computeIntegrity(body);
  const document: BackupDocument = { ...body, integrity };
  const bytes = utf8Encoder.encode(canonicalize(document));
  return Object.freeze({
    format: body.format,
    canonicalizationVersion: body.canonicalizationVersion,
    integrityAlgorithm: body.integrityAlgorithm,
    saveVersion: body.saveVersion,
    exportedGameIds: body.exportedGameIds,
    games: body.games,
    integrity,
    bytes,
  });
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

function failure(reason: BackupRejectionReason, detail: string): BackupFailure {
  return Object.freeze({ ok: false, reason, detail });
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Valida forma superficial del documento: objeto con envoltorio, arrays de
 * identificadores y agregados, y objeto de integridad. No inspecciona el
 * interior de cada Instantánea (eso es 16.2).
 */
function assertDocumentShape(value: unknown): value is BackupDocument {
  if (!isRecord(value)) {
    return false;
  }
  const hasStrings =
    typeof value["format"] === "string" &&
    typeof value["canonicalizationVersion"] === "string" &&
    typeof value["integrityAlgorithm"] === "string" &&
    typeof value["saveVersion"] === "string";
  const hasCollections =
    Array.isArray(value["exportedGameIds"]) && Array.isArray(value["games"]);
  return hasStrings && hasCollections && isRecord(value["integrity"]);
}

function recomputedMatches(document: BackupDocument): boolean {
  const body: BackupBody = {
    format: document.format,
    canonicalizationVersion: document.canonicalizationVersion,
    integrityAlgorithm: document.integrityAlgorithm,
    saveVersion: document.saveVersion,
    exportedGameIds: document.exportedGameIds,
    games: document.games,
  };
  const recomputed = computeIntegrity(body);
  return (
    recomputed.algorithm === document.integrity.algorithm &&
    recomputed.value === document.integrity.value
  );
}

/**
 * Valida un archivo de copia a partir de sus bytes. Comprueba, en este orden y
 * con fail-fast: decodificación UTF-8, parseo, forma del documento, marcador de
 * formato, versión de canonicalización soportada, algoritmo de integridad
 * soportado y coincidencia de la Suma recomputada sobre la forma canónica.
 */
function validatePackage(bytes: Uint8Array): ValidatedBackup | BackupFailure {
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    return failure("malformed-package", "los bytes no son UTF-8 válido");
  }
  const parsed = parseJson(text);
  if (!assertDocumentShape(parsed)) {
    return failure("malformed-package", "el documento no tiene la forma de un paquete de copia");
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return failure("unsupported-format", `formato «${String(parsed.format)}» desconocido`);
  }
  if (parsed.canonicalizationVersion !== CURRENT_CANONICALIZATION_VERSION) {
    return failure(
      "unsupported-canonicalization-version",
      `versión de canonicalización «${parsed.canonicalizationVersion}» no soportada`,
    );
  }
  if (parsed.integrityAlgorithm !== INTEGRITY_ALGORITHM) {
    return failure(
      "unsupported-integrity-algorithm",
      `algoritmo de integridad «${parsed.integrityAlgorithm}» no soportado`,
    );
  }
  if (!recomputedMatches(parsed)) {
    return failure(
      "integrity-mismatch",
      "la suma de integridad recalculada no coincide con la almacenada",
    );
  }
  return Object.freeze({
    ok: true,
    canonicalizationVersion: parsed.canonicalizationVersion,
    saveVersion: parsed.saveVersion,
    exportedGameIds: parsed.exportedGameIds,
    games: parsed.games,
    integrity: parsed.integrity,
  });
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/**
 * Implementación pura y determinista del puerto {@link BackupCodec}. Las firmas
 * son asíncronas por contrato del puerto (el flujo de importación de 16.2 lee
 * archivos), pero esta implementación no realiza I/O.
 */
export class CanonicalBackupCodec implements BackupCodec {
  public encode(games: readonly GameAggregate[]): Promise<BackupPackage> {
    return Promise.resolve(encodePackage(games));
  }

  public validate(bytes: Uint8Array): Promise<ValidatedBackup | BackupFailure> {
    return Promise.resolve(validatePackage(bytes));
  }
}

/** Crea una instancia del códec canónico de copias. */
export function createBackupCodec(): BackupCodec {
  return new CanonicalBackupCodec();
}
