import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gameId, rulesVersion } from "../../src/domain/identity/index.js";
import {
  appendDetailedEntry,
  appendSimpleEntry,
  detailedLog,
  simpleLog,
  InvalidLogEntryError,
  type ComparisonOperator,
  type DeterministicBreakdown,
  type DetailedLogEntry,
  type DetailedLogEntryInput,
  type ModifierBreakdown,
  type NamedModifier,
  type RandomConsumptionRef,
  type SimpleLogEntry,
  type SourceRef,
} from "../../src/domain/logging/log-entries.js";
import type { GameId } from "../../src/domain/identity/index.js";

/**
 * Propiedad 17 (Tarea 13.2): invariantes universales de los registros del
 * dominio (`SimpleLogEntry`/`DetailedLogEntry`) a través de los constructores de
 * 13.1 (`simpleLogEntry`, `detailedLogEntry`, `simpleLog`, `detailedLog`,
 * `appendSimpleEntry`, `appendDetailedEntry`).
 *
 * Se verifica una única propiedad fast-check con `numRuns: 100` que compone,
 * sobre datos generados dentro del espacio válido, los invariantes de:
 *
 * - Orden y consecutividad (20.6, 20.7): añadir N entradas produce secuencias
 *   EXACTAMENTE 1..N en orden, y `simpleLog`/`detailedLog` las aceptan.
 * - Aislamiento por Partida (20.5): una lista con una entrada de `gameId`
 *   distinto es rechazada; la lista homogénea se acepta.
 * - Completitud (20.1, 20.2, 20.4): las entradas conservan los campos aportados.
 * - Inmutabilidad/pureza: los `append` no mutan la lista recibida.
 *
 * Los generadores construyen SIEMPRE datos válidos con los constructores del
 * dominio, de modo que la propiedad ataca invariantes reales y no violaciones
 * de precondiciones de constructor. Los auxiliares viven fuera del `it`.
 */

/** Insumos generados de una entrada simple (sin `gameId` ni `sequence`). */
type SimpleEntryDraft = Readonly<{
  turn: number;
  phase: string;
  actor: string;
  action: string;
  result: string;
  messageKey: string;
}>;

/** Insumos generados de una entrada detallada (sin `gameId` ni `sequence`). */
type DetailedEntryDraft = Readonly<{
  roll?: ModifierBreakdown;
  deterministic?: DeterministicBreakdown;
  rulesVersion?: string;
  sourceRefs?: readonly SourceRef[];
  consumptions?: readonly RandomConsumptionRef[];
  messageKey: string;
}>;

/** Genera una cadena no vacía (para campos obligatorios de texto). */
const nonEmptyStringArbitrary = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((value) => value.trim().length > 0);

/** Genera un entero no negativo (turno). */
const nonNegativeIntegerArbitrary = fc.integer({ min: 0, max: 200 });

/** Genera un identificador de Partida válido a partir de una cadena no vacía. */
const gameIdArbitrary: fc.Arbitrary<GameId> = nonEmptyStringArbitrary.map((value) =>
  gameId(value),
);

/** Genera un modificador con nombre y signo del desglose de una tirada (20.2). */
const namedModifierArbitrary: fc.Arbitrary<NamedModifier> = fc
  .tuple(
    nonEmptyStringArbitrary,
    fc.integer({ min: -10, max: 10 }),
    fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
  )
  .map(
    ([name, value, count]): NamedModifier =>
      count !== undefined ? { name, value, count } : { name, value },
  );

/** Genera un operador de comparación válido. */
const comparisonArbitrary = fc.constantFrom<ComparisonOperator>(
  ">=",
  ">",
  "<=",
  "<",
  "==",
);

/** Genera un desglose de resolución con tirada válido (20.2). */
const rollBreakdownArbitrary: fc.Arbitrary<ModifierBreakdown> = fc.record({
  rawValue: fc.integer({ min: 0, max: 20 }),
  targetValue: fc.integer({ min: 0, max: 20 }),
  baseValues: fc.array(fc.integer({ min: 0, max: 10 }), { maxLength: 3 }),
  modifiers: fc.array(namedModifierArbitrary, { maxLength: 3 }),
  formula: nonEmptyStringArbitrary,
  comparison: comparisonArbitrary,
  finalResult: nonEmptyStringArbitrary,
});

/** Genera un desglose determinista sin tirada válido (20.3). */
const deterministicBreakdownArbitrary: fc.Arbitrary<DeterministicBreakdown> =
  fc.record({
    inputs: fc.array(nonEmptyStringArbitrary, { maxLength: 3 }),
    rules: fc.array(nonEmptyStringArbitrary, { maxLength: 3 }),
    priorities: fc.array(nonEmptyStringArbitrary, { maxLength: 3 }),
    computations: fc.array(nonEmptyStringArbitrary, { maxLength: 3 }),
  });

