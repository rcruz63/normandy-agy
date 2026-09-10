/**
 * `DiceRollDialog`: modelo de presentación puro del Componente de tirada
 * (Tarea 20.4, diseño §3 y §8, requisitos 20.10-20.12, 24, 25 y 41).
 *
 * Es la ÚNICA presentación de una {@link DiceRollRequest}. El diálogo NO genera
 * aleatoriedad ni interpreta reglas: recoge la elección del Jugador y produce un
 * {@link DiceRollInput} para el {@link DiceRollCoordinator}, y muestra la
 * {@link DiceOutcomeProjection} que el dominio devuelve. Se modela como una
 * MÁQUINA DE ESTADO inmutable (oculto → recogiendo entrada → resolviendo →
 * resuelto) más una capa fina de proyección/render que emite markup accesible;
 * ninguna transición usa `Math.random`, DOM, IndexedDB, red ni reloj.
 *
 * Puntos de contrato cubiertos:
 * - Cantidad variable de dados en el orden declarado `request.diceOrder`, sin
 *   asumir 2d6 (41.5, 41.32).
 * - Selector Automático/Manual en CADA aparición, con la última preferencia
 *   LOCAL fuera de `GameState` como selección inicial (41.6, 41.7).
 * - En Manual, una cara entera por dado en `1..sides`; prevalidación estructural
 *   para feedback, sin ser autoridad (la validación real la hace el Coordinador;
 *   41.9, 41.10).
 * - Proyección de resultado: variante `table` con fila/columna/intervalo
 *   destacados; variante `calculation` con objetivo/bases/modificadores con
 *   signo/fórmula/comparación; y el efecto (41.16, 41.17).
 * - Accesibilidad: `aria-live` para el resultado, equivalente textual, objetivos
 *   táctiles 44×44 px CSS, 200 %, orientación vertical/horizontal, tacto/ratón/
 *   teclado; funciona sin conexión (24.4, 25.3-25.6, 41.25-41.31).
 * - Animación de rotación de cada dado hasta su cara efectiva, pero el commit es
 *   INDEPENDIENTE de `animationend`; `prefers-reduced-motion` suprime la
 *   animación conservando el mismo texto (41.18, 41.19, 41.20).
 * - Cerrar ANTES de resolver cancela la solicitud sin commit ni consumo; cerrar
 *   DESPUÉS solo oculta el diálogo sin deshacer el efecto (41.21, 41.22).
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Presentación pura. Usa los TIPOS del
 * dominio y el resultado del Coordinador (capa de aplicación); no importa
 * IndexedDB, red ni reloj. La preferencia local vive fuera del `GameState`.
 */
import type {
  Comparison,
  DiceOutcomeProjection,
  DiceRollInput,
  DiceRollRequest,
  DiceRollResolution,
  DiceRollSource,
  NamedValue,
  SignedModifier,
} from "../../domain/engine/dice-roll.js";
import { formatNumber } from "../locale/intl-formatters.js";
import { resolveMessageKey } from "../locale/message-resolver.js";
import {
  MESSAGES_ES_ES,
  type MessageCatalog,
} from "../locale/messages-es-ES.js";

// --- Preferencia local (fuera de GameState, requisito 41.7) ---

/**
 * Última preferencia de Modo de tirada. Es estado LOCAL de la Interfaz: nunca
 * entra en `GameState`, en las reglas ni en los datos de reproducción (41.7).
 * Solo determina la selección inicial de la siguiente aparición del diálogo.
 */
export type DiceRollPreference = Readonly<{
  lastSource: DiceRollSource;
}>;

/** Preferencia por defecto de una Interfaz sin historial: Automático. */
export const DEFAULT_DICE_ROLL_PREFERENCE: DiceRollPreference = Object.freeze({
  lastSource: "automatic",
});

/** Deriva la nueva preferencia local tras elegir un Modo (41.7). */
export function rememberPreference(source: DiceRollSource): DiceRollPreference {
  return Object.freeze({ lastSource: source });
}

// --- Estado del diálogo (máquina de estado inmutable, diseño §8) ---

