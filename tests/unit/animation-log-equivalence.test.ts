import { describe, expect, it } from "vitest";
import { gameId } from "../../src/domain/identity/index.js";
import {
  appendSimpleEntry,
  type SimpleLogEntry,
} from "../../src/domain/logging/log-entries.js";
import {
  animationCuesFor,
  everyCueHasPersistentEquivalent,
  persistentEquivalents,
  type AnimationCue,
  type MotionPreference,
} from "../../src/ui/a11y/animation-log-equivalence.js";

/**
 * Pruebas de la equivalencia animación ⇄ Registro simple (Tarea 21.2, requisito
 * 25.6). Verifican que cada señal de animación tiene un equivalente persistente
 * y ordenado, que el orden se preserva, que con movimiento reducido el
 * equivalente persistente no cambia, y que —por diseño de la API— una animación
 * sin entrada de respaldo es inexpresable.
 */

const GAME = gameId("g-1");

/** Construye un Registro simple ordenado con `count` cambios de estado. */
function stateChangeLog(count: number): readonly SimpleLogEntry[] {
  let entries: readonly SimpleLogEntry[] = [];
  for (let index = 1; index <= count; index += 1) {
    entries = appendSimpleEntry(GAME, entries, {
      turn: index,
      phase: "activación",
      actor: `unidad-${index}`,
      action: "move",
      result: "avanza",
      messageKey: "log.simple.move",
    });
  }
  return entries;
}

describe("equivalencia animación ⇄ Registro simple (25.6)", () => {
  it("cada señal de animación tiene una entrada persistente de respaldo", () => {
    const entries = stateChangeLog(3);
    const cues = animationCuesFor(entries, "full");

    expect(cues).toHaveLength(entries.length);
    cues.forEach((cue, index) => {
      const entry = entries[index];
      expect(entry).toBeDefined();
      expect(cue.sequence).toBe(entry?.sequence);
      expect(cue.messageKey).toBe(entry?.messageKey);
    });
    expect(everyCueHasPersistentEquivalent(cues, entries)).toBe(true);
  });

  it("las señales preservan el orden persistente del registro (20.6)", () => {
    const entries = stateChangeLog(4);
    const cues = animationCuesFor(entries, "full");

    const cueSequences = cues.map((cue) => cue.sequence);
    const entrySequences = entries.map((entry) => entry.sequence);
    expect(cueSequences).toEqual(entrySequences);
    // El campo `order` es la posición base 0 dentro de la tanda.
    expect(cues.map((cue) => cue.order)).toEqual([0, 1, 2, 3]);
  });

  it("con movimiento reducido no emite señales pero conserva el equivalente persistente", () => {
    const entries = stateChangeLog(3);
    const full = persistentEquivalents(entries);

    const reducedCues = animationCuesFor(entries, "reduced");
    expect(reducedCues).toHaveLength(0);

    // El equivalente persistente es idéntico con o sin animación (autoridad).
    const stillPersistent = persistentEquivalents(entries);
    expect(stillPersistent).toEqual(full);
    expect(stillPersistent).toHaveLength(entries.length);
    // La ausencia de señales no rompe la invariante de equivalencia.
    expect(everyCueHasPersistentEquivalent(reducedCues, entries)).toBe(true);
  });

  it("el equivalente persistente coincide 1:1 con las señales bajo movimiento completo", () => {
    const entries = stateChangeLog(2);
    const persistent = persistentEquivalents(entries);
    const cues = animationCuesFor(entries, "full");

    expect(persistent.map((eq) => eq.sequence)).toEqual(
      cues.map((cue) => cue.sequence),
    );
    expect(persistent.map((eq) => eq.messageKey)).toEqual(
      cues.map((cue) => cue.messageKey),
    );
  });

  it("una animación sin entrada de respaldo se detecta como incoherente", () => {
    const entries = stateChangeLog(2);
    // Señal fabricada que NO corresponde a ninguna entrada persistente: la API
    // no permite crearla desde la Interfaz, pero la comprobación de invariante
    // la rechaza si alguien la introdujera por otra vía.
    const orphanCue: AnimationCue = Object.freeze({
      sequence: 999,
      messageKey: "log.simple.move",
      order: 0,
    });
    expect(everyCueHasPersistentEquivalent([orphanCue], entries)).toBe(false);

    // Un desajuste de longitud (más señales que entradas) también se rechaza.
    const cues = animationCuesFor(entries, "full");
    expect(everyCueHasPersistentEquivalent([...cues, orphanCue], entries)).toBe(
      false,
    );
  });

  it("rechaza una señal cuyo mensaje no coincide con su entrada de respaldo", () => {
    const entries = stateChangeLog(1);
    const tampered: AnimationCue = Object.freeze({
      sequence: entries[0]?.sequence ?? 1,
      messageKey: "log.simple.fire",
      order: 0,
    });
    expect(everyCueHasPersistentEquivalent([tampered], entries)).toBe(false);
  });

  it("una tanda vacía produce cero señales en cualquier preferencia", () => {
    const preferences: readonly MotionPreference[] = ["full", "reduced"];
    for (const preference of preferences) {
      expect(animationCuesFor([], preference)).toHaveLength(0);
      expect(everyCueHasPersistentEquivalent([], [])).toBe(true);
    }
  });
});