/** Genera una Referencia de fuente estructural (20.4). */
const sourceRefArbitrary: fc.Arbitrary<SourceRef> = fc
  .tuple(
    nonEmptyStringArbitrary,
    fc.integer({ min: 1, max: 300 }),
    nonEmptyStringArbitrary,
    fc.option(nonEmptyStringArbitrary, { nil: undefined }),
  )
  .map(
    ([sourceVersion, page, element, missionRef]): SourceRef =>
      missionRef !== undefined
        ? { sourceVersion, page, element, missionRef }
        : { sourceVersion, page, element },
  );

/** Genera una Referencia a un Consumo aleatorio (8.7, 12.3, 12.5, 14.5, 16.4, 38.8). */
const consumptionArbitrary: fc.Arbitrary<RandomConsumptionRef> = fc.record({
  position: fc.integer({ min: 0, max: 1000 }),
  algorithmVersion: nonEmptyStringArbitrary,
});

/** Genera los insumos de una entrada simple válida. */
const simpleDraftArbitrary: fc.Arbitrary<SimpleEntryDraft> = fc.record({
  turn: nonNegativeIntegerArbitrary,
  phase: nonEmptyStringArbitrary,
  actor: nonEmptyStringArbitrary,
  action: nonEmptyStringArbitrary,
  result: nonEmptyStringArbitrary,
  messageKey: nonEmptyStringArbitrary,
});

/**
 * Genera los insumos de una entrada detallada válida: EXACTAMENTE una
 * naturaleza (tirada XOR determinista) y, opcionalmente, `rulesVersion`,
 * `sourceRefs` y `consumptions`.
 */
const detailedDraftArbitrary: fc.Arbitrary<DetailedEntryDraft> = fc
  .tuple(
    fc.oneof(
      rollBreakdownArbitrary.map((roll) => ({ roll })),
      deterministicBreakdownArbitrary.map((deterministic) => ({ deterministic })),
    ),
    fc.option(nonEmptyStringArbitrary, { nil: undefined }),
    fc.option(fc.array(sourceRefArbitrary, { maxLength: 3 }), { nil: undefined }),
    fc.option(fc.array(consumptionArbitrary, { maxLength: 3 }), { nil: undefined }),
    nonEmptyStringArbitrary,
  )
  .map(
    ([nature, rv, refs, cons, messageKey]): DetailedEntryDraft => ({
      ...nature,
      ...(rv !== undefined ? { rulesVersion: rv } : {}),
      ...(refs !== undefined ? { sourceRefs: refs } : {}),
      ...(cons !== undefined ? { consumptions: cons } : {}),
      messageKey,
    }),
  );

/** Reconstruye una lista simple aplicando `appendSimpleEntry` sobre cada insumo. */
function buildSimpleLog(
  game: GameId,
  drafts: readonly SimpleEntryDraft[],
): readonly SimpleLogEntry[] {
  return drafts.reduce<readonly SimpleLogEntry[]>(
    (log, draft) => appendSimpleEntry(game, log, draft),
    [],
  );
}

/** Traduce un insumo generado a la entrada del constructor (con `RulesVersion` marcada). */
function toDetailedInput(
  draft: DetailedEntryDraft,
): Omit<DetailedLogEntryInput, "gameId" | "sequence"> {
  const nature =
    draft.roll !== undefined
      ? { roll: draft.roll }
      : { deterministic: draft.deterministic! };
  return {
    ...nature,
    ...(draft.rulesVersion !== undefined
      ? { rulesVersion: rulesVersion(draft.rulesVersion) }
      : {}),
    ...(draft.sourceRefs !== undefined ? { sourceRefs: draft.sourceRefs } : {}),
    ...(draft.consumptions !== undefined ? { consumptions: draft.consumptions } : {}),
    messageKey: draft.messageKey,
  };
}

/** Reconstruye una lista detallada aplicando `appendDetailedEntry` sobre cada insumo. */
function buildDetailedLog(
  game: GameId,
  drafts: readonly DetailedEntryDraft[],
): readonly DetailedLogEntry[] {
  return drafts.reduce<readonly DetailedLogEntry[]>(
    (log, draft) => appendDetailedEntry(game, log, toDetailedInput(draft)),
    [],
  );
}

