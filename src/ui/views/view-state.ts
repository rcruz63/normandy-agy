/**
 * `ViewState` independiente del dominio y sus operaciones puras (Tarea 20.3).
 *
 * El diseño (§ «Interacción y presentación del mapa») fija que **zoom, paneo,
 * cambio de Orientación de pantalla, cambio de tamaño de la ventana, selección
 * de UI y posición de lectura de los registros** son estado de vista, no de
 * dominio. Esta separación materializa los requisitos:
 *
 * - 20.8: al cambiar entre el Registro simple y el detallado se conserva el
 *   Estado de partida y la **posición de lectura** de cada registro.
 * - 24.6: al ampliar, reducir o desplazar el mapa se conservan la **selección**
 *   y el Estado de partida.
 * - 24.7 / 24.8: los cambios de Orientación vertical/horizontal no pierden
 *   estado.
 * - 24.9: los cambios de tamaño de ventana adaptan la presentación sin perder
 *   Estado de partida.
 *
 * INVARIANTE CRÍTICA: este módulo **no importa ni referencia `GameState`**. El
 * `GameState` vive en `src/domain/engine/state.ts` y su documentación declara
 * que nunca contiene estado de vista; aquí se cumple la otra mitad del
 * contrato: `ViewState` nunca contiene estado de dominio. Las operaciones son
 * funciones puras que devuelven un nuevo `ViewState` congelado y **conservan la
 * selección** salvo cuando la operación es explícitamente de selección.
 *
 * Frontera de capa: pertenece a `ui/`, que solo transforma proyecciones. No
 * usa DOM, red ni reloj: recibe magnitudes ya medidas (tamaño de viewport,
 * Orientación detectada) como argumentos y produce datos serializables.
 *
 * Las referencias a Hexágonos y Fichas usan los identificadores opacos del
 * dominio (`HexId`, `PieceId`) para que la selección sea coherente con el
 * Catálogo, sin acoplar el estado de vista a la lógica de reglas.
 */
import type { HexId, PieceId } from "../../domain/geometry/index.js";

/** Orientación física de la pantalla detectada por la capa de adaptación. */
export type ScreenOrientation = "portrait" | "landscape";

/** Registro cuya posición de lectura se conserva de forma independiente. */
export type LogKind = "simple" | "detailed";

/**
 * Selección de UI actual. Un Hexágono, una Ficha, ambos (Ficha situada sobre
 * un Hexágono) o ninguno. La selección es estado de vista: no altera el
 * dominio y se conserva ante zoom/paneo/orientación/tamaño (requisito 24.6).
 */
export type ViewSelection = Readonly<{
  hexId?: HexId;
  pieceId?: PieceId;
}>;

/** Nivel de acercamiento y desplazamiento de la cámara sobre el mapa. */
export type Camera = Readonly<{
  /** Factor de zoom (1 = ajuste base). Acotado a [minZoom, maxZoom]. */
  zoom: number;
  /** Desplazamiento horizontal en unidades del lienzo del mapa. */
  panX: number;
  /** Desplazamiento vertical en unidades del lienzo del mapa. */
  panY: number;
}>;

/** Tamaño del viewport en Píxeles CSS (medido por la capa de adaptación). */
export type ViewportSize = Readonly<{
  width: number;
  height: number;
}>;

/**
 * Estado de vista completo, independiente del `GameState`.
 *
 * `readingPositions` guarda una posición de lectura por registro para poder
 * alternar entre el simple y el detallado sin perder el punto de lectura
 * (requisito 20.8, 20.8-lectura). `orientation` refleja la Orientación de
 * pantalla vigente y `viewport` el tamaño adaptado.
 */
export type ViewState = Readonly<{
  camera: Camera;
  selection: ViewSelection;
  orientation: ScreenOrientation;
  viewport: ViewportSize;
  activeLog: LogKind;
  readingPositions: Readonly<Record<LogKind, number>>;
}>;

/** Límites y pasos de las operaciones de cámara. */
export type ViewLimits = Readonly<{
  minZoom: number;
  maxZoom: number;
}>;

