/**
 * Referencia de fuente (`SourceRef`) y su constructor validador (Tarea 2.1).
 *
 * Una {@link SourceRef} localiza un Dato canónico dentro de la Fuente lúdica
 * `FON-ML-2022`: página, elemento identificable y, opcionalmente, una
 * Referencia de misión `FON-ML-2022-Mnn` (requisitos 1.1, 1.2, 1.4, 3.5, 4.2,
 * 4.3, 32.3).
 *
 * Reglas de localización comprobadas (DC-002 / requisito 1.4):
 * - El número de Misión `N` va de 01 a 15.
 * - La Página de reglas de Misión es `16 + 2 × (N − 1)` (par).
 * - La Página de Mapa es `17 + 2 × (N − 1)` (impar).
 *
 * Este módulo es puro y sin dependencias de plataforma: puede vivir junto al
 * dominio sin importar DOM, IndexedDB, red, reloj ni SDK de AWS. Solo tipa y
 * valida; no lee el PDF ni extrae recursos.
 */

/** Identificador de Versión de fuente fijado por el diseño (DC-001). */
export const SOURCE_VERSION = "FON-ML-2022" as const;
export type SourceVersion = typeof SOURCE_VERSION;

/** Número de Misión mínimo válido (inclusive). */
export const MIN_MISSION_NUMBER = 1;
/** Número de Misión máximo válido (inclusive). */
export const MAX_MISSION_NUMBER = 15;

/** Página inicial de las reglas generales (requisito 1.3). */
export const GENERAL_RULES_FIRST_PAGE = 5;
/** Página final de las reglas generales (requisito 1.3). */
export const GENERAL_RULES_LAST_PAGE = 14;
/** Página del índice de Misiones (requisito 1.3). */
export const MISSION_INDEX_PAGE = 15;
/** Página del inventario funcional de contadores (requisito 1.5). */
export const COUNTERS_INVENTORY_PAGE = 47;

/**
 * Cadena de Referencia de misión `FON-ML-2022-Mnn`, con `nn` entre `01` y `15`.
 * El tipo plantilla admite cualquier sufijo; el valor concreto se valida en
 * tiempo de ejecución mediante {@link missionRefString}.
 */
export type MissionRefString = `FON-ML-2022-M${string}`;

/**
 * Referencia de fuente inmutable.
 *
 * `missionRef` es opcional (`exactOptionalPropertyTypes`): se omite por
 * completo cuando no aplica, en lugar de asignarse `undefined`.
 */
export type SourceRef = Readonly<{
  sourceVersion: SourceVersion;
  page: number;
  element: string;
  missionRef?: MissionRefString;
}>;

/** Error de las funciones de este módulo cuando un valor no es válido. */
export class InvalidSourceRefError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(
      `SourceRef inválido en «${field}»${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "InvalidSourceRefError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function isMissionNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_MISSION_NUMBER &&
    value <= MAX_MISSION_NUMBER
  );
}

/** Formatea el número de Misión `N` como dos dígitos (`1` → `"01"`). */
export function formatMissionNumber(missionNumber: number): string {
  if (!isMissionNumber(missionNumber)) {
    throw new InvalidSourceRefError(
      "missionNumber",
      missionNumber,
      `debe ser un entero entre ${MIN_MISSION_NUMBER} y ${MAX_MISSION_NUMBER}`,
    );
  }
  return String(missionNumber).padStart(2, "0");
}

/**
 * Página de reglas de la Misión `N`: `16 + 2 × (N − 1)` (requisito 1.4).
 */
export function missionRulesPage(missionNumber: number): number {
  if (!isMissionNumber(missionNumber)) {
    throw new InvalidSourceRefError(
      "missionNumber",
      missionNumber,
      `debe ser un entero entre ${MIN_MISSION_NUMBER} y ${MAX_MISSION_NUMBER}`,
    );
  }
  return 16 + 2 * (missionNumber - 1);
}

/**
 * Página de Mapa de la Misión `N`: `17 + 2 × (N − 1)` (requisito 1.4).
 */
export function missionMapPage(missionNumber: number): number {
  if (!isMissionNumber(missionNumber)) {
    throw new InvalidSourceRefError(
      "missionNumber",
      missionNumber,
      `debe ser un entero entre ${MIN_MISSION_NUMBER} y ${MAX_MISSION_NUMBER}`,
    );
  }
  return 17 + 2 * (missionNumber - 1);
}

/**
 * Construye una Referencia de misión `FON-ML-2022-Mnn` validando `N=01..15`.
 */
export function missionRefString(missionNumber: number): MissionRefString {
  return `FON-ML-2022-M${formatMissionNumber(missionNumber)}` as MissionRefString;
}

/**
 * Extrae el número de Misión de una Referencia de misión válida.
 *
 * Devuelve `undefined` si la cadena no cumple exactamente `FON-ML-2022-Mnn`
 * con `nn` entre `01` y `15`.
 */
export function parseMissionNumber(missionRef: string): number | undefined {
  const match = /^FON-ML-2022-M(\d{2})$/.exec(missionRef);
  if (match === null) {
    return undefined;
  }
  const parsed = Number.parseInt(match[1] as string, 10);
  return isMissionNumber(parsed) ? parsed : undefined;
}

/** Comprueba que una cadena es una Referencia de misión válida (`01..15`). */
export function isMissionRefString(value: unknown): value is MissionRefString {
  return typeof value === "string" && parseMissionNumber(value) !== undefined;
}

/**
 * Argumentos de {@link sourceRef}. `missionRef` puede omitirse.
 */
export type SourceRefInput = Readonly<{
  page: number;
  element: string;
  missionRef?: MissionRefString;
}>;

/**
 * Construye una {@link SourceRef} validando sus invariantes.
 *
 * - `page` debe ser un entero positivo.
 * - `element` no puede estar vacío tras recortar espacios.
 * - `missionRef`, si se aporta, debe ser `FON-ML-2022-Mnn` con `nn=01..15`, y
 *   la `page` debe coincidir con la Página de reglas o la Página de Mapa de esa
 *   Misión (requisito 1.4). Así se conserva la trazabilidad calculada.
 */
export function sourceRef(input: SourceRefInput): SourceRef {
  const { page, element, missionRef } = input;

  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page <= 0
  ) {
    throw new InvalidSourceRefError("page", page, "debe ser un entero positivo");
  }

  if (typeof element !== "string" || element.trim().length === 0) {
    throw new InvalidSourceRefError(
      "element",
      element,
      "no puede estar vacío",
    );
  }

  if (missionRef !== undefined) {
    const missionNumber = parseMissionNumber(missionRef);
    if (missionNumber === undefined) {
      throw new InvalidSourceRefError(
        "missionRef",
        missionRef,
        "debe ser FON-ML-2022-Mnn con nn entre 01 y 15",
      );
    }
    const rulesPage = missionRulesPage(missionNumber);
    const mapPage = missionMapPage(missionNumber);
    if (page !== rulesPage && page !== mapPage) {
      throw new InvalidSourceRefError(
        "page",
        page,
        `para ${missionRef} la página debe ser ${rulesPage} (reglas) o ${mapPage} (mapa)`,
      );
    }
    return Object.freeze({
      sourceVersion: SOURCE_VERSION,
      page,
      element,
      missionRef,
    });
  }

  return Object.freeze({ sourceVersion: SOURCE_VERSION, page, element });
}
