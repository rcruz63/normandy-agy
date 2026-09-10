import { describe, expect, it } from "vitest";
import {
  assertMinimumTouchTarget,
  checkTouchTarget,
  meetsMinimumTouchTarget,
  MIN_TOUCH_TARGET_CSS_PX,
  TouchTargetTooSmallError,
} from "../../src/ui/a11y/touch-target.js";

describe("objetivos táctiles mínimos de 44×44 px CSS (24.4)", () => {
  it("fija el umbral canónico en 44 px CSS", () => {
    expect(MIN_TOUCH_TARGET_CSS_PX).toBe(44);
  });

  it("acepta un objetivo justo en el mínimo", () => {
    expect(meetsMinimumTouchTarget({ width: 44, height: 44 })).toBe(true);
  });

  it("acepta un objetivo mayor que el mínimo", () => {
    expect(meetsMinimumTouchTarget({ width: 48, height: 60 })).toBe(true);
  });

  it("rechaza un objetivo con anchura insuficiente", () => {
    expect(meetsMinimumTouchTarget({ width: 40, height: 44 })).toBe(false);
  });

  it("rechaza un objetivo con altura insuficiente", () => {
    expect(meetsMinimumTouchTarget({ width: 44, height: 43 })).toBe(false);
  });

  it("rechaza dimensiones no finitas", () => {
    expect(meetsMinimumTouchTarget({ width: Number.NaN, height: 44 })).toBe(false);
    expect(meetsMinimumTouchTarget({ width: 44, height: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });
});

describe("checkTouchTarget — detalla el incumplimiento", () => {
  it("devuelve undefined cuando el objetivo cumple", () => {
    expect(checkTouchTarget({ width: 44, height: 44 })).toBeUndefined();
  });

  it("identifica ambas dimensiones deficientes", () => {
    const violation = checkTouchTarget({ width: 20, height: 10 });
    expect(violation?.failing).toEqual(["width", "height"]);
  });

  it("identifica solo la dimensión deficiente", () => {
    const violation = checkTouchTarget({ width: 44, height: 20 });
    expect(violation?.failing).toEqual(["height"]);
  });
});

describe("assertMinimumTouchTarget — aserción dura", () => {
  it("no lanza cuando el objetivo cumple", () => {
    expect(() => assertMinimumTouchTarget({ width: 44, height: 44 }, "botón")).not.toThrow();
  });

  it("lanza TouchTargetTooSmallError con el nombre y las medidas", () => {
    try {
      assertMinimumTouchTarget({ width: 30, height: 44 }, "botón-cancelar");
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(TouchTargetTooSmallError);
      const typed = error as TouchTargetTooSmallError;
      expect(typed.message).toContain("botón-cancelar");
      expect(typed.violation.failing).toEqual(["width"]);
    }
  });
});
