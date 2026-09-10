/**
 * Resolutor de `DomainMessage` a texto visible `es-ES` (Tarea 20.5, requisitos
 * 3.1, 3.2, 3.3).
 *
 * El dominio y sus proyectores emiten `DomainMessage` (`messageKey` + `params`);
 * esta capa los resuelve a la cadena `es-ES` final interpolando los parámetros
 * en la plantilla del catálogo. Es la ÚNICA capa que conoce las cadenas de
 * idioma; el dominio permanece libre de texto.
 *
 * Política fail-visible: una clave ausente en el catálogo NO se traduce a un
 * texto inventado ni se silencia; se marca de forma reconocible para que la
 * carencia sea detectable en pruebas y revisión (requisito 3.6: un texto
 * visible sin redacción aprobada se señala como no publicable). Los marcadores
 * `{nombre}` sin parámetro se conservan literales por la misma razón.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Transforma proyecciones del dominio; no
 * contiene lógica de juego. Importa solo el TIPO `DomainMessage` del dominio
 * (dependencia de tipo, sin acoplar comportamiento) y el catálogo `es-ES`.
 */
import type { DomainMessage } from "../../domain/engine/transition.js";
import { MESSAGES_ES_ES, type MessageCatalog } from "./messages-es-ES.js";
import { formatNumber } from "./intl-formatters.js";

/** Prefijo con el que se marca una clave de mensaje ausente del catálogo. */
export const MISSING_KEY_MARKER = "⟪clave-sin-redacción:" as const;

/** Parámetros interpolables de un mensaje. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** Expresión de un marcador de plantilla `{nombre}`. */
const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Interpola los parámetros en una plantilla. Los números se formatean en
 * `es-ES` (requisito 3.4) mediante {@link formatNumber}; las cadenas se insertan
 * tal cual (ya son texto es-ES o claves anidadas que la Interfaz resuelve). Un
 * marcador sin parámetro correspondiente se deja literal (fail-visible).
 */
function interpolate(template: string, params: MessageParams): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      return match;
    }
    const value = params[name];
    if (typeof value === "number") {
      return formatNumber(value);
    }
    return value ?? match;
  });
}

/**
 * Resuelve una `messageKey` con sus parámetros a texto `es-ES`. Si la clave no
 * existe en el catálogo, devuelve un marcador reconocible con la clave, sin
 * inventar texto.
 */
export function resolveMessageKey(
  messageKey: string,
  params: MessageParams = {},
  catalog: MessageCatalog = MESSAGES_ES_ES,
): string {
  const template = catalog[messageKey];
  if (template === undefined) {
    return `${MISSING_KEY_MARKER}${messageKey}⟫`;
  }
  return interpolate(template, params);
}

/**
 * Resuelve un {@link DomainMessage} completo a texto `es-ES` (3.1, 3.2, 3.3).
 * No muta el mensaje recibido.
 */
export function resolveMessage(
  message: DomainMessage,
  catalog: MessageCatalog = MESSAGES_ES_ES,
): string {
  return resolveMessageKey(message.messageKey, message.params ?? {}, catalog);
}

/** Resuelve una lista de mensajes conservando el orden (20.6, 20.7). */
export function resolveMessages(
  messages: readonly DomainMessage[],
  catalog: MessageCatalog = MESSAGES_ES_ES,
): readonly string[] {
  return Object.freeze(messages.map((message) => resolveMessage(message, catalog)));
}

/** Indica si un texto resuelto corresponde a una clave ausente (fail-visible). */
export function isMissingKey(resolved: string): boolean {
  return resolved.startsWith(MISSING_KEY_MARKER);
}
