/**
 * Capa fina de render del {@link DiceRollDialog} (Tarea 20.4, diseño §8).
 *
 * Emite el markup del Componente de tirada como CADENA, igual que
 * `map-view.ts` emite SVG: un renderizador externo (o una prueba) inserta el
 * resultado. Consume el {@link DiceRollDialogView} (view-model textual ya
 * resuelto en es-ES) y añade únicamente estructura y atributos de
 * accesibilidad; no contiene lógica de reglas ni resuelve textos.
 *
 * Accesibilidad materializada aquí (§8, requisitos 24, 25, 41):
 * - `role="dialog"`, `aria-modal`, `aria-labelledby` y `aria-label` es-ES.
 * - Selector Automático/Manual como `radiogroup` operable con teclado.
 * - Una entrada numérica por dado en Manual, con `min=1`/`max=sides` y nombre
 *   accesible; controles marcados como objetivos de 44×44 px CSS vía clase.
 * - Región `aria-live="polite"` que anuncia caras y efecto (41.28), con
 *   equivalente textual persistente además de la animación.
 * - `data-reduced-motion` para que la hoja de estilos reduzca/suprima la
 *   rotación (41.19); el markup no depende de `animationend` (41.20).
 * - `data-orientation` para adaptarse a vertical/horizontal (41.30); el reflow
 *   a 200 % lo garantiza el CSS sobre este markup semántico.
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Presentación pura; sin DOM real, red ni
 * reloj. Determinista: la misma vista produce el mismo markup.
 */
import type {
  CalculationOutcomeView,
  DiceRollDialogView,
  DiceView,
  ModeOptionView,
  OutcomeView,
  TableOutcomeView,
} from "./dice-roll-dialog.js";

/** Orientación de pantalla para adaptar el diálogo (41.30). */
export type DialogOrientation = "portrait" | "landscape";

/** Opciones de render (accesibilidad y adaptación visual). */
export type DiceRollRenderOptions = Readonly<{
  /** Preferencia de reducción de movimiento del navegador/Jugador (41.19). */
  reducedMotion?: boolean;
  /** Orientación física actual de la pantalla (41.30). */
  orientation?: DialogOrientation;
}>;

/** Identificador del título del diálogo, referido por `aria-labelledby`. */
const TITLE_ID = "dice-roll-dialog-title";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renderiza un dado con su cara efectiva y nombre accesible. */
function renderDie(die: DiceView, animate: boolean): string {
  const faceText = die.face !== undefined ? String(die.face) : "";
  const classes = ["dice-die", "touch-target", animate ? "dice-die--spin" : "dice-die--static"];
  if (die.invalid) classes.push("dice-die--invalid");
  return (
    `<li class="${escapeAttr(classes.join(" "))}" ` +
    `data-order-index="${die.orderIndex}" data-die-index="${die.dieIndex}" ` +
    `data-sides="${die.sides}"${die.face !== undefined ? ` data-face="${die.face}"` : ""} ` +
    `role="img" aria-label="${escapeAttr(die.accessibleName)}">` +
    `<span class="dice-die__face" aria-hidden="true">${escapeText(faceText)}</span>` +
    `</li>`
  );
}

/** Renderiza la lista de dados en el orden declarado. */
function renderDice(dice: readonly DiceView[], animate: boolean): string {
  const items = dice.map((die) => renderDie(die, animate)).join("");
  return `<ol class="dice-list" role="list">${items}</ol>`;
}

/** Renderiza una opción del selector de Modo como radio accesible. */
function renderMode(mode: ModeOptionView): string {
  return (
    `<label class="dice-mode touch-target">` +
    `<input type="radio" name="dice-mode" value="${escapeAttr(mode.source)}" ` +
    `class="dice-mode__input"${mode.selected ? " checked" : ""} />` +
    `<span class="dice-mode__label">${escapeText(mode.label)}</span>` +
    `<span class="dice-mode__hint">${escapeText(mode.hint)}</span>` +
    `</label>`
  );
}

/** Renderiza las entradas manuales (una cara entera por dado, 41.9). */
function renderManualInputs(dice: readonly DiceView[]): string {
  const fields = dice
    .map((die) => {
      const invalid = die.invalid ? ` aria-invalid="true"` : "";
      const value = die.face !== undefined ? ` value="${die.face}"` : "";
      return (
        `<div class="dice-manual-field">` +
        `<label class="dice-manual-field__label" for="dice-face-${die.orderIndex}">` +
        `${escapeText(die.accessibleName)}</label>` +
        `<input class="dice-manual-field__input touch-target" ` +
        `id="dice-face-${die.orderIndex}" name="dice-face-${die.orderIndex}" ` +
        `type="number" inputmode="numeric" min="1" max="${die.sides}" step="1"` +
        `${value}${invalid} data-order-index="${die.orderIndex}" />` +
        `</div>`
      );
    })
    .join("");
  return `<fieldset class="dice-manual"><legend class="dice-manual__legend">Caras manuales</legend>${fields}</fieldset>`;
}

