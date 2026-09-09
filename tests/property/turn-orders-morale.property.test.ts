import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  PHASE_SEQUENCE,
  allowedOrderOptions,
  crossActivationRoll,
  isDouble,
  isOrderOptionAllowed,
  phasePrecedes,
  resolveOrderOption,
  type ActivationRoll,
  type DiePip,
  type MoraleState,
  type OrderCode,
  type OrderOptionKind,
  type OrderTableRow,
  type OrderTableView,
} from "../../src/domain/rules/turn-order-policy.js";
import {
  activationOrderOptions,
  applyHitToMorale,
  isActivationOrderOptionAllowed,
  shouldEndActivationAfterRegroup,
  type ActivationContext,
} from "../../src/domain/rules/morale-policy.js";
import {
  applyCoverOrder,
  canScout,
  resolveAdvance,
  resolveScout,
  type ForwardArc,
} from "../../src/domain/rules/order-effects.js";
import {
  buildHexGeometry,
  directionId,
  hexDefinition,
  hexEdge,
  hexId,
  hexMapDefinition,
  pieceId,
  pieceState,
  visualReview,
  type DirectionId,
  type HexDefinition,
  type HexId,
  type MissionSourceRef,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId, missionId } from "../../src/domain/identity/index.js";
import type { BritishUnitType } from "../../src/domain/rules/turn-order-policy.js";

/**
 * Propiedad 9 (Tarea 9.4): invariantes que ATAN activación, órdenes y Moral a
 * través de los tres submódulos de 9.1/9.2/9.3 (`TurnOrderPolicy`,
 * `MoralePolicy`, `order-effects`). Se verifica una única propiedad fast-check
 * con `numRuns: 100` que compone, sobre entradas generadas dentro del espacio
 * válido (d6 1..6, Tablas de seis filas, identificadores no vacíos), los
 * invariantes universales de la secuencia de fases, el cruce de la tirada, las
 * opciones exactas por Moral/dobles, la limitación por Moral inicial baja, la
 * resolución en orden definido, los impactos sobre la Moral y los efectos de
 * Avanzar/Explorar/Cobertura.
 *
 * El generador construye siempre datos válidos con los constructores del
 * dominio, de modo que la propiedad ataca invariantes reales y no violaciones
 * de precondiciones de constructor.
 */

/** Referencia de misión mínima para un Mapa publicable de prueba. */
const missionRef: MissionSourceRef = {
  sourceVersion: "FON-ML-2022",
  page: 17,
  element: "Mapa Misión",
  missionRef: "FON-ML-2022-M01",
};

/** Los seis Códigos de Orden disponibles para poblar la Tabla generada. */
const ORDER_CODES: readonly OrderCode[] = [
  "RAL",
  "GRE",
  "ADV",
  "SCO",
  "COV",
  "FIRE",
];

/** Las cuatro opciones de Orden posibles, para probar rechazo de las no permitidas. */
const ALL_OPTIONS: readonly OrderOptionKind[] = [
  "first",
  "second",
  "both",
  "discard",
];

/** Los cuatro tipos de Unidad británica con Tabla de órdenes propia. */
const UNIT_TYPES: readonly BritishUnitType[] = [
  "rifle-squad",
  "mg-team",
  "mortar",
  "piat",
];

/** Generador de una cara de d6 válida (1..6). */
const diePipArbitrary = fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<DiePip>;

/** Generador de un Código de Orden del conjunto canónico. */
const orderCodeArbitrary = fc.constantFrom(...ORDER_CODES);

/**
 * Genera una Tabla de órdenes VÁLIDA con EXACTAMENTE las seis filas 1..6, cada
 * una con su par de Órdenes (primera/segunda columna).
 */
const orderTableArbitrary: fc.Arbitrary<OrderTableView> = fc
  .array(fc.tuple(orderCodeArbitrary, orderCodeArbitrary), {
    minLength: 6,
    maxLength: 6,
  })
  .map((pairs): OrderTableView => {
    const rows: OrderTableRow[] = pairs.map((pair, index) => ({
      input: (index + 1) as DiePip,
      output: { first: pair[0], second: pair[1] },
    }));
    return { rows };
  });

