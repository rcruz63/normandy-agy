/**
 * Proyector es-ES del Registro simple y del Registro detallado (Tarea 13.1,
 * requisito 20). Proyecta cada entrada a un {@link DomainMessage} (clave
 * `messageKey` más `params` interpolables) SIN cadenas de idioma incrustadas en
 * el dominio: la resolución del texto visible final la hace la Interfaz
 * (Tarea 20) resolviendo la clave con sus parámetros.
 *
 * Reglas de proyección:
 *
 * - Cada entrada conserva su `messageKey` propio; el proyector solo AÑADE los
 *   parámetros de interpolación (operandos, valores base, umbral, comparación,
 *   Versión de reglas) y, para el desglose, cada modificador con su signo
 *   explícito (p. ej. "+2", "-1"), tal como exige 20.2.
 *
 * - Los modificadores se proyectan como un único parámetro de texto legible en
 *   orden de cálculo (20.7), con nombre y signo; el signo se antepone siempre,
 *   también en los positivos, para que la Interfaz muestre el aporte algebraico
 *   sin ambigüedad.
 *
 * FRONTERA DE CAPAS Y PUREZA: el proyector reutiliza el {@link DomainMessage} de
 * `transition.ts` (tipo unificado del dominio) en lugar de definir uno nuevo.
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. No muta sus argumentos.
 */
import type { DomainMessage } from "../engine/transition.js";
import type {
  DetailedLogEntry,
  ModifierBreakdown,
  NamedModifier,
  SimpleLogEntry,
} from "./log-entries.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Signo explícito antepuesto a un modificador no negativo (20.2). */
const POSITIVE_SIGN: string = "+";
/** Separador entre modificadores del texto de desglose. */
const MODIFIER_SEPARATOR: string = ", ";
/** Marca de multiplicidad de un modificador de Apoyo (`×N`). */
const COUNT_MARK: string = "×";

// ---------------------------------------------------------------------------
// Proyección de modificadores con signo (20.2, 20.7)
// ---------------------------------------------------------------------------

/**
 * Formatea un modificador con su signo explícito y, si procede, su
 * multiplicidad (Apoyo `×N`): p. ej. "building+2", "support-2×2". El signo se
 * antepone también a los positivos para reflejar el aporte algebraico (20.2).
 */
function formatModifier(modifier: NamedModifier): string {
  const sign = modifier.value >= 0 ? `${POSITIVE_SIGN}${modifier.value}` : `${modifier.value}`;
  if (modifier.count === undefined) {
    return `${modifier.name}${sign}`;
  }
  return `${modifier.name}${sign}${COUNT_MARK}${modifier.count}`;
}

/**
 * Une los modificadores de un desglose en un único texto en orden de cálculo
 * (20.7), cada uno con nombre y signo (20.2).
 */
function formatModifiers(modifiers: readonly NamedModifier[]): string {
  return modifiers.map(formatModifier).join(MODIFIER_SEPARATOR);
}

/**
 * Une los valores base de un desglose en un único texto de solo lectura, en el
 * orden recibido.
 */
function formatBaseValues(baseValues: readonly number[]): string {
  return baseValues.map((value) => `${value}`).join(MODIFIER_SEPARATOR);
}

/**
 * Reúne los parámetros de interpolación de un desglose con tirada (20.2): valor
 * bruto, valor objetivo, valores base, modificadores con signo, fórmula,
 * comparación y resultado final.
 */
function rollParams(roll: ModifierBreakdown): Readonly<Record<string, string | number>> {
  return Object.freeze({
    rawValue: roll.rawValue,
    targetValue: roll.targetValue,
    baseValues: formatBaseValues(roll.baseValues),
    modifiers: formatModifiers(roll.modifiers),
    formula: roll.formula,
    comparison: roll.comparison,
    finalResult: roll.finalResult,
  });
}

// ---------------------------------------------------------------------------
// Proyección del Registro simple (20.1)
// ---------------------------------------------------------------------------