/** Renderiza el detalle de la variante `table` con la fila aplicada destacada. */
function renderTableOutcome(table: TableOutcomeView): string {
  const rows = table.rows
    .map((row) => {
      const cells = Object.entries(row.cells)
        .map(([key, value]) => `<td data-cell="${escapeAttr(key)}">${escapeText(String(value))}</td>`)
        .join("");
      const cls = row.applied ? ' class="dice-table__row dice-table__row--applied" aria-current="true"' : ' class="dice-table__row"';
      return `<tr${cls} data-row-id="${escapeAttr(row.rowId)}">${cells}</tr>`;
    })
    .join("");
  return (
    `<figure class="dice-outcome dice-outcome--table">` +
    `<figcaption>${escapeText(table.appliedSummary)}</figcaption>` +
    `<table class="dice-table"><tbody>${rows}</tbody></table>` +
    `<p class="dice-outcome__effect">${escapeText(table.effect)}</p>` +
    `</figure>`
  );
}

/** Renderiza el detalle de la variante `calculation` (objetivo/bases/…). */
function renderCalculationOutcome(calc: CalculationOutcomeView): string {
  const bases = calc.bases.map((b) => `<li>${escapeText(b)}</li>`).join("");
  const mods = calc.modifiers.map((m) => `<li>${escapeText(m)}</li>`).join("");
  return (
    `<div class="dice-outcome dice-outcome--calculation">` +
    `<p class="dice-outcome__target">${escapeText(calc.target)}</p>` +
    `<ul class="dice-outcome__bases">${bases}</ul>` +
    `<ul class="dice-outcome__modifiers">${mods}</ul>` +
    `<p class="dice-outcome__formula">${escapeText(calc.formula)}</p>` +
    `<p class="dice-outcome__comparison">${escapeText(calc.comparison)}</p>` +
    `<p class="dice-outcome__effect">${escapeText(calc.effect)}</p>` +
    `</div>`
  );
}

/** Renderiza el bloque de resultado, incluida la región `aria-live` (41.28). */
function renderOutcome(outcome: OutcomeView): string {
  const detail =
    outcome.detail.kind === "table"
      ? renderTableOutcome(outcome.detail)
      : renderCalculationOutcome(outcome.detail);
  return (
    `<div class="dice-result">` +
    `<p class="dice-result__faces">${escapeText(outcome.facesText)}</p>` +
    `<p class="dice-result__effect">${escapeText(outcome.effect)}</p>` +
    detail +
    `</div>`
  );
}

/**
 * Emite el markup completo del Componente de tirada para una vista dada. Un
 * estado `hidden` produce cadena vacía (el diálogo no se muestra). El contenedor
 * lleva `data-reduced-motion` y `data-orientation` para que la hoja de estilos
 * suprima la animación o adapte el flujo, sin que el resultado dependa de ello
 * (41.19, 41.20, 41.30).
 */
export function renderDiceRollDialog(
  view: DiceRollDialogView,
  options: DiceRollRenderOptions = {},
): string {
  if (view.kind === "hidden") {
    return "";
  }
  const reducedMotion = options.reducedMotion === true;
  const orientation: DialogOrientation = options.orientation ?? "portrait";
  const animate = !reducedMotion;

  const openTag =
    `<div class="dice-roll-dialog" role="dialog" aria-modal="true" ` +
    `aria-labelledby="${TITLE_ID}" ` +
    `data-state="${view.kind}" data-orientation="${orientation}" ` +
    `data-reduced-motion="${reducedMotion ? "true" : "false"}">`;

  let body = `<h2 class="dice-roll-dialog__title" id="${TITLE_ID}">${escapeText(view.title)}</h2>`;

  if (view.kind === "entry") {
    const modes = view.modes.map(renderMode).join("");
    body +=
      `<fieldset class="dice-modes" role="radiogroup" aria-label="${escapeAttr(view.modeLegend)}">` +
      `<legend class="dice-modes__legend">${escapeText(view.modeLegend)}</legend>${modes}</fieldset>`;
    body += renderDice(view.dice, false);
    if (view.selectedSource === "manual") {
      body += renderManualInputs(view.dice);
      if (view.manualHint !== undefined) {
        body += `<p class="dice-manual__hint" role="note">${escapeText(view.manualHint)}</p>`;
      }
    }
    body +=
      `<div class="dice-actions">` +
      `<button type="button" class="dice-action dice-action--resolve touch-target" ` +
      `data-action="resolve"${view.canSubmit ? "" : " disabled aria-disabled=\"true\""}>` +
      `${escapeText(view.resolveLabel)}</button>` +
      `<button type="button" class="dice-action dice-action--cancel touch-target" ` +
      `data-action="cancel">${escapeText(view.cancelLabel)}</button>` +
      `</div>`;
    // Región de estado siempre presente para anuncios accesibles (41.28).
    body += `<p class="dice-live" role="status" aria-live="polite"></p>`;
  } else if (view.kind === "resolving") {
    body += renderDice(view.dice, animate);
    body += `<p class="dice-live" role="status" aria-live="polite">${escapeText(view.status)}</p>`;
    body +=
      `<div class="dice-actions">` +
      `<button type="button" class="dice-action dice-action--cancel touch-target" ` +
      `data-action="cancel">${escapeText(view.cancelLabel)}</button>` +
      `</div>`;
  } else {
    // resolved
    body += renderDice(view.dice, animate);
    // Equivalente textual persistente + anuncio en región aria-live (41.28).
    body += `<p class="dice-live" role="status" aria-live="polite">${escapeText(view.outcome.announcement)}</p>`;
    body += renderOutcome(view.outcome);
    body +=
      `<div class="dice-actions">` +
      `<button type="button" class="dice-action dice-action--close touch-target" ` +
      `data-action="close">${escapeText(view.closeLabel)}</button>` +
      `</div>`;
  }

  return `${openTag}${body}</div>`;
}
