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

  // --- Interfaz: Componente de tirada (Tarea 20.4, requisito 41, 25) ---
  "ui.dice.title": "Tirada de dados: {context}",
  "ui.dice.mode.legend": "Modo de tirada",
  "ui.dice.mode.automatic": "Automático",
  "ui.dice.mode.manual": "Manual",
  "ui.dice.mode.automatic.hint":
    "La Aplicación obtiene las caras por ti.",
  "ui.dice.mode.manual.hint":
    "Introduce la cara de cada dado físico en orden.",
  "ui.dice.die.label": "Dado {position} de {count}, {sides} caras",
  "ui.dice.die.pending": "Dado {position}: sin cara asignada",
  "ui.dice.die.face": "Dado {position}: cara {face}",
  "ui.dice.manual.input.label":
    "Cara del dado {position} (de 1 a {sides})",
  "ui.dice.manual.invalid":
    "El dado {position} debe tener una cara entera de 1 a {sides}.",
  "ui.dice.manual.count":
    "Debes introducir una cara por cada uno de los {count} dados.",
  "ui.dice.action.resolve": "Resolver tirada",
  "ui.dice.action.cancel": "Cancelar tirada",
  "ui.dice.action.close": "Cerrar",
  "ui.dice.resolving": "Resolviendo la tirada…",
  "ui.dice.result.faces": "Caras obtenidas: {faces}.",
  "ui.dice.result.effect": "Efecto: {effect}.",
  "ui.dice.result.table.title": "Tabla aplicada",
  "ui.dice.result.table.applied":
    "Fila destacada: {row}{column}{interval}.",
  "ui.dice.result.table.column": ", columna {column}",
  "ui.dice.result.table.interval": ", intervalo {interval}",
  "ui.dice.result.calc.target": "Objetivo: {target}.",
  "ui.dice.result.calc.bases": "Bases: {bases}.",
  "ui.dice.result.calc.modifiers": "Modificadores: {modifiers}.",
  "ui.dice.result.calc.formula": "Fórmula: {formula}.",
  "ui.dice.result.calc.comparison": "Comparación: {comparison}.",
  "ui.dice.result.announcement":
    "Tirada resuelta. Caras: {faces}. Efecto: {effect}.",
  "ui.dice.stale":
    "La tirada ha quedado obsoleta porque la partida cambió; ciérrala y vuelve a intentarlo.",

  // --- Detección de capacidades (Tarea 21.1, requisitos 31.3, 31.4, 31.7) ---
  "ui.capability.installability": "Instalación como aplicación (PWA)",
  "ui.capability.indexeddb": "Almacenamiento local de partidas (IndexedDB)",
  "ui.capability.offline": "Funcionamiento sin conexión (service worker y caché)",
  "ui.capability.touch": "Interacción táctil de un solo puntero",
  "ui.capability.blocked":
    "No se puede iniciar una Partida porque faltan capacidades obligatorias. Revisa la lista de capacidades ausentes antes de continuar.",
  "ui.capability.export-available":
    "Puedes exportar las partidas ya almacenadas aunque el inicio esté bloqueado.",

  // --- Nombres accesibles: bando (Tarea 21.1, requisito 25.1, 25.4) ---
  "a11y.side.british": "Bando británico",
  "a11y.side.german": "Bando alemán",
  "a11y.side.neutral": "Elemento neutral",

  // --- Nombres accesibles: estado de Ficha (25.1, 25.4) ---
  "a11y.status.active": "Ficha activa",
  "a11y.status.eliminated": "Ficha eliminada",

  // --- Nombres accesibles: visibilidad (25.1, 25.4) ---
  "a11y.visibility.hidden": "Ficha oculta (Incógnita)",
  "a11y.visibility.revealed": "Ficha revelada",

  // --- Nombres accesibles: Moral (25.1, 25.4) ---
  "a11y.morale.normal": "Moral normal",
  "a11y.morale.low": "Moral baja",

  // --- Nombres accesibles: Orientación (requisitos 10.7, 25.1, 25.4) ---
  "a11y.orientation.facing": "Orientada hacia {direction}",

  // --- Nombres accesibles: terreno (requisitos 10.7, 25.1, 25.4) ---
  "a11y.terrain.clear": "Terreno despejado",
  "a11y.terrain.forest": "Bosque",
  "a11y.terrain.building": "Edificio",
  "a11y.terrain.hill": "Colina",
  "a11y.terrain.river": "Río",
  "a11y.terrain.unknown": "Terreno sin identificar",

  // --- Nombres accesibles: selección (25.1, 25.5) ---
  "a11y.selection.unselected": "Sin seleccionar",
  "a11y.selection.selected": "Seleccionado, pendiente de confirmar",
  "a11y.selection.confirmed": "Selección confirmada",

  // --- Nombres accesibles: resultado (25.1, 25.7) ---
  "a11y.result.hit": "Resultado: impacto",
  "a11y.result.miss": "Resultado: fallo",
  "a11y.result.blocked": "Resultado: acción bloqueada",

  // --- Bloqueo local (Tarea 23.2, requisitos 26.11, 26.13, 26.14) ---
  "ui.local-lock.title": "Bloqueo local",
  "ui.local-lock.locked.description":
    "Introduce el mismo usuario y clave del acceso en línea para mostrar tus Partidas y las reglas.",
  "ui.local-lock.username.label": "Usuario",
  "ui.local-lock.key.label": "Clave",
  "ui.local-lock.action.unlock": "Desbloquear",
  "ui.local-lock.error.invalid":
    "El usuario o la clave no coinciden. Inténtalo de nuevo.",
  "ui.local-lock.notice.interface-only":
    "El Bloqueo local solo oculta la Interfaz: no cifra los datos guardados en el dispositivo (IndexedDB ni Cache Storage) ni ofrece confidencialidad frente a quien controla el dispositivo.",
  "ui.local-lock.notice.no-revocation":
    "La autenticación en línea no puede revocar el acceso a las copias ya descargadas ni volverlas inaccesibles en este dispositivo.",
});