/** Secuencia esperada 1..N para una lista de N entradas (20.6, 20.7). */
function expectedSequences(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

describe("propiedades de registros completos, ordenados y aislados", () => {
  // Feature: fields-of-normandy-pwa, Property 17: Registros completos, ordenados y aislados
  it("orden y consecutividad, aislamiento por Partida, completitud e inmutabilidad de los registros", () => {
    fc.assert(
      fc.property(
        gameIdArbitrary,
        fc.array(simpleDraftArbitrary, { minLength: 1, maxLength: 6 }),
        fc.array(detailedDraftArbitrary, { minLength: 1, maxLength: 6 }),
        gameIdArbitrary,
        (game, simpleDrafts, detailedDrafts, otherGameSeed) => {
          // (1) Orden y consecutividad (20.6, 20.7): las secuencias son 1..N.
          const simpleLogEntries = buildSimpleLog(game, simpleDrafts);
          const detailedLogEntries = buildDetailedLog(game, detailedDrafts);
          expect(simpleLogEntries.map((entry) => entry.sequence)).toStrictEqual(
            expectedSequences(simpleDrafts.length),
          );
          expect(detailedLogEntries.map((entry) => entry.sequence)).toStrictEqual(
            expectedSequences(detailedDrafts.length),
          );

          // Y los constructores de lista aceptan esas secuencias sin error.
          expect(simpleLog(game, simpleLogEntries)).toHaveLength(simpleDrafts.length);
          expect(detailedLog(game, detailedLogEntries)).toHaveLength(
            detailedDrafts.length,
          );

          // (2) Aislamiento por Partida (20.5): una entrada de otra Partida es
          //     rechazada; la lista homogénea se acepta. Se garantiza que las
          //     dos Partidas difieran componiendo un identificador distinto.
          const otherGame = gameId(`${otherGameSeed}#other`);
          expect(otherGame).not.toBe(game);
          const mixedSimple: readonly SimpleLogEntry[] = [
            ...simpleLogEntries.slice(0, simpleLogEntries.length - 1),
            {
              ...simpleLogEntries[simpleLogEntries.length - 1]!,
              gameId: otherGame,
            },
          ];
          expect(() => simpleLog(game, mixedSimple)).toThrow(InvalidLogEntryError);

          const mixedDetailed: readonly DetailedLogEntry[] = [
            ...detailedLogEntries.slice(0, detailedLogEntries.length - 1),
            {
              ...detailedLogEntries[detailedLogEntries.length - 1]!,
              gameId: otherGame,
            },
          ];
          expect(() => detailedLog(game, mixedDetailed)).toThrow(InvalidLogEntryError);

          // (3) Completitud simple (20.1): la entrada conserva sus campos.
          const firstSimpleDraft = simpleDrafts[0]!;
          const firstSimple = simpleLogEntries[0]!;
          expect(firstSimple.gameId).toBe(game);
          expect(firstSimple.turn).toBe(firstSimpleDraft.turn);
          expect(firstSimple.phase).toBe(firstSimpleDraft.phase);
          expect(firstSimple.actor).toBe(firstSimpleDraft.actor);
          expect(firstSimple.action).toBe(firstSimpleDraft.action);
          expect(firstSimple.result).toBe(firstSimpleDraft.result);
          expect(firstSimple.messageKey).toBe(firstSimpleDraft.messageKey);

          // (4) Completitud detallada (20.2, 20.4): EXACTAMENTE una naturaleza y
          //     conservación de rulesVersion/sourceRefs/consumptions aportados.
          for (const [index, detailed] of detailedLogEntries.entries()) {
            const draft = detailedDrafts[index]!;
            const hasRoll = detailed.roll !== undefined;
            const hasDeterministic = detailed.deterministic !== undefined;
            expect(hasRoll).not.toBe(hasDeterministic);
            expect(detailed.gameId).toBe(game);
            expect(detailed.messageKey).toBe(draft.messageKey);
            if (draft.rulesVersion !== undefined) {
              expect(detailed.rulesVersion).toBe(rulesVersion(draft.rulesVersion));
            }
            if (draft.sourceRefs !== undefined) {
              expect(detailed.sourceRefs).toStrictEqual(draft.sourceRefs);
            }
            if (draft.consumptions !== undefined) {
              expect(detailed.consumptions).toStrictEqual(draft.consumptions);
            }
          }

          // (5) Inmutabilidad/pureza: `append` no muta la lista recibida.
          const simpleLengthBefore = simpleLogEntries.length;
          appendSimpleEntry(game, simpleLogEntries, firstSimpleDraft);
          expect(simpleLogEntries).toHaveLength(simpleLengthBefore);

          const detailedLengthBefore = detailedLogEntries.length;
          appendDetailedEntry(game, detailedLogEntries, {
            roll: {
              rawValue: 0,
              targetValue: 0,
              baseValues: [],
              modifiers: [],
              formula: "base",
              comparison: ">=",
              finalResult: "log.result",
            },
            messageKey: "log.detailed.extra",
          });
          expect(detailedLogEntries).toHaveLength(detailedLengthBefore);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