/** Genera una tirada de activación válida (dos d6 1..6). */
const rollArbitrary: fc.Arbitrary<ActivationRoll> = fc
  .tuple(diePipArbitrary, diePipArbitrary)
  .map(([firstDie, secondDie]) => ({ firstDie, secondDie }));

/** Genera un estado de Moral válido. */
const moraleArbitrary = fc.constantFrom<MoraleState>("normal", "low");

/** Genera un tipo de Unidad británica. */
const unitTypeArbitrary = fc.constantFrom<BritishUnitType>(...UNIT_TYPES);

/**
 * Construye una geometría de dos Hexágonos adyacentes «origin»↔«front» con el
 * arco frontal que sitúa «front» en una Dirección hacia delante. Devuelve
 * también un arco que NO incluye esa Dirección, para probar el rechazo.
 */
function buildTwoHexScenario(): {
  origin: HexId;
  front: HexId;
  geometry: ReturnType<typeof buildHexGeometry>;
  forwardArc: ForwardArc;
} {
  const origin = hexId("origin");
  const front = hexId("front");
  const hexes: Record<string, HexDefinition> = {
    origin: hexDefinition({ id: origin, coordinate: { label: "O", q: 0, r: 0 } }),
    front: hexDefinition({ id: front, coordinate: { label: "F", q: 1, r: 0 } }),
  };
  const map = hexMapDefinition({
    missionId: missionId("m01"),
    hexes: hexes as Record<HexId, HexDefinition>,
    undirectedEdges: [hexEdge({ a: origin, b: front })],
    transcriptionReview: visualReview({ dp001Status: "pending", missionRef }),
  });
  const north = directionId("N");
  const forwardArc: ForwardArc = {
    forwardDirections: [north],
    directionOf: { [front]: north } as Record<HexId, DirectionId>,
  };
  return { origin, front, geometry: buildHexGeometry(map), forwardArc };
}

/** Crea una Unidad británica activa situada en el Hexágono de origen con Cobertura dada. */
function britishMover(origin: HexId, cover: number): PieceState {
  return pieceState({
    id: pieceId("brit-mover"),
    definitionId: catalogId("brit-def"),
    side: "british",
    hexId: origin,
    cover,
    status: "active",
    visibility: "revealed",
  });
}

// Escenario geométrico fijo y válido reutilizado por todas las ejecuciones.
const scenario = buildTwoHexScenario();

