/**
 * Formateadores regionales `es-ES` de la Interfaz (Tarea 20.5, requisito 3.4).
 *
 * La Aplicación representa fechas, horas y números con formatos coherentes con
 * la configuración regional `es-ES` (3.4). Este módulo centraliza la locale
 * explícita y expone formateadores memoizados sobre `Intl`, para que ninguna
 * vista construya `Intl.*` ad hoc ni asuma la locale del entorno.
 *
 * FRONTERA DE CAPAS: este módulo vive en `ui/`. Solo transforma valores hacia
 * texto es-ES; no contiene lógica de juego (el dominio produce los datos). Usa
 * `Intl`, disponible en el navegador y en el entorno de pruebas, sin tocar DOM,
 * IndexedDB, red ni reloj (no lee `Date.now`; formatea las fechas que recibe).
 */

/** Locale explícita de toda la Interfaz (requisito 3.4). No se infiere. */
export const LOCALE_ES_ES = "es-ES" as const;

/**
 * Instancias `Intl` memoizadas por clave de opciones. Evita recrear
 * formateadores en cada render conservando la locale fija.
 */
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();

function dateTimeFormatterFor(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  const cached = dateTimeFormatters.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat(LOCALE_ES_ES, options);
  dateTimeFormatters.set(key, formatter);
  return formatter;
}

function numberFormatterFor(
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = JSON.stringify(options);
  const cached = numberFormatters.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(LOCALE_ES_ES, options);
  numberFormatters.set(key, formatter);
  return formatter;
}

/** Opciones por defecto de fecha completa es-ES (día, mes, año). */
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = Object.freeze({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Opciones por defecto de hora es-ES (24 h, sin AM/PM). */
const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = Object.freeze({
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Opciones por defecto de fecha y hora es-ES combinadas. */
const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = Object.freeze({
  ...DEFAULT_DATE_OPTIONS,
  ...DEFAULT_TIME_OPTIONS,
});

/**
 * Formatea una fecha en `es-ES` (3.4). Acepta una `Date` o una marca de tiempo
 * en milisegundos; la Interfaz decide el instante, este módulo solo lo
 * representa.
 */
export function formatDate(
  value: Date | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  return dateTimeFormatterFor(options).format(value);
}

/** Formatea una hora en `es-ES` (24 h) (3.4). */
export function formatTime(
  value: Date | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME_OPTIONS,
): string {
  return dateTimeFormatterFor(options).format(value);
}

/** Formatea fecha y hora combinadas en `es-ES` (3.4). */
export function formatDateTime(
  value: Date | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME_OPTIONS,
): string {
  return dateTimeFormatterFor(options).format(value);
}

/**
 * Formatea un número en `es-ES` (3.4): separador de miles con punto y decimal
 * con coma, según la locale. La Interfaz usa esto para cualquier cifra visible
 * (turnos, secuencias, recuentos…).
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormatterFor(options).format(value);
}