/** Límites por defecto: acercamiento entre 0,25× y 8×. */
export const DEFAULT_VIEW_LIMITS: ViewLimits = Object.freeze({
  minZoom: 0.25,
  maxZoom: 8,
});

/** Error lanzado por los constructores/operaciones ante datos inválidos. */
export class InvalidViewStateError extends Error {
  public readonly field: string;
  public readonly detail: string;

  public constructor(field: string, detail: string) {
    super(`Estado de vista inválido en «${field}»: ${detail}.`);
    this.name = "InvalidViewStateError";
    this.field = field;
    this.detail = detail;
  }
}

function assertFinite(field: string, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidViewStateError(field, "debe ser un número finito");
  }
}

function assertPositive(field: string, value: number): void {
  assertFinite(field, value);
  if (value <= 0) {
    throw new InvalidViewStateError(field, "debe ser mayor que cero");
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function freezeSelection(selection: ViewSelection): ViewSelection {
  const base: { hexId?: HexId; pieceId?: PieceId } = {};
  if (selection.hexId !== undefined) base.hexId = selection.hexId;
  if (selection.pieceId !== undefined) base.pieceId = selection.pieceId;
  return Object.freeze(base);
}

function freezeCamera(camera: Camera, limits: ViewLimits): Camera {
  assertFinite("camera.panX", camera.panX);
  assertFinite("camera.panY", camera.panY);
  assertPositive("camera.zoom", camera.zoom);
  return Object.freeze({
    zoom: clamp(camera.zoom, limits.minZoom, limits.maxZoom),
    panX: camera.panX,
    panY: camera.panY,
  });
}

/** Entrada del constructor {@link viewState}. */
export type ViewStateInput = Readonly<{
  camera?: Camera;
  selection?: ViewSelection;
  orientation?: ScreenOrientation;
  viewport: ViewportSize;
  activeLog?: LogKind;
  readingPositions?: Partial<Record<LogKind, number>>;
}>;

/**
 * Construye un {@link ViewState} inmutable a partir de un tamaño de viewport y
 * valores opcionales. Aplica los límites indicados (o los de por defecto) y
 * congela cada subobjeto.
 */
export function viewState(
  input: ViewStateInput,
  limits: ViewLimits = DEFAULT_VIEW_LIMITS,
): ViewState {
  assertPositive("viewport.width", input.viewport.width);
  assertPositive("viewport.height", input.viewport.height);
  if (limits.minZoom <= 0 || limits.maxZoom < limits.minZoom) {
    throw new InvalidViewStateError(
      "limits",
      "minZoom debe ser positivo y maxZoom ≥ minZoom",
    );
  }

  const camera = freezeCamera(
    input.camera ?? { zoom: 1, panX: 0, panY: 0 },
    limits,
  );
  const orientation: ScreenOrientation =
    input.orientation ??
    (input.viewport.width >= input.viewport.height ? "landscape" : "portrait");

  const simple = input.readingPositions?.simple ?? 0;
  const detailed = input.readingPositions?.detailed ?? 0;
  assertFinite("readingPositions.simple", simple);
  assertFinite("readingPositions.detailed", detailed);

  return Object.freeze({
    camera,
    selection: freezeSelection(input.selection ?? {}),
    orientation,
    viewport: Object.freeze({
      width: input.viewport.width,
      height: input.viewport.height,
    }),
    activeLog: input.activeLog ?? "simple",
    readingPositions: Object.freeze({
      simple: Math.max(0, simple),
      detailed: Math.max(0, detailed),
    }),
  });
}

// --- Operaciones puras sobre el estado de vista ---
// Todas devuelven un ViewState nuevo y CONSERVAN la selección (salvo `select`).

/** Ajusta el zoom a un valor absoluto, acotado por los límites. Conserva selección. */
export function setZoom(
  state: ViewState,
  zoom: number,
  limits: ViewLimits = DEFAULT_VIEW_LIMITS,
): ViewState {
  assertPositive("zoom", zoom);
  return Object.freeze({
    ...state,
    camera: freezeCamera({ ...state.camera, zoom }, limits),
  });
}

/** Aplica un factor multiplicativo al zoom actual. Conserva selección. */
export function zoomBy(
  state: ViewState,
  factor: number,
  limits: ViewLimits = DEFAULT_VIEW_LIMITS,
): ViewState {
  assertPositive("factor", factor);
  return setZoom(state, state.camera.zoom * factor, limits);
}

/** Desplaza la cámara por un delta relativo. Conserva selección. */
export function panBy(
  state: ViewState,
  deltaX: number,
  deltaY: number,
  limits: ViewLimits = DEFAULT_VIEW_LIMITS,
): ViewState {
  assertFinite("deltaX", deltaX);
  assertFinite("deltaY", deltaY);
  return Object.freeze({
    ...state,
    camera: freezeCamera(
      { ...state.camera, panX: state.camera.panX + deltaX, panY: state.camera.panY + deltaY },
      limits,
    ),
  });
}

/** Fija el desplazamiento absoluto de la cámara. Conserva selección. */
export function panTo(
  state: ViewState,
  panX: number,
  panY: number,
  limits: ViewLimits = DEFAULT_VIEW_LIMITS,
): ViewState {
  return Object.freeze({
    ...state,
    camera: freezeCamera({ ...state.camera, panX, panY }, limits),
  });
}

/**
 * Aplica una Orientación de pantalla. Conserva selección, cámara, registros y
 * posiciones de lectura (requisitos 24.7, 24.8): un giro de dispositivo no
 * pierde estado de vista ni, por construcción, estado de dominio.
 */
export function setOrientation(
  state: ViewState,
  orientation: ScreenOrientation,
): ViewState {
  if (orientation !== "portrait" && orientation !== "landscape") {
    throw new InvalidViewStateError("orientation", "debe ser portrait|landscape");
  }
  if (orientation === state.orientation) return state;
  return Object.freeze({ ...state, orientation });
}

/**
 * Adapta el tamaño del viewport. Conserva selección, cámara y registros
 * (requisito 24.9). Si no se fija Orientación explícita, la deriva del nuevo
 * tamaño; la selección nunca se toca.
 */
export function resizeViewport(
  state: ViewState,
  viewport: ViewportSize,
  orientation?: ScreenOrientation,
): ViewState {
  assertPositive("viewport.width", viewport.width);
  assertPositive("viewport.height", viewport.height);
  const nextOrientation: ScreenOrientation =
    orientation ?? (viewport.width >= viewport.height ? "landscape" : "portrait");
  return Object.freeze({
    ...state,
    viewport: Object.freeze({ width: viewport.width, height: viewport.height }),
    orientation: nextOrientation,
  });
}

/**
 * Cambia la selección de UI. Es la única operación que modifica la selección;
 * no toca cámara, orientación ni registros. Pasar `{}` deselecciona.
 */
export function select(state: ViewState, selection: ViewSelection): ViewState {
  return Object.freeze({ ...state, selection: freezeSelection(selection) });
}

/** Deselecciona sin tocar el resto del estado de vista. */
export function clearSelection(state: ViewState): ViewState {
  return select(state, {});
}

/**
 * Alterna el registro activo conservando la posición de lectura de cada uno
 * (requisito 20.8). No modifica cámara, selección ni orientación.
 */
export function switchLog(state: ViewState, log: LogKind): ViewState {
  if (log !== "simple" && log !== "detailed") {
    throw new InvalidViewStateError("log", "debe ser simple|detailed");
  }
  if (log === state.activeLog) return state;
  return Object.freeze({ ...state, activeLog: log });
}

/**
 * Registra la posición de lectura del registro indicado. Conserva la posición
 * del otro registro y el resto del estado de vista (requisito 20.8).
 */
export function setReadingPosition(
  state: ViewState,
  log: LogKind,
  position: number,
): ViewState {
  if (log !== "simple" && log !== "detailed") {
    throw new InvalidViewStateError("log", "debe ser simple|detailed");
  }
  assertFinite("position", position);
  const next = Math.max(0, position);
  if (state.readingPositions[log] === next) return state;
  return Object.freeze({
    ...state,
    readingPositions: Object.freeze({
      ...state.readingPositions,
      [log]: next,
    }),
  });
}