/**
 * Estado del Componente de tirada. Modela exactamente las fases del diseño §8:
 *
 * - `hidden`: sin Tirada pendiente; el diálogo no se muestra.
 * - `pending-entry`: hay una solicitud; se muestran los dados en orden y el
 *   selector Automático/Manual. En Manual se recogen las caras físicas.
 * - `resolving`: el Jugador confirmó; se envió la entrada al Coordinador y los
 *   dados animan la rotación. El commit NO depende de esta fase (41.19, 41.20).
 * - `resolved`: el dominio devolvió una proyección; se muestran caras y efecto.
 *
 * En Manual, `manualFaces` guarda una entrada por dado en el ORDEN DECLARADO
 * (`request.diceOrder`); `undefined` marca un dado sin cara asignada aún.
 */
export type DiceRollDialogState =
  | Readonly<{ kind: "hidden" }>
  | Readonly<{
      kind: "pending-entry";
      request: DiceRollRequest;
      selectedSource: DiceRollSource;
      manualFaces: readonly (number | undefined)[];
    }>
  | Readonly<{
      kind: "resolving";
      request: DiceRollRequest;
      source: DiceRollSource;
      manualFaces: readonly (number | undefined)[];
    }>
  | Readonly<{
      kind: "resolved";
      request: DiceRollRequest;
      resolution: DiceRollResolution;
      outcome: DiceOutcomeProjection;
    }>;

/** Estado inicial: diálogo oculto. */
export const HIDDEN_DIALOG: DiceRollDialogState = Object.freeze({
  kind: "hidden" as const,
});

/**
 * Resultado de intentar confirmar la entrada en `pending-entry`. `ready` indica
 * que la prevalidación estructural pasó y transporta el `DiceRollInput` que la
 * Interfaz debe entregar al Coordinador junto al nuevo estado `resolving`.
 * `blocked` indica que la confirmación no debe habilitarse todavía (41.9, 41.10).
 */
export type DiceRollSubmission =
  | Readonly<{
      status: "ready";
      input: DiceRollInput;
      state: DiceRollDialogState;
    }>
  | Readonly<{ status: "blocked"; state: DiceRollDialogState }>;

/** Resultado de cerrar el diálogo: distingue los dos cierres del diseño §8. */
export type DiceRollCloseOutcome =
  | Readonly<{ action: "cancel"; requestId: DiceRollRequest["id"]; state: DiceRollDialogState }>
  | Readonly<{ action: "dismiss"; state: DiceRollDialogState }>
  | Readonly<{ action: "none"; state: DiceRollDialogState }>;

// --- Transiciones puras de la máquina de estado ---

/**
 * Abre el diálogo para una nueva Tirada pendiente. La selección inicial adopta
 * la última preferencia LOCAL (41.6, 41.7); Manual arranca con una cara sin
 * asignar por dado, en el orden declarado (41.5, 41.9).
 */
export function openDialog(
  request: DiceRollRequest,
  preference: DiceRollPreference = DEFAULT_DICE_ROLL_PREFERENCE,
): DiceRollDialogState {
  return Object.freeze({
    kind: "pending-entry" as const,
    request,
    selectedSource: preference.lastSource,
    manualFaces: Object.freeze(
      new Array<number | undefined>(request.domain.count).fill(undefined),
    ),
  });
}

/**
 * Cambia el Modo de tirada seleccionado en `pending-entry`. Es idempotente y no
 * borra las caras ya introducidas (permite alternar Automático/Manual sin
 * perder trabajo). Fuera de `pending-entry` no tiene efecto.
 */
export function selectSource(
  state: DiceRollDialogState,
  source: DiceRollSource,
): DiceRollDialogState {
  if (state.kind !== "pending-entry" || state.selectedSource === source) {
    return state;
  }
  return Object.freeze({
    kind: "pending-entry" as const,
    request: state.request,
    selectedSource: source,
    manualFaces: state.manualFaces,
  });
}

/**
 * Asigna (o borra, con `undefined`) la cara física del dado situado en la
 * posición `orderIndex` del orden declarado. No valida el rango aquí de forma
 * autoritativa: la prevalidación estructural para habilitar la confirmación la
 * hace {@link isManualEntryComplete}/{@link submit} y la validación definitiva
 * el Coordinador (41.10). Fuera de `pending-entry`, sin efecto.
 */
export function setManualFace(
  state: DiceRollDialogState,
  orderIndex: number,
  face: number | undefined,
): DiceRollDialogState {
  if (state.kind !== "pending-entry") {
    return state;
  }
  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex >= state.manualFaces.length) {
    return state;
  }
  const next = [...state.manualFaces];
  next[orderIndex] = face;
  return Object.freeze({
    kind: "pending-entry" as const,
    request: state.request,
    selectedSource: state.selectedSource,
    manualFaces: Object.freeze(next),
  });
}

