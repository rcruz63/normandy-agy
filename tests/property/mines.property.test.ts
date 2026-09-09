import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  evaluateMineHexAction,
  mineRevealTriggersImmediateTest,
  resolveMineTest,
  type MineHexAction,
  type MineRevealCause,
} from "../../src/domain/rules/mines.js";
import type { BaseHitInput } from "../../src/domain/rules/combat-resolver.js";

/**
 * Propiedad 12 (Tarea 10.4): invariantes universales de la persistencia y las
 * pruebas de Minas (submódulo de 10.2). Se verifica una única propiedad
 * fast-check con `numRuns: 100` que, sobre contextos generados dentro del espacio
 * válido, comprueba:
 *
 * - La prueba de Mina es FIJA 7+ SIN modificadores para cualquier Valor base
 *   fijo generado: `effectiveThreshold == baseThreshold` y `operands` vacío
 *   (16.1, 35.8, 36.11, 39.8, 39.10).
 * - El disparador INMEDIATO ocurre por adyacencia desde la Misión 7 en adelante y
 *   NUNCA por Explorar ni por debajo de la Misión 7 (39.7, 39.9).
 * - La Mina es PERSISTENTE: Avanzar a un Hexágono con Mina se permite (39.11) y
 *   cualquier acción que la retiraría queda EXCLUIDA (39.12).
 *
 * Valida requisitos: 16.1, 35.8, 36.11, 37.10, 37.12, 37.13, 39.7, 39.8, 39.9,
 * 39.10, 39.11, 39.12.
 */

/** Primera Misión en la que la adyacencia dispara prueba inmediata (39.7). */
const FIRST_TRIGGERING_MISSION: number = 7;

/** Las dos causas de revelación de una Mina (39.7, 39.9). */
const REVEAL_CAUSES: readonly MineRevealCause[] = ["adjacency", "scout"];

/** Las dos acciones evaluables sobre un Hexágono con Mina (39.11, 39.12). */
const MINE_ACTIONS: readonly MineHexAction[] = ["advance", "remove-mine"];

/** Genera una causa de revelación válida. */
const revealCauseArbitrary = fc.constantFrom(...REVEAL_CAUSES);

/** Genera un número de Misión válido (1..15, las quince misiones verificadas). */
const missionNumberArbitrary = fc.integer({ min: 1, max: 15 });

/** Genera una acción sobre un Hexágono con Mina. */
const mineActionArbitrary = fc.constantFrom(...MINE_ACTIONS);

/** Genera un Valor base FIJO de prueba de Mina 7+ con umbral plausible. */
const mineBaseArbitrary: fc.Arbitrary<BaseHitInput> = fc
  .integer({ min: 2, max: 12 })
  .map((threshold) => ({ threshold, fixed: true }));

describe("propiedades de persistencia y pruebas de Minas", () => {
  // Feature: fields-of-normandy-pwa, Property 12: Persistencia y pruebas de Minas
  it("prueba fija sin modificadores, disparo por adyacencia desde M7 y nunca por Explorar, y persistencia de la Mina", () => {
    fc.assert(
      fc.property(
        mineBaseArbitrary,
        revealCauseArbitrary,
        missionNumberArbitrary,
        mineActionArbitrary,
        (mineBase, cause, missionNumber, action) => {
          // (1) La prueba de Mina es fija sin modificadores para cualquier base.
          const outcome = resolveMineTest(mineBase);
          expect(outcome.kind).toBe("resolved");
          if (outcome.kind === "resolved") {
            expect(outcome.resolution.fixed).toBe(true);
            expect(outcome.resolution.effectiveThreshold).toBe(mineBase.threshold);
            expect(outcome.resolution.modifierTotal).toBe(0);
            expect(outcome.resolution.operands).toHaveLength(0);
          }

          // (2) Disparo inmediato: por adyacencia desde M7 en adelante; nunca por
          //     Explorar ni por debajo de M7 (39.7, 39.9).
          const triggers = mineRevealTriggersImmediateTest(cause, missionNumber);
          const shouldTrigger = cause === "adjacency" && missionNumber >= FIRST_TRIGGERING_MISSION;
          expect(triggers).toBe(shouldTrigger);
          expect(mineRevealTriggersImmediateTest("scout", missionNumber)).toBe(false);

          // (3) Persistencia: Avanzar se permite; retirar la Mina queda excluido.
          const actionOutcome = evaluateMineHexAction(action);
          if (action === "advance") {
            expect(actionOutcome.kind).toBe("allowed");
          } else {
            expect(actionOutcome.kind).toBe("excluded");
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
