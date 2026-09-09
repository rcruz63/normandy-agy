import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  resolveCombat,
  type CombatModifierContext,
  type CombatResolutionRequest,
  type DefenderTerrain,
} from "../../src/domain/rules/combat-resolver.js";

/**
 * Propiedad 10 (Tarea 10.3): invariantes universales del cálculo algebraico del
 * Valor para impactar y de sus excepciones en `CombatResolver` (submódulo de
 * 10.1). Se verifica una única propiedad fast-check con `numRuns: 100` que, sobre
 * contextos de modificador generados dentro del espacio válido, comprueba:
 *
 * - La suma algebraica es INDEPENDIENTE DEL ORDEN de enumeración de las fuentes:
 *   permutar la enumeración de un mismo conjunto de modificadores no altera el
 *   `modifierTotal` ni el `effectiveThreshold` (11.1, 11.2, 11.3, 36.1, 36.10).
 * - Los VALORES FIJOS (Granada 6+, prueba de Mina 7+, cualquier `base.fixed`)
 *   IGNORAN todos los modificadores: `effectiveThreshold == baseThreshold` y
 *   `operands` vacío para cualquier contexto (12.1-12.5, 35.5-35.8, 36.11, 38.7).
 * - El PIAT EXCLUYE el +2 defensivo de edificio (36.12, 36.13).
 * - `supportingUnits` no negativo y entero produce resolución; negativo o no
 *   entero produce rechazo sin cambio de estado (38.9, 39.2-39.6).
 *
 * Los generadores construyen SIEMPRE peticiones válidas para el espacio de
 * entrada, de modo que la propiedad ataca invariantes reales del dominio.
 *
 * Valida requisitos: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 12.5, 14.3, 14.4,
 * 14.5, 15.1, 15.2, 15.3, 16.4, 35.5, 35.6, 35.7, 35.8, 36.1-36.6, 36.10-36.13,
 * 38.1-38.9, 39.2, 39.3, 39.4, 39.5, 39.6, 39.14, 39.17.
 */

/** Los tres terrenos del defensor relevantes para el Valor para impactar. */
const TERRAINS: readonly DefenderTerrain[] = ["clear", "forest", "building"];

/** Los tres aportes posibles de un Mortero al ataque (38.3, 38.4). */
const MORTAR_KINDS: readonly CombatModifierContext["mortar"][] = [
  "none",
  "at-range",
  "adjacent",
];

/** Genera un contexto de modificadores VÁLIDO (Apoyo entero no negativo). */
const modifierContextArbitrary: fc.Arbitrary<CombatModifierContext> = fc.record({
  defenderTerrain: fc.constantFrom(...TERRAINS),
  attackerOnHill: fc.boolean(),
  flanking: fc.boolean(),
  supportingUnits: fc.integer({ min: 0, max: 6 }),
  mortar: fc.constantFrom(...MORTAR_KINDS),
});

/** Genera un umbral base canónico "n+" plausible (2..12). */
const thresholdArbitrary = fc.integer({ min: 2, max: 12 });

/**
 * Enumera las cinco claves de {@link CombatModifierContext} en un orden dado por
 * una permutación, reconstruyendo un objeto equivalente con las propiedades
 * insertadas en ese orden. Sirve para comprobar que la suma no depende del orden
 * de enumeración de las fuentes.
 */
function permuteContext(
  context: CombatModifierContext,
  order: readonly (keyof CombatModifierContext)[],
): CombatModifierContext {
  const rebuilt: Partial<Record<keyof CombatModifierContext, unknown>> = {};
  for (const key of order) {
    rebuilt[key] = context[key];
  }
  return rebuilt as CombatModifierContext;
}

/** Extrae la resolución exigiendo que el ataque no fuese rechazado. */
function expectResolved(request: CombatResolutionRequest) {
  const outcome = resolveCombat(request);
  if (outcome.kind !== "resolved") {
    throw new Error(`Se esperaba una resolución, no un rechazo: ${outcome.reason.messageKey}`);
  }
  return outcome.resolution;
}

/** Permutación fija de las cinco claves del contexto, distinta del orden natural. */
const REVERSED_KEYS: readonly (keyof CombatModifierContext)[] = [
  "mortar",
  "supportingUnits",
  "flanking",
  "attackerOnHill",
  "defenderTerrain",
];

describe("propiedades del cálculo algebraico de combate y sus excepciones", () => {
  // Feature: fields-of-normandy-pwa, Property 10: Cálculo algebraico de combate y excepciones
  it("suma independiente del orden, valores fijos que ignoran modificadores, PIAT sin +2 de edificio y validación del Apoyo", () => {
    fc.assert(
      fc.property(
        modifierContextArbitrary,
        thresholdArbitrary,
        (context, threshold) => {
          // (1) Suma algebraica independiente del orden de enumeración (36.10):
          //     permutar la enumeración del mismo contexto da el mismo total.
          const natural = expectResolved({
            kind: "fire",
            base: { threshold, fixed: false },
            modifiers: context,
          });
          const permuted = expectResolved({
            kind: "fire",
            base: { threshold, fixed: false },
            modifiers: permuteContext(context, REVERSED_KEYS),
          });
          expect(permuted.modifierTotal).toBe(natural.modifierTotal);
          expect(permuted.effectiveThreshold).toBe(natural.effectiveThreshold);
          expect(natural.effectiveThreshold).toBe(threshold + natural.modifierTotal);

          // (2) Valores FIJOS (Granada, Mina, cualquier base.fixed) IGNORAN todos
          //     los modificadores para cualquier contexto (12.4, 36.11, 38.7).
          for (const kind of ["grenade", "mine-test"] as const) {
            const fixed = expectResolved({ kind, base: { threshold, fixed: true }, modifiers: context });
            expect(fixed.fixed).toBe(true);
            expect(fixed.effectiveThreshold).toBe(threshold);
            expect(fixed.modifierTotal).toBe(0);
            expect(fixed.operands).toHaveLength(0);
          }

          // (3) PIAT EXCLUYE el +2 defensivo de edificio (36.13); el resto de
          //     modificadores compatibles se acumulan con normalidad.
          const piat = expectResolved({
            kind: "piat",
            base: { threshold, fixed: false },
            modifiers: { ...context, defenderTerrain: "building" },
            piatTarget: { targetIsHalftrack: true, targetIsGermanInBuilding: false },
          });
          expect(piat.operands.some((operand) => operand.source === "building")).toBe(false);

          // (4) supportingUnits no negativo produce resolución; negativo/no-entero
          //     produce rechazo sin cambio de estado (38.9).
          expect(resolveCombat({ kind: "fire", base: { threshold, fixed: false }, modifiers: context }).kind).toBe(
            "resolved",
          );
          expect(
            resolveCombat({
              kind: "fire",
              base: { threshold, fixed: false },
              modifiers: { ...context, supportingUnits: -1 },
            }).kind,
          ).toBe("rejected");
          expect(
            resolveCombat({
              kind: "fire",
              base: { threshold, fixed: false },
              modifiers: { ...context, supportingUnits: context.supportingUnits + 0.5 },
            }).kind,
          ).toBe("rejected");

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
