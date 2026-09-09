import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  resolveReveal,
  type RevealCause,
  type RevealDefinitionIds,
  type RevealRequest,
  type RevealResultKind,
  type RevealTableView,
  type RevealerInput,
  type RevealSourceRef,
} from "../../src/domain/rules/reveal-resolver.js";
import { directionId, hexId, pieceId, pieceState } from "../../src/domain/geometry/index.js";
import { catalogId } from "../../src/domain/identity/index.js";
import type { DirectionId, HexId, PieceState } from "../../src/domain/geometry/index.js";

/**
 * Propiedad 11 (Tarea 11.3): invariantes universales del Revelado canónico de
 * Incógnitas sobre `resolveReveal` (`reveal-resolver.ts`). Una única propiedad
 * `fast-check` con `numRuns: 100` que compone, sobre entradas generadas dentro
 * del espacio válido (d6 1..6, Tablas de revelado completas, causas
 * adyacencia/Explorar, cero, una o varias reveladoras), los invariantes de:
 *
 * - OCULTACIÓN PREVIA (13.1): antes de revelar, la Incógnita es `hidden`.
 * - SUSTITUCIÓN EN EL MISMO HEXÁGONO (13.3, 33.2, 37.6, 37.12): la Ficha
 *   revelada conserva `id`/`hexId` y pasa a `visibility: "revealed"`, tanto para
 *   Unidad alemana como para Mina.
 * - ORIENTACIÓN ÚNICA (37.7) vs SUSPENSIÓN POR EMPATE (37.8, 37.9): una única
 *   reveladora orienta hacia ella; dos o más suspenden con DP-002 sin
 *   Orientación.
 * - EXPLORAR SIN PRUEBA INMEDIATA (37.10, 37.11): `cause: "scout"` que revela
 *   Mina NUNCA dispara prueba inmediata.
 * - DETENCIÓN SIN FILA (13.6): un d6 sin fila en la Tabla detiene el Revelado
 *   sin aplicar contenido.
 * - PUREZA (13.2): `resolveReveal` no muta la Incógnita recibida.
 *
 * Los auxiliares construyen siempre datos válidos con los constructores del
 * dominio, de modo que la propiedad ataca invariantes reales y no violaciones
 * de precondiciones.
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 33.2, 35.4, 35.13, 35.14,
 * 37.6, 37.7, 37.8, 37.9, 37.10, 37.11, 37.12**
 */

/** Los cinco resultados posibles de una fila de la Tabla de revelado (33.2). */
const RESULT_KINDS: readonly RevealResultKind[] = [
  "HMG",
  "LMG",
  "german-rifles",
  "mine",
];

/** Referencia de fuente mínima para registrar DP-002 al suspender/detener. */
const SOURCE_REF: RevealSourceRef = Object.freeze({
  sourceVersion: "FON-ML-2022",
  page: 16,
  element: "Tabla de revelado",
  missionRef: "FON-ML-2022-M01",
});

/** Identificadores canónicos de definición por resultado (Datos canónicos). */
const DEFINITION_IDS: RevealDefinitionIds = Object.freeze({
  HMG: catalogId("def-hmg"),
  LMG: catalogId("def-lmg"),
  "german-rifles": catalogId("def-rifles"),
  mine: catalogId("def-mine"),
});

/** Hexágono fijo que ocupa la Incógnita durante todas las ejecuciones. */
const UNKNOWN_HEX: HexId = hexId("hex-unknown");

/** Genera una cara de d6 válida (1..6). */
const dieResultArbitrary = fc.integer({ min: 1, max: 6 });

/** Genera un resultado canónico del conjunto. */
const resultKindArbitrary = fc.constantFrom<RevealResultKind>(...RESULT_KINDS);

/** Genera una Dirección canónica no vacía hacia una reveladora. */
const directionArbitrary: fc.Arbitrary<DirectionId> = fc
  .constantFrom("N", "NE", "SE", "S", "SW", "NW")
  .map((value) => directionId(value));

/** Genera una reveladora con su Dirección canónica desde la Incógnita (37.7). */
const revealerArbitrary: fc.Arbitrary<RevealerInput> = fc
  .tuple(fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s.trim().length > 0), directionArbitrary)
  .map(([suffix, direction]) => ({
    revealerId: pieceId(`revealer-${suffix}`),
    directionToRevealer: direction,
  }));

/**
 * Genera una Tabla de revelado COMPLETA (todas las filas 1..6) mapeando cada
 * cara a un resultado canónico. Al ser completa, ningún d6 queda sin fila.
 */
const fullTableArbitrary: fc.Arbitrary<RevealTableView> = fc
  .array(resultKindArbitrary, { minLength: 6, maxLength: 6 })
  .map((results): RevealTableView => {
    const resultOf: Record<number, RevealResultKind> = {};
    results.forEach((result, index) => {
      resultOf[index + 1] = result;
    });
    return { resultOf: Object.freeze(resultOf) };
  });

/** Construye una Incógnita oculta con Hexágono asignado (13.1, 37.6). */
function buildUnknown(): PieceState {
  return pieceState({
    id: pieceId("unknown-1"),
    definitionId: catalogId("def-unknown"),
    side: "neutral",
    hexId: UNKNOWN_HEX,
    visibility: "hidden",
    status: "active",
  });
}

