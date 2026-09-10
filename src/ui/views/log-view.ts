/**
 * Estado de vista de los registros de la Interfaz (Tarea 20.5, requisitos 20.8,
 * 20.9, 3.2, 3.3).
 *
 * Modela el `ViewState` del panel de registros como valor inmutable, SEPARADO
 * del Estado de partida (el dominio no participa aquí). Ofrece transiciones
 * puras que:
 *
 * - alternan entre Registro simple y Registro detallado CONSERVANDO la posición
 *   de lectura de cada registro por separado (20.8): al volver a un registro se
 *   restaura exactamente donde estaba;
 * - expanden y contraen entradas concretas del Registro detallado sin eliminar
 *   contenido (20.9), recordando qué entradas están expandidas por su secuencia.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Es puro; no lee ni escribe `GameState`,
 * registros del dominio, DOM, IndexedDB, red ni reloj. Cada transición devuelve
 * un nuevo `LogViewState` congelado sin mutar el recibido (soporta la Propiedad
 * 22: estado de vista independiente del dominio).
 */

/** Pestaña de registro activa en la Interfaz (20.8). */
export type LogTab = "simple" | "detailed";

/**
 * Estado de vista de los registros. `readingPosition` guarda la posición de
 * lectura (p. ej. desplazamiento vertical o índice de la primera entrada
 * visible) de CADA registro por separado (20.8). `expandedDetailedSequences`
 * recuerda qué entradas del Registro detallado están expandidas (20.9),
 * identificadas por su número de secuencia por Partida.
 */
export type LogViewState = Readonly<{
  activeTab: LogTab;
  readingPosition: Readonly<Record<LogTab, number>>;
  expandedDetailedSequences: readonly number[];
}>;

/** Posición de lectura inicial de un registro recién abierto. */
const INITIAL_READING_POSITION = 0;

/**
 * Crea el estado de vista inicial de los registros. Ambos registros arrancan al
 * inicio y sin entradas detalladas expandidas.
 */
export function createLogViewState(
  activeTab: LogTab = "simple",
): LogViewState {
  return Object.freeze({
    activeTab,
    readingPosition: Object.freeze({
      simple: INITIAL_READING_POSITION,
      detailed: INITIAL_READING_POSITION,
    }),
    expandedDetailedSequences: Object.freeze([]),
  });
}

/**
 * Cambia el registro activo (20.8). Conserva la posición de lectura de ambos
 * registros y el conjunto de entradas expandidas: cambiar de pestaña no altera
 * la lectura ni el detalle, solo cuál se muestra. Cambiar a la pestaña ya activa
 * devuelve el mismo estado. No muta el estado recibido.
 */
export function switchLogTab(state: LogViewState, tab: LogTab): LogViewState {
  if (state.activeTab === tab) {
    return state;
  }
  return Object.freeze({
    activeTab: tab,
    readingPosition: state.readingPosition,
    expandedDetailedSequences: state.expandedDetailedSequences,
  });
}

/**
 * Registra la posición de lectura del registro ACTIVO (20.8). El otro registro
 * conserva su posición intacta. `position` debe ser un entero no negativo; un
 * valor inválido devuelve el mismo estado sin cambios (fail-safe: la vista no
 * corrompe su lectura por una entrada espuria).
 */
export function setReadingPosition(
  state: LogViewState,
  position: number,
): LogViewState {
  if (!Number.isInteger(position) || position < 0) {
    return state;
  }
  if (state.readingPosition[state.activeTab] === position) {
    return state;
  }
  return Object.freeze({
    activeTab: state.activeTab,
    readingPosition: Object.freeze({
      ...state.readingPosition,
      [state.activeTab]: position,
    }),
    expandedDetailedSequences: state.expandedDetailedSequences,
  });
}

/** Indica si una entrada detallada está expandida (20.9). */
export function isDetailedEntryExpanded(
  state: LogViewState,
  sequence: number,
): boolean {
  return state.expandedDetailedSequences.includes(sequence);
}

/**
 * Expande una entrada del Registro detallado (20.9). Si ya está expandida,
 * devuelve el mismo estado. No elimina contenido: solo marca la entrada como
 * expandida. El conjunto se mantiene ordenado para una proyección estable.
 */
export function expandDetailedEntry(
  state: LogViewState,
  sequence: number,
): LogViewState {
  if (isDetailedEntryExpanded(state, sequence)) {
    return state;
  }
  const expanded = [...state.expandedDetailedSequences, sequence].sort(
    (a, b) => a - b,
  );
  return Object.freeze({
    activeTab: state.activeTab,
    readingPosition: state.readingPosition,
    expandedDetailedSequences: Object.freeze(expanded),
  });
}

/**
 * Contrae una entrada del Registro detallado (20.9). Si no estaba expandida,
 * devuelve el mismo estado. No elimina contenido: solo deja de mostrarlo
 * expandido.
 */
export function collapseDetailedEntry(
  state: LogViewState,
  sequence: number,
): LogViewState {
  if (!isDetailedEntryExpanded(state, sequence)) {
    return state;
  }
  const expanded = state.expandedDetailedSequences.filter(
    (value) => value !== sequence,
  );
  return Object.freeze({
    activeTab: state.activeTab,
    readingPosition: state.readingPosition,
    expandedDetailedSequences: Object.freeze(expanded),
  });
}

/** Alterna expandir/contraer una entrada detallada (20.9). */
export function toggleDetailedEntry(
  state: LogViewState,
  sequence: number,
): LogViewState {
  return isDetailedEntryExpanded(state, sequence)
    ? collapseDetailedEntry(state, sequence)
    : expandDetailedEntry(state, sequence);
}