describe("propiedades de activación, órdenes y Moral", () => {
  // Feature: fields-of-normandy-pwa, Property 9: Activación, órdenes y Moral
  it("secuencia de fases, cruce de tirada, opciones por Moral/dobles, limitación por Moral inicial, impactos y efectos de Órdenes", () => {
    fc.assert(
      fc.property(
        orderTableArbitrary,
        rollArbitrary,
        moraleArbitrary,
        unitTypeArbitrary,
        fc.constantFrom<OrderOptionKind>(...ALL_OPTIONS),
        fc.integer({ min: 0, max: 5 }),
        (table, roll, morale, unitType, option, cover) => {
          const double = isDouble(roll);

          // (1) Secuencia de fases: la británica precede SIEMPRE a la alemana.
          expect(PHASE_SEQUENCE).toEqual(["british", "german"]);
          expect(phasePrecedes("british", "german")).toBe(true);
          expect(phasePrecedes("german", "british")).toBe(false);
          expect(phasePrecedes("british", "british")).toBe(false);

          // (2) Cruce de la tirada: primera columna del primer d6, segunda del segundo.
          const crossed = crossActivationRoll(table, roll);
          expect(crossed.firstColumn).toBe(table.rows[roll.firstDie - 1]!.output.first);
          expect(crossed.secondColumn).toBe(table.rows[roll.secondDie - 1]!.output.second);

          // (3) Opciones EXACTAS por Moral y dobles.
          const options = allowedOrderOptions(morale, roll);
          const expectedOptions = expectedAllowedOptions(morale, double);
          expect(options).toEqual(expectedOptions);

          // (4) Limitación por Moral inicial baja: una activación iniciada con
          //     Moral baja NUNCA habilita «second» ni «both», aunque la Moral
          //     actual sea normal (Reagrupar) y con independencia de dobles.
          const lowStartContext: ActivationContext = {
            startedWithLowMorale: true,
            roll,
          };
          const restoredOptions = activationOrderOptions(lowStartContext, "normal");
          expect(restoredOptions).toEqual(["first", "discard"]);
          expect(isActivationOrderOptionAllowed("second", lowStartContext, "normal")).toBe(false);
          expect(isActivationOrderOptionAllowed("both", lowStartContext, "normal")).toBe(false);
          expect(shouldEndActivationAfterRegroup(lowStartContext)).toBe(true);
          expect(shouldEndActivationAfterRegroup({ startedWithLowMorale: false, roll })).toBe(false);

          // (5) Resolución en orden definido y rechazo sin cambio de estado.
          const resolution = resolveOrderOption(option, morale, roll, crossed);
          if (!isOrderOptionAllowed(option, morale, roll)) {
            expect(resolution.kind).toBe("rejected");
          } else if (resolution.kind === "resolved") {
            expect(resolution.orders).toEqual(expectedOrders(option, crossed));
          } else {
            throw new Error("una opción permitida no puede resolverse como rechazo");
          }

          // (6) Impactos sobre la Moral: normal→low; low→eliminado.
          const hit = applyHitToMorale(morale);
          if (morale === "low") {
            expect(hit).toEqual({ kind: "eliminated" });
          } else {
            expect(hit).toEqual({ kind: "morale-changed", morale: "low" });
          }

          // (7) Avanzar: al hexágono frontal deja Cobertura 0 y no muta la Ficha.
          const mover = britishMover(scenario.origin, cover);
          const advance = resolveAdvance(scenario.geometry, {
            mover,
            destination: scenario.front,
            forwardArc: scenario.forwardArc,
            board: [mover],
          });
          expect(advance.kind).toBe("advanced");
          if (advance.kind === "advanced") {
            expect(advance.piece.cover).toBe(0);
            expect(advance.piece.hexId).toBe(scenario.front);
          }
          expect(mover.cover).toBe(cover);

          // (8) Cobertura: la Orden acumula +1 sin mutar la Ficha original.
          const covered = applyCoverOrder(mover);
          expect(covered.cover).toBe(cover + 1);
          expect(mover.cover).toBe(cover);

          // (9) Explorar: excluido para MG/Mortero/PIAT, permitido solo a escuadras.
          const scoutOutcome = resolveScout(scenario.geometry, {
            scout: mover,
            unitType,
            board: [mover],
          });
          if (unitType === "rifle-squad") {
            expect(canScout(unitType)).toBe(true);
            expect(scoutOutcome.kind).toBe("scouted");
          } else {
            expect(canScout(unitType)).toBe(false);
            expect(scoutOutcome.kind).toBe("rejected");
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Conjunto exacto de opciones esperado según Moral y dobles (34.8, 34.15, 34.16). */
function expectedAllowedOptions(
  morale: MoraleState,
  double: boolean,
): readonly OrderOptionKind[] {
  if (morale === "low") {
    return ["first", "discard"];
  }
  if (double) {
    return ["first", "second", "discard"];
  }
  return ["first", "second", "both", "discard"];
}

/** Secuencia de Órdenes esperada al resolver una opción permitida (34.9-34.12). */
function expectedOrders(
  option: OrderOptionKind,
  crossed: { firstColumn: OrderCode; secondColumn: OrderCode },
): readonly OrderCode[] {
  if (option === "discard") {
    return [];
  }
  if (option === "first") {
    return [crossed.firstColumn];
  }
  if (option === "second") {
    return [crossed.secondColumn];
  }
  return [crossed.firstColumn, crossed.secondColumn];
}
