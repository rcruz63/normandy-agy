import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  prepareMission,
  type BritishForceView,
  type DurationChoice,
  type FixedGermanUnitView,
  type FixedGermanUnitsView,
  type MissionObjective,
  type MissionSetupRequest,
} from "../../src/domain/rules/mission-setup.js";
import {
  getMissionByNumber,
  MISSIONS,
  type MissionIdentity,
} from "../../src/catalog/FON-ML-2022/missions.js";
import {
  BRITISH_FORCES_BY_MISSION,
  FIXED_GERMAN_FORCES_BY_MISSION,
  missionKey,
  type BritishForcesFixture,
  type FixedGermanForcesFixture,
  type FixedGermanUnit,
  type ForceEntry,
} from "../../src/catalog/FON-ML-2022/forces-reveal.js";

/**
 * Propiedad 2 (Tarea 11.5): conformidad catálogo↔preparación exacta por Misión.
 * Una única propiedad `fast-check` con `numRuns: 100` que, para CADA una de las
 * quince Misiones verificadas, compone los fixtures canónicos del catálogo
 * (`MISSIONS`/`getMissionByNumber`, `BRITISH_FORCES_BY_MISSION`,
 * `FIXED_GERMAN_FORCES_BY_MISSION`) con `prepareMission` del dominio y verifica:
 *
 * - FUERZAS BRITÁNICAS EXACTAS (33.1): la preparación incluye EXACTAMENTE las
 *   fuerzas del fixture `BRITISH_FORCES_BY_MISSION` (mismo tipo, designación y
 *   orden).
 * - UNIDADES FIJAS (33.3, 33.6): las unidades fijas del fixture, todas
 *   reveladas; la ausencia explícita produce una lista vacía.
 * - DURACIÓN base∓1 (32.4, 32.5, 32.8, 32.9, 32.10): la duración disponible es
 *   la correcta según la variante elegida sobre los turnos base de la identidad.
 * - OBJETIVO TIPADO (32.11): coherente con la identidad de Misión de `MISSIONS`.
 *
 * El fixture del catálogo se adapta a las vistas estructurales del dominio
 * (`BritishForceView`, `FixedGermanUnitsView`, `MissionObjective`) mediante
 * auxiliares fuera del `it`, sin lógica compleja dentro de la propiedad.
 *
 * **Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.6,
 * 8.1, 17.8, 32.1, 32.2, 32.3, 32.4, 32.5, 32.8, 32.9, 32.10, 32.11, 33.1,
 * 33.3, 33.6, 33.7**
 */

/** Las tres variantes de duración, en orden creciente de turnos. */
const CHOICES: readonly DurationChoice[] = ["shorter", "base", "longer"];

/** Delta de turnos esperado por variante (32.8/32.10/32.9). */
const EXPECTED_DELTA: Readonly<Record<DurationChoice, number>> = Object.freeze({
  shorter: -1,
  base: 0,
  longer: 1,
});

