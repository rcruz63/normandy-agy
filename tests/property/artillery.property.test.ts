import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  artilleryAllowsFlanking,
  eliminateArtillery,
  isArtilleryTargetEligible,
  resolveArtilleryAttack,
  type ArtilleryCandidate,
} from "../../src/domain/rules/artillery.js";
import type {
  BaseHitInput,
  DefenderTerrain,
} from "../../src/domain/rules/combat-resolver.js";
import {
  hexId,
  pieceId,
  pieceState,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId } from "../../src/domain/identity/index.js";

/**
 * Propiedad 13 (Tarea 10.5): invariantes universales de la selección y la
 * resolución de la Artillería (submódulo de 10.2). Se verifica una única
 * propiedad fast-check con `numRuns: 100` que, sobre Unidades británicas
 * generadas dentro del espacio válido, comprueba:
 *
 * - Una Unidad británica es objetivo de Artillería SI Y SOLO SI no está en
 *   bosque, no está en edificio y no tiene Cobertura (39.15, 39.16).
 * - La Artillería NUNCA admite Flanqueo (39.14).
 * - La resolución del ataque de Artillería es FIJA 10+ sin modificadores (16.2,
 *   39.17): `effectiveThreshold == baseThreshold` y `operands` vacío.
 * - Una Artillería impactada por un ataque válido se elimina sin mutar la Ficha
 *   recibida (39.18).
 *
 * Los generadores construyen SIEMPRE Fichas válidas con los constructores del
 * dominio (`pieceState`, `hexId`, `pieceId`, `catalogId`).
 *
 * Valida requisitos: 16.2, 39.13, 39.14, 39.15, 39.16, 39.17, 39.18.
 */

/** Los tres terrenos del defensor relevantes para la selección (39.16). */
const TERRAINS: readonly DefenderTerrain[] = ["clear", "forest", "building"];

/** Valor de Artillería 10+ FIJO (16.2, 39.17). */
const ARTILLERY_BASE: BaseHitInput = { threshold: 10, fixed: true };

/** Genera un identificador no vacío con un prefijo dado. */
const idSuffixArbitrary = fc.integer({ min: 1, max: 999 });

/** Construye una Unidad británica activa con la Cobertura indicada. */
function britishAt(suffix: number, cover: number): PieceState {
  return pieceState({
    id: pieceId(`brit-${suffix}`),
    definitionId: catalogId("british-rifle-squad"),
    side: "british",
    hexId: hexId(`hex-${suffix}`),
    cover,
    visibility: "revealed",
    status: "active",
  });
}

/** Construye una Artillería alemana activa. */
function artilleryAt(suffix: number): PieceState {
  return pieceState({
    id: pieceId(`art-${suffix}`),
    definitionId: catalogId("german-artillery"),
    side: "german",
    hexId: hexId(`hex-${suffix}`),
    visibility: "revealed",
    status: "active",
  });
}

/**
 * Genera un candidato de Artillería VÁLIDO: una Unidad británica activa con
 * terreno y Cobertura arbitrarios dentro del espacio de entrada.
 */
const candidateArbitrary: fc.Arbitrary<ArtilleryCandidate> = fc
  .record({
    suffix: idSuffixArbitrary,
    cover: fc.integer({ min: 0, max: 5 }),
    terrain: fc.constantFrom(...TERRAINS),
  })
  .map(({ suffix, cover, terrain }) => ({ piece: britishAt(suffix, cover), terrain }));

/** Un candidato es elegible si terreno despejado y sin Cobertura acumulada. */
function isEligibleByRule(candidate: ArtilleryCandidate): boolean {
  return candidate.terrain === "clear" && candidate.piece.cover === 0;
}

describe("propiedades de selección y resolución de Artillería", () => {
  // Feature: fields-of-normandy-pwa, Property 13: Selección y resolución de Artillería
  it("objetivo si y solo si sin bosque/edificio/Cobertura, sin Flanqueo, resolución fija 10+ y eliminación por impacto", () => {
    fc.assert(
      fc.property(candidateArbitrary, idSuffixArbitrary, (candidate, artillerySuffix) => {
        // (1) Objetivo SI Y SOLO SI no bosque, no edificio y sin Cobertura.
        expect(isArtilleryTargetEligible(candidate)).toBe(isEligibleByRule(candidate));

        // (2) La Artillería nunca admite Flanqueo (39.14).
        expect(artilleryAllowsFlanking()).toBe(false);

        // (3) La resolución es fija 10+ sin modificadores (16.2, 39.17).
        const outcome = resolveArtilleryAttack(ARTILLERY_BASE);
        expect(outcome.kind).toBe("resolved");
        if (outcome.kind === "resolved") {
          expect(outcome.resolution.fixed).toBe(true);
          expect(outcome.resolution.effectiveThreshold).toBe(ARTILLERY_BASE.threshold);
          expect(outcome.resolution.operands).toHaveLength(0);
        }

        // (4) Una Artillería impactada se elimina sin mutar la Ficha recibida.
        const artillery = artilleryAt(artillerySuffix);
        const eliminated = eliminateArtillery(artillery);
        expect(eliminated.status).toBe("eliminated");
        expect(artillery.status).toBe("active");

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