/** Construye la petición de Revelado con los parámetros generados. */
function buildRequest(input: {
  unknown: PieceState;
  cause: RevealCause;
  dieResult: number;
  table: RevealTableView;
  revealers: readonly RevealerInput[];
  scoutOrientation: DirectionId;
}): RevealRequest {
  return {
    unknown: input.unknown,
    cause: input.cause,
    missionNumber: 7,
    dieResult: input.dieResult,
    table: input.table,
    definitionIds: DEFINITION_IDS,
    revealers: input.revealers,
    scoutChosenOrientation: input.scoutOrientation,
    sourceRef: SOURCE_REF,
  };
}

/** Copia estructural de una Incógnita para verificar ausencia de mutación (13.2). */
function snapshot(piece: PieceState): string {
  return JSON.stringify(piece);
}

describe("propiedades de ocultación y Revelado canónico", () => {
  // Feature: fields-of-normandy-pwa, Property 11: Ocultación y Revelado canónico
  it("sustitución en el mismo Hexágono, Orientación única vs empate DP-002, Explorar sin prueba inmediata, Mina y detención sin fila, sin mutar la Incógnita", () => {
    fc.assert(
      fc.property(
        fullTableArbitrary,
        dieResultArbitrary,
        fc.constantFrom<RevealCause>("adjacency", "scout"),
        fc.array(revealerArbitrary, { minLength: 0, maxLength: 3 }),
        directionArbitrary,
        (table, dieResult, cause, revealers, scoutOrientation) => {
          const unknown = buildUnknown();

          // (0) Ocultación previa (13.1): la Incógnita es «hidden» con Hexágono.
          expect(unknown.visibility).toBe("hidden");
          expect(unknown.hexId).toBe(UNKNOWN_HEX);
          const before = snapshot(unknown);

          const outcome = resolveReveal(
            buildRequest({ unknown, cause, dieResult, table, revealers, scoutOrientation }),
          );

          // (13.2) `resolveReveal` no muta la Incógnita recibida.
          expect(snapshot(unknown)).toBe(before);

          // La Tabla es completa, así que siempre hay fila para el d6 tirado.
          const result = table.resultOf[dieResult]!;

          if (result === "mine") {
            // (37.12) Mina: sustituye la Incógnita en el MISMO Hexágono, revelada.
            expect(outcome.kind).toBe("mine-revealed");
            if (outcome.kind === "mine-revealed") {
              expect(outcome.piece.id).toBe(unknown.id);
              expect(outcome.piece.hexId).toBe(UNKNOWN_HEX);
              expect(outcome.piece.visibility).toBe("revealed");
              // (37.10) Explorar NUNCA dispara prueba inmediata de Mina.
              if (cause === "scout") {
                expect(outcome.triggersImmediateTest).toBe(false);
              }
            }
            return true;
          }

          // Unidad alemana: sustitución en el mismo Hexágono, revelada, «german».
          if (cause === "adjacency" && revealers.length >= 2) {
            // (37.8, 37.9) Dos o más reveladoras: suspensión con DP-002, sin Orientación.
            expect(outcome.kind).toBe("orientation-suspended");
            if (outcome.kind === "orientation-suspended") {
              expect(outcome.piece.id).toBe(unknown.id);
              expect(outcome.piece.hexId).toBe(UNKNOWN_HEX);
              expect(outcome.piece.visibility).toBe("revealed");
              expect(outcome.piece.side).toBe("german");
              expect(outcome.piece.orientation).toBeUndefined();
              expect(outcome.dp002.decision).toBe("DP-002");
              expect(outcome.dp002.reason).toBe("orientation-tie");
            }
            return true;
          }

          // (13.3, 33.2, 37.6, 37.7, 37.11) Revelado con Orientación resuelta.
          expect(outcome.kind).toBe("revealed");
          if (outcome.kind === "revealed") {
            expect(outcome.piece.id).toBe(unknown.id);
            expect(outcome.piece.hexId).toBe(UNKNOWN_HEX);
            expect(outcome.piece.visibility).toBe("revealed");
            expect(outcome.piece.side).toBe("german");
            expect(outcome.result).toBe(result);
            const expectedOrientation = expectedOrientation2(cause, revealers, scoutOrientation);
            expect(outcome.orientation).toBe(expectedOrientation);
            expect(outcome.piece.orientation).toBe(expectedOrientation);
          }

          // (13.6) DETENCIÓN SIN FILA: una Tabla parcial que no cubre el d6
          //        tirado detiene el Revelado sin aplicar contenido ni mutar la
          //        Incógnita, con DP-002 «no-canonical-resolution».
          const partialTable: RevealTableView = { resultOf: Object.freeze({}) };
          const stoppedUnknown = buildUnknown();
          const stoppedBefore = snapshot(stoppedUnknown);
          const stopped = resolveReveal(
            buildRequest({
              unknown: stoppedUnknown,
              cause,
              dieResult,
              table: partialTable,
              revealers,
              scoutOrientation,
            }),
          );
          expect(stopped.kind).toBe("stopped");
          if (stopped.kind === "stopped") {
            expect(stopped.dp002.reason).toBe("no-canonical-resolution");
          }
          expect(snapshot(stoppedUnknown)).toBe(stoppedBefore);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Orientación esperada de una Unidad alemana revelada cuando NO hay suspensión
 * (37.7, 37.11): Explorar usa la Orientación elegida por el Jugador; adyacencia
 * con una única reveladora orienta hacia ella; sin reveladoras queda sin
 * Orientación.
 */
function expectedOrientation2(
  cause: RevealCause,
  revealers: readonly RevealerInput[],
  scoutOrientation: DirectionId,
): DirectionId | undefined {
  if (cause === "scout") {
    return scoutOrientation;
  }
  return revealers[0]?.directionToRevealer;
}