/**
 * ¿Una cara manual es estructuralmente válida para un dado de `sides` caras?
 * Prevalidación de feedback (entero en `1..sides`); no sustituye al Coordinador.
 */
export function isValidManualFace(face: number | undefined, sides: number): boolean {
  return (
    typeof face === "number" &&
    Number.isInteger(face) &&
    face >= 1 &&
    face <= sides
  );
}

/**
 * ¿Todas las caras manuales están asignadas y en rango? Habilita la
 * confirmación en Manual (41.9). En Automático no se requieren caras.
 */
export function isManualEntryComplete(state: DiceRollDialogState): boolean {
  if (state.kind !== "pending-entry") {
    return false;
  }
  const { sides } = state.request.domain;
  return state.manualFaces.every((face) => isValidManualFace(face, sides));
}

/**
 * ¿Puede habilitarse la confirmación? Automático siempre; Manual solo con la
 * entrada estructural completa (41.9, 41.10).
 */
export function canSubmit(state: DiceRollDialogState): boolean {
  if (state.kind !== "pending-entry") {
    return false;
  }
  return state.selectedSource === "automatic" || isManualEntryComplete(state);
}

/**
 * Intenta confirmar la entrada. En Automático produce `{source:"automatic"}`.
 * En Manual, si la prevalidación estructural pasa, produce
 * `{source:"manual"; faces}` con las caras en el orden declarado; si no, queda
 * `blocked` sin transición (41.9, 41.10). Con éxito pasa a `resolving`.
 */
export function submit(state: DiceRollDialogState): DiceRollSubmission {
  if (state.kind !== "pending-entry" || !canSubmit(state)) {
    return Object.freeze({ status: "blocked" as const, state });
  }
  const input: DiceRollInput =
    state.selectedSource === "manual"
      ? Object.freeze({
          source: "manual" as const,
          faces: Object.freeze(state.manualFaces.map((face) => face as number)),
        })
      : Object.freeze({ source: "automatic" as const });

  const next: DiceRollDialogState = Object.freeze({
    kind: "resolving" as const,
    request: state.request,
    source: state.selectedSource,
    manualFaces: state.manualFaces,
  });
  return Object.freeze({ status: "ready" as const, input, state: next });
}

/**
 * Aplica la resolución producida por el Coordinador (Motor). Transita a
 * `resolved` con la proyección de dominio. El commit lo realiza la unidad de
 * trabajo; esta transición solo refleja el resultado ya confirmado y es
 * INDEPENDIENTE de `animationend` (41.19, 41.20). Solo aplica desde `resolving`
 * o `pending-entry` cuya solicitud coincida.
 */
export function applyResolution(
  state: DiceRollDialogState,
  resolution: DiceRollResolution,
  outcome: DiceOutcomeProjection,
): DiceRollDialogState {
  const request =
    state.kind === "resolving" || state.kind === "pending-entry"
      ? state.request
      : undefined;
  if (request === undefined || resolution.requestId !== request.id) {
    return state;
  }
  return Object.freeze({
    kind: "resolved" as const,
    request,
    resolution,
    outcome,
  });
}

/**
 * Vuelve a `pending-entry` cuando el Coordinador rechaza una entrada manual
 * inválida (`invalid-roll-input`) o una resolución obsoleta durante `resolving`,
 * conservando las caras introducidas para corregirlas (41.10). Si no hay dónde
 * volver, se mantiene el estado.
 */
export function returnToEntry(
  state: DiceRollDialogState,
): DiceRollDialogState {
  if (state.kind === "resolving") {
    return Object.freeze({
      kind: "pending-entry" as const,
      request: state.request,
      selectedSource: state.source,
      manualFaces: state.manualFaces,
    });
  }
  return state;
}

/**
 * Cierra el diálogo distinguiendo los dos cierres del diseño §8 (41.21, 41.22):
 *
 * - En `pending-entry`/`resolving` (antes de una resolución válida): `cancel`.
 *   La Interfaz debe invocar `DiceRollCoordinator.cancel(requestId)`; no hay
 *   commit, consumo ni registro y no cambia la posición aleatoria.
 * - En `resolved` (después de confirmar): `dismiss`. Solo oculta el diálogo; el
 *   efecto, los registros y el Estado aleatorio confirmados se conservan.
 * - En `hidden`: `none`.
 *
 * En todos los casos el nuevo estado es {@link HIDDEN_DIALOG}.
 */
