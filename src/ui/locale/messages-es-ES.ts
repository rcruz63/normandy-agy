/**
 * Catálogo de textos `es-ES` de la Interfaz (Tarea 20.5, requisitos 3.1, 3.2,
 * 3.3).
 *
 * El dominio NUNCA incrusta cadenas de idioma: produce `DomainMessage` con una
 * `messageKey` y parámetros interpolables. La Interfaz resuelve la clave a texto
 * visible usando ESTE catálogo. Toda la redacción es original en español de
 * España; no se copia prosa protegida del PDF fuente (requisitos 3, 30).
 *
 * Convención de plantilla: los marcadores `{nombre}` se sustituyen por el valor
 * del parámetro homónimo aportado por el `DomainMessage`. Un marcador sin
 * parámetro se deja literal para que la carencia sea visible en pruebas.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`; solo datos de presentación. No importa
 * dominio, DOM, IndexedDB, red ni reloj.
 */

/** Diccionario de claves de mensaje a plantillas `es-ES`. */
export type MessageCatalog = Readonly<Record<string, string>>;

/**
 * Catálogo base `es-ES`. Cubre las claves de registro conocidas (Tarea 13.1) y
 * las etiquetas de la Interfaz de la Tarea 20.5. Se amplía a medida que otras
 * tareas declaran nuevas claves; una clave ausente se detecta en el resolutor.
 */
export const MESSAGES_ES_ES: MessageCatalog = Object.freeze({
  // --- Interfaz: selector de Misiones (requisito 3.1, 32.2) ---
  "ui.mission-selector.title": "Selecciona una Misión",
  "ui.mission-selector.empty":
    "No hay Misiones publicadas disponibles todavía.",
  "ui.mission-selector.objective": "Objetivo: {objective}",
  "ui.mission-selector.base-turns": "Turnos base: {baseTurns}",

  // --- Interfaz: registros (requisitos 3.2, 3.3, 20.8, 20.9) ---
  "ui.log.tab.simple": "Registro simple",
  "ui.log.tab.detailed": "Registro detallado",
  "ui.log.entry.expand": "Expandir entrada",
  "ui.log.entry.collapse": "Contraer entrada",

  // --- Registro simple (requisito 3.2, 20.1) ---
  "log.simple.move": "Turno {turn}: {actor} avanza. Resultado: {result}.",
  "log.simple.fire": "Turno {turn}: {actor} dispara. Resultado: {result}.",

  // --- Registro detallado (requisito 3.3, 20.2, 20.3) ---
  "log.detailed.combat":
    "Combate: tirada {rawValue} frente a objetivo {targetValue} (bases {baseValues}; modificadores {modifiers}; fórmula {formula}; comparación {comparison}). Resultado: {finalResult}.",
  "log.detailed.deterministic":
    "Resolución determinista. Entradas: {inputs}. Reglas: {rules}. Prioridades: {priorities}. Cálculos: {computations}.",

  // --- Resultados comunes (requisito 3.3) ---
  "log.result.hit": "impacto",
  "log.result.miss": "fallo",
});