describe("propiedades de catálogo y preparación exactos por Misión", () => {
  // Feature: fields-of-normandy-pwa, Property 2: Catálogo y preparación exactos por Misión
  it("preparación con fuerzas, unidades fijas, duración base∓1 y objetivo tipado exactos para las quince Misiones", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
        fc.constantFrom<DurationChoice>(...CHOICES),
        (missionNumber, choice) => {
          const identity = getMissionByNumber(missionNumber);
          expect(identity).toBeDefined();
          if (identity === undefined) return false;

          const key = missionKey(missionNumber);
          const britishFixture = BRITISH_FORCES_BY_MISSION[key];
          const fixedFixture = FIXED_GERMAN_FORCES_BY_MISSION[key];
          expect(britishFixture).toBeDefined();
          expect(fixedFixture).toBeDefined();
          if (britishFixture === undefined || fixedFixture === undefined) return false;

          const setup = prepareMission(
            buildRequest(identity, britishFixture, fixedFixture, choice),
          );

          // (32.1, 32.2) La preparación corresponde a la Misión solicitada.
          expect(setup.missionNumber).toBe(missionNumber);

          // (33.1) Fuerzas británicas EXACTAS del fixture (tipo/designación/orden).
          expect(setup.britishForces).toEqual(expectedBritishForces(britishFixture));

          // (33.3, 33.6) Unidades fijas del fixture, todas reveladas, o lista vacía.
          expect(setup.fixedGermanUnits).toEqual(expectedFixedUnits(fixedFixture));

          // (32.4, 32.5, 32.8, 32.9, 32.10) Duración disponible base∓1 correcta.
          expect(setup.availableTurns).toBe(identity.baseTurns + EXPECTED_DELTA[choice]);
          expect(setup.durationChoice).toBe(choice);

          // (32.11) Objetivo tipado coherente con la identidad de Misión.
          expect(setup.objective).toEqual(objectiveFor(identity));

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Adapta una entrada de fuerza del catálogo a la vista estructural del dominio (33.1). */
function toBritishForceView(entry: ForceEntry): BritishForceView {
  if (entry.kind === "rifle-squad" && entry.squad !== undefined) {
    return { kind: "rifle-squad", squad: entry.squad, labelEs: entry.labelEs };
  }
  return { kind: entry.kind, labelEs: entry.labelEs };
}

/** Fuerzas británicas esperadas (adaptadas del fixture) para la comparación. */
function expectedBritishForces(
  fixture: BritishForcesFixture,
): readonly BritishForceView[] {
  return fixture.forces.map(toBritishForceView);
}

/** Adapta una unidad fija del catálogo a la vista estructural del dominio (33.3). */
function toFixedUnitView(unit: FixedGermanUnit): FixedGermanUnitView {
  if (unit.semanticAnchorEs === undefined) {
    return { kind: unit.kind, labelEs: unit.labelEs };
  }
  return { kind: unit.kind, labelEs: unit.labelEs, semanticAnchorEs: unit.semanticAnchorEs };
}

/** Vista estructural de unidades fijas adaptada desde el fixture (33.3, 33.6). */
function toFixedUnitsView(fixture: FixedGermanForcesFixture): FixedGermanUnitsView {
  if (!fixture.present) {
    return { present: false };
  }
  const [first, ...rest] = fixture.units.map(toFixedUnitView);
  return { present: true, units: [first!, ...rest] };
}

/** Unidades fijas preparadas esperadas: todas reveladas, o lista vacía si ausentes (33.6). */
function expectedFixedUnits(fixture: FixedGermanForcesFixture) {
  if (!fixture.present) {
    return [];
  }
  return fixture.units.map((unit) =>
    unit.semanticAnchorEs === undefined
      ? { kind: unit.kind, labelEs: unit.labelEs, revealed: true }
      : {
          kind: unit.kind,
          labelEs: unit.labelEs,
          semanticAnchorEs: unit.semanticAnchorEs,
          revealed: true,
        },
  );
}

/**
 * Deriva el objetivo tipado a partir de la identidad de Misión (32.11):
 * M01 → `eliminate-single-revealed-german`; M08/M14 → `occupy-church-hex`;
 * M11 → `destroy-artillery`; resto → `eliminate-all-germans`.
 */
function objectiveFor(identity: MissionIdentity): MissionObjective {
  if (identity.number === 1) {
    return { kind: "eliminate-single-revealed-german" };
  }
  if (identity.number === 8 || identity.number === 14) {
    return { kind: "occupy-church-hex" };
  }
  if (identity.number === 11) {
    return { kind: "destroy-artillery" };
  }
  return { kind: "eliminate-all-germans" };
}

/** Construye la petición de preparación adaptando los fixtures canónicos. */
function buildRequest(
  identity: MissionIdentity,
  britishFixture: BritishForcesFixture,
  fixedFixture: FixedGermanForcesFixture,
  choice: DurationChoice,
): MissionSetupRequest {
  const [first, ...rest] = britishFixture.forces.map(toBritishForceView);
  return {
    missionNumber: identity.number,
    duration: { baseTurns: identity.baseTurns },
    durationChoice: choice,
    britishForces: [first!, ...rest],
    fixedGermanUnits: toFixedUnitsView(fixedFixture),
    objective: objectiveFor(identity),
    revealTable: { missionRef: identity.missionRef },
  };
}

/** Referencia estática para asegurar la cobertura de las quince identidades. */
const MISSION_COUNT: number = MISSIONS.length;
if (MISSION_COUNT !== 15) {
  throw new Error(`Se esperaban 15 Misiones verificadas, hay ${String(MISSION_COUNT)}`);
}