export function closeDialog(state: DiceRollDialogState): DiceRollCloseOutcome {
  if (state.kind === "pending-entry" || state.kind === "resolving") {
    return Object.freeze({
      action: "cancel" as const,
      requestId: state.request.id,
      state: HIDDEN_DIALOG,
    });
  }
  if (state.kind === "resolved") {
    return Object.freeze({ action: "dismiss" as const, state: HIDDEN_DIALOG });
  }
  return Object.freeze({ action: "none" as const, state: HIDDEN_DIALOG });
}

// --- Proyección de presentación (view-model textual, es-ES) ---

/** Un dado proyectado en el orden declarado, con su cara efectiva si existe. */
export type DiceView = Readonly<{
  /** Posición en el orden declarado (`request.diceOrder`), base 1 para el texto. */
  position: number;
  /** Índice en el orden declarado (base 0), para enlazar controles. */
  orderIndex: number;
  /** Índice físico del dado dentro del dominio (`diceOrder[orderIndex]`). */
  dieIndex: number;
  sides: number;
  /** Cara asignada/efectiva, o `undefined` si aún no hay. */
  face?: number;
  /** Nombre accesible es-ES del dado. */
  accessibleName: string;
  /** ¿La prevalidación estructural marca esta cara como inválida (Manual)? */
  invalid: boolean;
}>;

/** Modo del selector con su etiqueta y estado seleccionado (es-ES). */
export type ModeOptionView = Readonly<{
  source: DiceRollSource;
  label: string;
  hint: string;
  selected: boolean;
}>;

/** Proyección de la variante `table` de la {@link DiceOutcomeProjection}. */
export type TableOutcomeView = Readonly<{
  kind: "table";
  tableId: string;
  rows: readonly Readonly<{
    rowId: string;
    applied: boolean;
    cells: Readonly<Record<string, string | number>>;
  }>[];
  appliedRowId: string;
  appliedColumnId?: string;
  appliedInterval?: string;
  appliedSummary: string;
  effect: string;
}>;

/** Proyección de la variante `calculation` de la {@link DiceOutcomeProjection}. */
export type CalculationOutcomeView = Readonly<{
  kind: "calculation";
  target: string;
  bases: readonly string[];
  modifiers: readonly string[];
  formula: string;
  comparison: string;
  effect: string;
}>;

/** Proyección del resultado (caras + efecto + detalle de tabla/cálculo). */
export type OutcomeView = Readonly<{
  faces: readonly number[];
  facesText: string;
  effect: string;
  /** Anuncio para la región `aria-live` (41.28). */
  announcement: string;
  detail: TableOutcomeView | CalculationOutcomeView;
}>;

/**
 * View-model completo del diálogo en un estado dado. Es la proyección que una
 * capa de render (DOM o cadena) consume; no contiene lógica de reglas. Incluye
 * los indicios de accesibilidad requeridos por §8 (tamaño táctil, `aria-live`).
 */
export type DiceRollDialogView =
  | Readonly<{ kind: "hidden" }>
  | Readonly<{
      kind: "entry";
      title: string;
      modeLegend: string;
      modes: readonly ModeOptionView[];
      selectedSource: DiceRollSource;
      dice: readonly DiceView[];
      /** Solo relevante en Manual: mensaje de ayuda de validación estructural. */
      manualHint?: string;
      canSubmit: boolean;
      resolveLabel: string;
      cancelLabel: string;
    }>
  | Readonly<{
      kind: "resolving";
      title: string;
      source: DiceRollSource;
      dice: readonly DiceView[];
      status: string;
      cancelLabel: string;
    }>
  | Readonly<{
      kind: "resolved";
      title: string;
      dice: readonly DiceView[];
      outcome: OutcomeView;
      closeLabel: string;
    }>;

/** Formatea un modificador con signo explícito (es-ES). */
function formatSignedModifier(modifier: SignedModifier): string {
  const sign = modifier.value >= 0 ? "+" : "−";
  return `${modifier.name} ${sign}${formatNumber(Math.abs(modifier.value))}`;
}

/** Formatea un valor base con nombre (es-ES). */
function formatBase(base: NamedValue): string {
  return `${base.name} ${formatNumber(base.value)}`;
}

