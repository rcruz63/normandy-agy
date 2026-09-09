import { describe, expect, it } from "vitest";
import {
  activationEndedAfterRegroupMessage,
  activationOrderOptions,
  applyHitToMorale,
  applyRegroupToMorale,
  isActivationOrderOptionAllowed,
  shouldEndActivationAfterRegroup,
  type ActivationContext,
} from "../../src/domain/rules/morale-policy.js";
import type { ActivationRoll } from "../../src/domain/rules/turn-order-policy.js";

// --- Fixtures reutilizables ---

function roll(
  firstDie: ActivationRoll["firstDie"],
  secondDie: ActivationRoll["secondDie"],
): ActivationRoll {
  return { firstDie, secondDie };
}

function context(
  startedWithLowMorale: boolean,
  activationRoll: ActivationRoll,
): ActivationContext {
  return { startedWithLowMorale, roll: activationRoll };
}

// --- Impactos sobre la Moral (37.1, 37.2) ---

describe("aplicación de impactos sobre la Moral", () => {
  it("degrada de Moral normal a Moral baja al recibir un impacto", () => {
    const outcome = applyHitToMorale("normal");
    expect(outcome).toEqual({ kind: "morale-changed", morale: "low" });
  });

  it("elimina la Unidad al recibir un impacto con Moral baja", () => {
    const outcome = applyHitToMorale("low");
    expect(outcome).toEqual({ kind: "eliminated" });
  });

  it("devuelve un resultado inmutable", () => {
    const outcome = applyHitToMorale("normal");
    expect(Object.isFrozen(outcome)).toBe(true);
  });
});

// --- Reagrupar (35.11) ---

describe("efecto de Reagrupar sobre la Moral", () => {
  it("restaura la Moral baja a normal", () => {
    expect(applyRegroupToMorale("low")).toBe("normal");
  });

  it("mantiene la Moral normal en normal", () => {
    expect(applyRegroupToMorale("normal")).toBe("normal");
  });
});

// --- Limitación de la activación iniciada con Moral baja (34.16, 34.17, 35.12) ---

describe("opciones de Orden de la activación", () => {
  it("limita a primera columna o descartar cuando comenzó con Moral baja y valores distintos", () => {
    const options = activationOrderOptions(context(true, roll(2, 5)), "low");
    expect(options).toEqual(["first", "discard"]);
  });

  it("limita a primera columna o descartar cuando comenzó con Moral baja aunque la tirada sea doble", () => {
    const options = activationOrderOptions(context(true, roll(4, 4)), "low");
    expect(options).toEqual(["first", "discard"]);
  });

  it("mantiene la limitación aunque Reagrupar haya restaurado la Moral actual a normal", () => {
    const options = activationOrderOptions(context(true, roll(2, 5)), "normal");
    expect(options).toEqual(["first", "discard"]);
  });

  it("ofrece las cuatro opciones cuando comenzó con Moral normal y valores distintos", () => {
    const options = activationOrderOptions(context(false, roll(2, 5)), "normal");
    expect(options).toEqual(["first", "second", "both", "discard"]);
  });

  it("ofrece una sola Orden o descartar cuando comenzó con Moral normal y dobles", () => {
    const options = activationOrderOptions(context(false, roll(3, 3)), "normal");
    expect(options).toEqual(["first", "second", "discard"]);
  });
});

describe("permiso de una opción concreta en la activación", () => {
  it("permite la primera columna en una activación iniciada con Moral baja", () => {
    const allowed = isActivationOrderOptionAllowed(
      "first",
      context(true, roll(2, 5)),
      "low",
    );
    expect(allowed).toBe(true);
  });

  it("rechaza la segunda columna aunque Reagrupar haya restaurado la Moral a normal", () => {
    const allowed = isActivationOrderOptionAllowed(
      "second",
      context(true, roll(2, 5)),
      "normal",
    );
    expect(allowed).toBe(false);
  });

  it("rechaza ejecutar ambas columnas en una activación iniciada con Moral baja", () => {
    const allowed = isActivationOrderOptionAllowed(
      "both",
      context(true, roll(2, 5)),
      "normal",
    );
    expect(allowed).toBe(false);
  });

  it("permite la segunda columna cuando comenzó con Moral normal y valores distintos", () => {
    const allowed = isActivationOrderOptionAllowed(
      "second",
      context(false, roll(2, 5)),
      "normal",
    );
    expect(allowed).toBe(true);
  });
});

describe("cierre de la activación tras Reagrupar", () => {
  it("finaliza la activación cuando comenzó con Moral baja", () => {
    expect(shouldEndActivationAfterRegroup(context(true, roll(1, 6)))).toBe(true);
  });

  it("no fuerza el cierre cuando comenzó con Moral normal", () => {
    expect(shouldEndActivationAfterRegroup(context(false, roll(1, 6)))).toBe(
      false,
    );
  });

  it("transporta el motivo del cierre por messageKey es-ES", () => {
    expect(activationEndedAfterRegroupMessage()).toEqual({
      messageKey: "rules.morale.activationEndedAfterRegroup",
    });
  });
});