/**
 * Proyecta una entrada del Registro simple a un {@link DomainMessage} es-ES
 * (20.1). Traslada `turn`, `phase`, `actor`, `action` y `result` como
 * parámetros de interpolación, respetando cualquier `params` propio de la
 * entrada. Los campos ausentes se omiten (`exactOptionalPropertyTypes`).
 */
export function projectSimpleEntry(entry: SimpleLogEntry): DomainMessage {
  const params: Record<string, string | number> = { ...(entry.params ?? {}) };
  if (entry.turn !== undefined) {
    params["turn"] = entry.turn;
  }
  addSimpleTextParams(params, entry);
  return Object.freeze({ messageKey: entry.messageKey, params: Object.freeze(params) });
}

/** Copia los campos de texto de 20.1 presentes al mapa de parámetros. */
function addSimpleTextParams(
  params: Record<string, string | number>,
  entry: SimpleLogEntry,
): void {
  const textFields: readonly (keyof SimpleLogEntry)[] = [
    "phase",
    "actor",
    "action",
    "result",
  ];
  textFields.forEach((field) => {
    const value = entry[field];
    if (typeof value === "string") {
      params[field] = value;
    }
  });
}

// ---------------------------------------------------------------------------
// Proyección del Registro detallado (20.2, 20.3, 20.4)
// ---------------------------------------------------------------------------

/**
 * Proyecta una entrada del Registro detallado a un {@link DomainMessage} es-ES.
 * Para una entrada con tirada (20.2) interpola el desglose completo con cada
 * modificador y su signo; para una determinista (20.3) interpola las entradas,
 * reglas, prioridades y cálculos. Añade la Versión de reglas y el número de
 * Referencias de fuente cuando se usan Datos canónicos (20.4).
 */
export function projectDetailedEntry(entry: DetailedLogEntry): DomainMessage {
  const params: Record<string, string | number> = { ...(entry.params ?? {}) };
  if (entry.roll !== undefined) {
    Object.assign(params, rollParams(entry.roll));
  }
  if (entry.deterministic !== undefined) {
    Object.assign(params, deterministicParams(entry.deterministic));
  }
  addCanonicalParams(params, entry);
  return Object.freeze({ messageKey: entry.messageKey, params: Object.freeze(params) });
}

/** Reúne los parámetros de una resolución determinista sin tirada (20.3). */
function deterministicParams(
  deterministic: NonNullable<DetailedLogEntry["deterministic"]>,
): Readonly<Record<string, string | number>> {
  return Object.freeze({
    inputs: deterministic.inputs.join(MODIFIER_SEPARATOR),
    rules: deterministic.rules.join(MODIFIER_SEPARATOR),
    priorities: deterministic.priorities.join(MODIFIER_SEPARATOR),
    computations: deterministic.computations.join(MODIFIER_SEPARATOR),
  });
}

/**
 * Añade la Versión de reglas y el recuento de Referencias de fuente cuando la
 * resolución usa Datos canónicos (20.4). No incrusta texto de idioma: son datos
 * que la Interfaz interpola.
 */
function addCanonicalParams(
  params: Record<string, string | number>,
  entry: DetailedLogEntry,
): void {
  if (entry.rulesVersion !== undefined) {
    params["rulesVersion"] = entry.rulesVersion;
  }
  if (entry.sourceRefs !== undefined) {
    params["sourceRefCount"] = entry.sourceRefs.length;
  }
  if (entry.consumptions !== undefined) {
    params["consumptionCount"] = entry.consumptions.length;
  }
}

// ---------------------------------------------------------------------------
// Proyección de registros completos
// ---------------------------------------------------------------------------

/** Proyecta un Registro simple completo a mensajes es-ES en orden (20.6). */
export function projectSimpleLog(
  entries: readonly SimpleLogEntry[],
): readonly DomainMessage[] {
  return Object.freeze(entries.map(projectSimpleEntry));
}

/** Proyecta un Registro detallado completo a mensajes es-ES en orden (20.7). */
export function projectDetailedLog(
  entries: readonly DetailedLogEntry[],
): readonly DomainMessage[] {
  return Object.freeze(entries.map(projectDetailedEntry));
}
