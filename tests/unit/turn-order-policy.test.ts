import { describe, expect, it } from "vitest";
import {
  PHASE_SEQUENCE,
  TurnOrderPolicyError,
  allowedOrderOptions,
  canBeginGermanPhase,
  crossActivationRoll,
  isDouble,
  isOrderOptionAllowed,
  isPhaseComplete,
  nextActivatableUnit,
  phasePrecedes,
  resolveOrderOption,
  type ActivationQueue,
  type ActivationRoll,
  type CrossedOrders,
  type OrderTableRow,
  type OrderTableView,
} from "../../src/domain/rules/turn-order-policy.js";

// --- Fixtures reutilizables ---

// Tabla de la Escuadra de fusileros (requisito 34), usada para el cruce.
const rifleSquadRows: readonly OrderTableRow[] = [
  { input: 1, output: { first: "RAL", second: "GRE" } },
  { input: 2, output: { first: "ADV", second: "SCO" } },
  { input: 3, output: { first: "ADV", second: "COV" } },
  { input: 4, output: { first: "FIRE", second: "COV" } },
  { input: 5, output: { first: "FIRE", second: "ADV" } },
  { input: 6, output: { first: "ADV", second: "FIRE" } },
];

const rifleSquadTable: OrderTableView = { rows: rifleSquadRows };

function makeQueue(overrides: Partial<ActivationQueue> = {}): ActivationQueue {
  return {
    side: "british",
    pending: ["u-1", "u-2"],
    activated: [],
    ...overrides,
  };
}

function roll(firstDie: ActivationRoll["firstDie"], secondDie: ActivationRoll["secondDie"]): ActivationRoll {
  return { firstDie, secondDie };
}

// --- Secuencia de fases: británica antes que alemana ---

describe("secuencia de fases del turno", () => {
  it("ordena la fase británica antes que la alemana", () => {
    expect(PHASE_SEQUENCE).toEqual(["british", "german"]);
  });

  it("confirma que la fase británica precede a la alemana", () => {
    expect(phasePrecedes("british", "german")).toBe(true);
  });

  it("niega que la fase alemana preceda a la británica", () => {
    expect(phasePrecedes("german", "british")).toBe(false);
  });

  it("niega que una fase se preceda a sí misma", () => {
    expect(phasePrecedes("british", "british")).toBe(false);
  });
});

// --- Activación una a una ---

describe("activación una a una", () => {
  it("devuelve la primera Unidad pendiente como siguiente activable", () => {
    expect(nextActivatableUnit(makeQueue())).toBe("u-1");
  });

  it("devuelve indefinido cuando no quedan Unidades pendientes", () => {
    expect(nextActivatableUnit(makeQueue({ pending: [] }))).toBeUndefined();
  });

  it("marca la fase completa solo cuando no quedan pendientes", () => {
    expect(isPhaseComplete(makeQueue({ pending: [] }))).toBe(true);
    expect(isPhaseComplete(makeQueue({ pending: ["u-2"] }))).toBe(false);
  });

  it("permite la fase alemana solo tras completar la británica", () => {
    const completed = makeQueue({ pending: [], activated: ["u-1", "u-2"] });
    expect(canBeginGermanPhase(completed)).toBe(true);
  });

  it("impide la fase alemana mientras queden Unidades británicas pendientes", () => {
    expect(canBeginGermanPhase(makeQueue({ pending: ["u-2"] }))).toBe(false);
  });
});

// --- Detección de dobles ---

describe("detección de dobles en la tirada", () => {
  it("reconoce una tirada doble", () => {
    expect(isDouble(roll(4, 4))).toBe(true);
  });

  it("reconoce una tirada no doble", () => {
    expect(isDouble(roll(2, 5))).toBe(false);
  });
});

// --- Cruce del d6 con las columnas de la Tabla de órdenes ---

describe("cruce de la tirada con la Tabla de órdenes", () => {
  it("cruza el primer d6 con la primera columna y el segundo con la segunda", () => {
    const crossed = crossActivationRoll(rifleSquadTable, roll(2, 4));
    expect(crossed).toEqual({ firstColumn: "ADV", secondColumn: "COV" });
  });

  it("toma columnas de filas distintas según cada d6", () => {
    const crossed = crossActivationRoll(rifleSquadTable, roll(1, 5));
    expect(crossed).toEqual({ firstColumn: "RAL", secondColumn: "ADV" });
  });

  it("rechaza una tabla que no tiene exactamente seis filas", () => {
    const shortTable: OrderTableView = { rows: rifleSquadRows.slice(0, 5) };
    expect(() => crossActivationRoll(shortTable, roll(1, 1))).toThrow(
      TurnOrderPolicyError,
    );
  });

  it("rechaza un valor de d6 fuera del rango 1..6", () => {
    expect(() =>
      crossActivationRoll(rifleSquadTable, { firstDie: 7 as never, secondDie: 2 }),
    ).toThrow(TurnOrderPolicyError);
  });
});

// --- Opciones exactas por Moral y dobles ---

describe("opciones de Orden por Moral y tirada", () => {
  it("ofrece exactamente cuatro opciones con Moral normal y valores distintos", () => {
    expect(allowedOrderOptions("normal", roll(2, 5))).toEqual([
      "first",
      "second",
      "both",
      "discard",
    ]);
  });

  it("ofrece una sola Orden de la fila o descartar con Moral normal y dobles", () => {
    expect(allowedOrderOptions("normal", roll(3, 3))).toEqual([
      "first",
      "second",
      "discard",
    ]);
  });

  it("limita Moral baja a la primera columna o ninguna Orden sin dobles", () => {
    expect(allowedOrderOptions("low", roll(2, 5))).toEqual(["first", "discard"]);
  });

  it("limita Moral baja igual con dobles que sin ellos", () => {
    expect(allowedOrderOptions("low", roll(4, 4))).toEqual(["first", "discard"]);
  });
});

// --- Resolución de la opción en el orden definido ---

describe("resolución de la opción elegida", () => {
  const crossed: CrossedOrders = { firstColumn: "ADV", secondColumn: "COV" };

  it("resuelve solo la primera columna al elegir first", () => {
    const result = resolveOrderOption("first", "normal", roll(2, 4), crossed);
    expect(result).toEqual({ kind: "resolved", orders: ["ADV"] });
  });

  it("resuelve solo la segunda columna al elegir second", () => {
    const result = resolveOrderOption("second", "normal", roll(2, 4), crossed);
    expect(result).toEqual({ kind: "resolved", orders: ["COV"] });
  });

  it("resuelve ambas primero la primera y después la segunda", () => {
    const result = resolveOrderOption("both", "normal", roll(2, 4), crossed);
    expect(result).toEqual({ kind: "resolved", orders: ["ADV", "COV"] });
  });

  it("finaliza la activación sin Orden al descartar", () => {
    const result = resolveOrderOption("discard", "normal", roll(2, 4), crossed);
    expect(result).toEqual({ kind: "resolved", orders: [] });
  });

  it("rechaza ejecutar ambas con Moral baja sin cambiar estado ni consumir azar", () => {
    const result = resolveOrderOption("both", "low", roll(2, 4), crossed);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason.messageKey).toBe("rules.orders.optionNotAllowed");
    }
  });

  it("rechaza ejecutar ambas con Moral normal y dobles pero permite una sola Orden", () => {
    const doubleRoll = roll(3, 3);
    expect(isOrderOptionAllowed("second", "normal", doubleRoll)).toBe(true);
    const rejected = resolveOrderOption("both", "normal", doubleRoll, crossed);
    expect(rejected.kind).toBe("rejected");
  });
});