/** Traduce la {@link Comparison} a un texto es-ES legible. */
const COMPARISON_ES: Readonly<Record<Comparison, string>> = Object.freeze({
  ">=": "mayor o igual que",
  ">": "mayor que",
  "<=": "menor o igual que",
  "<": "menor que",
  "==": "igual a",
});

/**
 * Proyecta los dados en el orden declarado. En `pending-entry`/`resolving` la
 * cara procede de `manualFaces` (Manual) y no hay caras en Automático hasta
 * resolver; en `resolved` las caras efectivas provienen de la resolución del
 * dominio, mapeadas al orden declarado. Cada dado lleva su nombre accesible
 * es-ES (41.5, 41.27).
 */
function projectDice(
  request: DiceRollRequest,
  faces: readonly (number | undefined)[],
  catalog: MessageCatalog,
  manual: boolean,
): readonly DiceView[] {
  const { count, sides } = request.domain;
  const views: DiceView[] = request.diceOrder.map((dieIndex, orderIndex) => {
    const position = orderIndex + 1;
    const face = faces[orderIndex];
    const invalid = manual && face !== undefined && !isValidManualFace(face, sides);
    const label = resolveMessageKey(
      "ui.dice.die.label",
      { position, count, sides },
      catalog,
    );
    const faceName =
      face !== undefined
        ? resolveMessageKey("ui.dice.die.face", { position, face }, catalog)
        : resolveMessageKey("ui.dice.die.pending", { position }, catalog);
    const base: {
      position: number;
      orderIndex: number;
      dieIndex: number;
      sides: number;
      face?: number;
      accessibleName: string;
      invalid: boolean;
    } = {
      position,
      orderIndex,
      dieIndex,
      sides,
      accessibleName: `${label}. ${faceName}`,
      invalid,
    };
    if (face !== undefined) base.face = face;
    return Object.freeze(base);
  });
  return Object.freeze(views);
}

/**
 * Ordena las caras efectivas de la resolución según el orden declarado de la
 * solicitud, para que la proyección de `resolved` muestre y anuncie las caras en
 * el mismo orden en que se representan los dados (41.5, 41.9).
 */
function orderedEffectiveFaces(
  request: DiceRollRequest,
  resolution: DiceRollResolution,
): readonly number[] {
  const faces = resolution.effectiveFaces;
  // effectiveFaces ya está en el orden efectivo del Consumo; se proyecta tal
  // cual respetando la longitud del dominio.
  return Object.freeze(faces.slice(0, request.domain.count));
}

/** Proyecta la {@link DiceOutcomeProjection} a su vista de detalle es-ES. */
function projectOutcomeDetail(
  outcome: DiceOutcomeProjection,
  catalog: MessageCatalog,
): TableOutcomeView | CalculationOutcomeView {
  const effect = resolveMessageKey(
    outcome.effect.messageKey,
    outcome.effect.params ?? {},
    catalog,
  );
  if (outcome.kind === "table") {
    const column =
      outcome.appliedColumnId !== undefined
        ? resolveMessageKey(
            "ui.dice.result.table.column",
            { column: outcome.appliedColumnId },
            catalog,
          )
        : "";
    const interval =
      outcome.appliedInterval !== undefined
        ? resolveMessageKey(
            "ui.dice.result.table.interval",
            { interval: outcome.appliedInterval },
            catalog,
          )
        : "";
    const appliedSummary = resolveMessageKey(
      "ui.dice.result.table.applied",
      { row: outcome.appliedRowId, column, interval },
      catalog,
    );
    const base: {
      kind: "table";
      tableId: string;
      rows: readonly Readonly<{
        rowId: string;
        applied: boolean;
        cells: Readonly<Record<string, string | number>>;
      }>[];
      appliedRowId: string;
      appliedColumnId?: string;
      appliedInterval?: string;
      appliedSummary: string;
      effect: string;
    } = {
      kind: "table",
      tableId: String(outcome.tableId),
      rows: Object.freeze(
        outcome.rows.map((row) =>
          Object.freeze({
            rowId: row.rowId,
            applied: row.rowId === outcome.appliedRowId,
            cells: row.cells,
          }),
        ),
      ),
      appliedRowId: outcome.appliedRowId,
      appliedSummary,
      effect,
    };
    if (outcome.appliedColumnId !== undefined) base.appliedColumnId = outcome.appliedColumnId;
    if (outcome.appliedInterval !== undefined) base.appliedInterval = outcome.appliedInterval;
    return Object.freeze(base);
  }
  return Object.freeze({
    kind: "calculation" as const,
    target: resolveMessageKey(
      "ui.dice.result.calc.target",
      { target: outcome.targetValue },
      catalog,
    ),
    bases: Object.freeze(outcome.baseValues.map(formatBase)),
    modifiers: Object.freeze(outcome.modifiers.map(formatSignedModifier)),
    formula: resolveMessageKey(
      "ui.dice.result.calc.formula",
      { formula: outcome.formula },
      catalog,
    ),
    comparison: resolveMessageKey(
      "ui.dice.result.calc.comparison",
      { comparison: COMPARISON_ES[outcome.comparison] },
      catalog,
    ),
    effect,
  });
}

/**
 * Proyecta un {@link DiceRollDialogState} a su {@link DiceRollDialogView}
 * textual en es-ES. Función pura: no muta el estado ni consulta el entorno.
 */
export function projectDialog(
  state: DiceRollDialogState,
  catalog: MessageCatalog = MESSAGES_ES_ES,
): DiceRollDialogView {
  if (state.kind === "hidden") {
    return Object.freeze({ kind: "hidden" as const });
  }

  const request = state.request;
  const title = resolveMessageKey(
    "ui.dice.title",
    { context: request.context.label },
    catalog,
  );

  if (state.kind === "pending-entry") {
    const manual = state.selectedSource === "manual";
    const modes: readonly ModeOptionView[] = Object.freeze(
      (["automatic", "manual"] as const).map((source) =>
        Object.freeze({
          source,
          label: resolveMessageKey(`ui.dice.mode.${source}`, {}, catalog),
          hint: resolveMessageKey(`ui.dice.mode.${source}.hint`, {}, catalog),
          selected: state.selectedSource === source,
        }),
      ),
    );
    const dice = projectDice(request, state.manualFaces, catalog, manual);
    const base: {
      kind: "entry";
      title: string;
      modeLegend: string;
      modes: readonly ModeOptionView[];
      selectedSource: DiceRollSource;
      dice: readonly DiceView[];
      manualHint?: string;
      canSubmit: boolean;
      resolveLabel: string;
      cancelLabel: string;
    } = {
      kind: "entry",
      title,
      modeLegend: resolveMessageKey("ui.dice.mode.legend", {}, catalog),
      modes,
      selectedSource: state.selectedSource,
      dice,
      canSubmit: canSubmit(state),
      resolveLabel: resolveMessageKey("ui.dice.action.resolve", {}, catalog),
      cancelLabel: resolveMessageKey("ui.dice.action.cancel", {}, catalog),
    };
    if (manual && !isManualEntryComplete(state)) {
      base.manualHint = resolveMessageKey(
        "ui.dice.manual.count",
        { count: request.domain.count },
        catalog,
      );
    }
    return Object.freeze(base);
  }

  if (state.kind === "resolving") {
    const manual = state.source === "manual";
    return Object.freeze({
      kind: "resolving" as const,
      title,
      source: state.source,
      dice: projectDice(request, state.manualFaces, catalog, manual),
      status: resolveMessageKey("ui.dice.resolving", {}, catalog),
      cancelLabel: resolveMessageKey("ui.dice.action.cancel", {}, catalog),
    });
  }

  // resolved
  const orderedFaces = orderedEffectiveFaces(request, state.resolution);
  const facesAsInput: readonly (number | undefined)[] = orderedFaces;
  const dice = projectDice(request, facesAsInput, catalog, false);
  const facesText = orderedFaces.map((face) => formatNumber(face)).join(", ");
  const detail = projectOutcomeDetail(state.outcome, catalog);
  const effect = detail.effect;
  const announcement = resolveMessageKey(
    "ui.dice.result.announcement",
    { faces: facesText, effect },
    catalog,
  );
  const outcome: OutcomeView = Object.freeze({
    faces: orderedFaces,
    facesText: resolveMessageKey("ui.dice.result.faces", { faces: facesText }, catalog),
    effect: resolveMessageKey("ui.dice.result.effect", { effect }, catalog),
    announcement,
    detail,
  });
  return Object.freeze({
    kind: "resolved" as const,
    title,
    dice,
    outcome,
    closeLabel: resolveMessageKey("ui.dice.action.close", {}, catalog),
  });
}
