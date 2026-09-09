import { describe, expect, it } from "vitest";
import {
  isPiatTargetEligible,
  resolveCombat,
  type CombatModifierContext,
  type CombatResolutionRequest,
  type ModifierOperand,
} from "../../src/domain/rules/combat-resolver.js";

// --- Ayudas de construcción de peticiones ---

/** Contexto de modificadores neutro (terreno despejado, sin ventajas). */
const clearContext: CombatModifierContext = {
  defenderTerrain: "clear",
  attackerOnHill: false,
  flanking: false,
  supportingUnits: 0,
  mortar: "none",
};

function fireRequest(
  modifiers: Partial<CombatModifierContext> = {},
  threshold = 8,
): CombatResolutionRequest {
  return {
    kind: "fire",
    base: { threshold, fixed: false },
    modifiers: { ...clearContext, ...modifiers },
  };
}

/** Extrae la resolución exigiendo que el ataque no fuese rechazado. */
function expectResolved(request: CombatResolutionRequest) {
  const outcome = resolveCombat(request);
  if (outcome.kind !== "resolved") {
    throw new Error(`Se esperaba una resolución, no un rechazo: ${outcome.reason.messageKey}`);
  }
  return outcome.resolution;
}

function operandValue(operands: readonly ModifierOperand[], source: ModifierOperand["source"]): number | undefined {
  return operands.find((operand) => operand.source === source)?.value;
}

describe("CombatResolver: suma algebraica del Valor para impactar", () => {
  it("conserva el Valor base cuando no hay ningún modificador aplicable", () => {
    const resolution = expectResolved(fireRequest());
    expect(resolution.baseThreshold).toBe(8);
    expect(resolution.modifierTotal).toBe(0);
    expect(resolution.effectiveThreshold).toBe(8);
    expect(resolution.operands).toHaveLength(0);
    expect(resolution.fixed).toBe(false);
  });

  it("suma algebraicamente bosque, colina y Flanqueo con su signo", () => {
    const resolution = expectResolved(
      fireRequest({ defenderTerrain: "forest", attackerOnHill: true, flanking: true }),
    );
    // 8 + (+1 bosque) + (-1 colina) + (-1 Flanqueo) = 7
    expect(resolution.modifierTotal).toBe(-1);
    expect(resolution.effectiveThreshold).toBe(7);
    expect(operandValue(resolution.operands, "forest")).toBe(1);
    expect(operandValue(resolution.operands, "hill")).toBe(-1);
    expect(operandValue(resolution.operands, "flanking")).toBe(-1);
  });

  it("produce el mismo total independientemente del orden de enumeración de las fuentes", () => {
    const total = expectResolved(
      fireRequest({ defenderTerrain: "building", attackerOnHill: true, flanking: true, supportingUnits: 2 }),
    ).modifierTotal;
    // El orden de los operandos en el desglose no altera la suma.
    const reversedTotal = expectResolved(
      fireRequest({ supportingUnits: 2, flanking: true, attackerOnHill: true, defenderTerrain: "building" }),
    ).modifierTotal;
    expect(total).toBe(reversedTotal);
    // +2 edificio -1 colina -1 Flanqueo -2 Apoyo = -2
    expect(total).toBe(-2);
  });

  it("conserva el valor cuando los modificadores se cancelan entre sí", () => {
    const resolution = expectResolved(
      fireRequest({ defenderTerrain: "forest", attackerOnHill: true }),
    );
    // +1 bosque -1 colina = 0
    expect(resolution.modifierTotal).toBe(0);
    expect(resolution.effectiveThreshold).toBe(8);
  });
});

describe("CombatResolver: modificadores de terreno con su signo", () => {
  it("suma +1 por defensor en bosque (36.2)", () => {
    expect(expectResolved(fireRequest({ defenderTerrain: "forest" })).effectiveThreshold).toBe(9);
  });

  it("suma +2 por defensor en edificio (36.3)", () => {
    expect(expectResolved(fireRequest({ defenderTerrain: "building" })).effectiveThreshold).toBe(10);
  });

  it("resta -1 por atacar desde una colina (36.4)", () => {
    expect(expectResolved(fireRequest({ attackerOnHill: true })).effectiveThreshold).toBe(7);
  });

  it("no aplica modificador numérico por el Río al Valor para impactar (16.4/36.9)", () => {
    // El Río conserva la elegibilidad pero no aporta operando; el contexto no lo modela.
    const resolution = expectResolved(fireRequest());
    expect(resolution.operands.some((operand) => operand.source === "forest")).toBe(false);
    expect(resolution.modifierTotal).toBe(0);
  });
});

describe("CombatResolver: valores fijos que excluyen modificadores", () => {
  it("Granada aplica su Valor fijo 6+ ignorando terreno, colina, Flanqueo y Apoyo (12.4, 36.5, 38.7)", () => {
    const resolution = expectResolved({
      kind: "grenade",
      base: { threshold: 6, fixed: true },
      modifiers: {
        defenderTerrain: "building",
        attackerOnHill: true,
        flanking: true,
        supportingUnits: 3,
        mortar: "at-range",
      },
    });
    expect(resolution.fixed).toBe(true);
    expect(resolution.effectiveThreshold).toBe(6);
    expect(resolution.modifierTotal).toBe(0);
    expect(resolution.operands).toHaveLength(0);
  });

  it("la prueba de Mina aplica su Valor fijo 7+ sin modificadores (36.11)", () => {
    const resolution = expectResolved({
      kind: "mine-test",
      base: { threshold: 7, fixed: true },
      modifiers: { defenderTerrain: "forest", attackerOnHill: true, flanking: true, supportingUnits: 5, mortar: "adjacent" },
    });
    expect(resolution.fixed).toBe(true);
    expect(resolution.effectiveThreshold).toBe(7);
    expect(resolution.operands).toHaveLength(0);
  });
});

describe("CombatResolver: Flanqueo, Apoyo y Mortero (38.*)", () => {
  it("resta -1 por Flanqueo al disparar desde fuera de la Zona de fuego (38.1)", () => {
    expect(expectResolved(fireRequest({ flanking: true })).effectiveThreshold).toBe(7);
  });

  it("resta -1 por cada OTRA Unidad de Apoyo sin máximo (38.2, 38.9)", () => {
    const resolution = expectResolved(fireRequest({ supportingUnits: 4 }));
    expect(operandValue(resolution.operands, "support")).toBe(-4);
    expect(resolution.effectiveThreshold).toBe(4);
  });

  it("resta -2 por un Mortero a distancia exactamente 2 del objetivo (38.3)", () => {
    const resolution = expectResolved(fireRequest({ mortar: "at-range" }));
    expect(operandValue(resolution.operands, "mortar")).toBe(-2);
    expect(resolution.effectiveThreshold).toBe(6);
  });

  it("un Mortero adyacente cuenta como Apoyo -1 en lugar del -2 de Mortero (38.4)", () => {
    const resolution = expectResolved(fireRequest({ mortar: "adjacent" }));
    // No hay operando de Mortero -2; el aporte es un Apoyo -1.
    expect(resolution.operands.some((operand) => operand.source === "mortar")).toBe(false);
    expect(operandValue(resolution.operands, "support")).toBe(-1);
    expect(resolution.effectiveThreshold).toBe(7);
  });

  it("acumula Apoyo de Unidades y de un Mortero adyacente en un único operando -1 por unidad (38.2, 38.4)", () => {
    const resolution = expectResolved(fireRequest({ supportingUnits: 2, mortar: "adjacent" }));
    // 2 Unidades + 1 Mortero adyacente = 3 apoyos de -1
    expect(operandValue(resolution.operands, "support")).toBe(-3);
  });
});

describe("CombatResolver: PIAT (36.12, 36.13)", () => {
  it("acepta como objetivo una Semioruga y omite el +2 de edificio (36.12, 36.13)", () => {
    const resolution = expectResolved({
      kind: "piat",
      base: { threshold: 7, fixed: false },
      modifiers: { ...clearContext, defenderTerrain: "building" },
      piatTarget: { targetIsHalftrack: true, targetIsGermanInBuilding: false },
    });
    // El +2 de edificio queda excluido: el umbral efectivo es el base 7.
    expect(resolution.operands.some((operand) => operand.source === "building")).toBe(false);
    expect(resolution.effectiveThreshold).toBe(7);
  });

  it("acepta una Unidad alemana en un edificio y omite el +2 del edificio (36.13)", () => {
    const resolution = expectResolved({
      kind: "piat",
      base: { threshold: 7, fixed: false },
      modifiers: { ...clearContext, defenderTerrain: "building" },
      piatTarget: { targetIsHalftrack: false, targetIsGermanInBuilding: true },
    });
    expect(resolution.effectiveThreshold).toBe(7);
  });

  it("rechaza un objetivo que no es Semioruga ni Unidad en edificio (36.12)", () => {
    const outcome = resolveCombat({
      kind: "piat",
      base: { threshold: 7, fixed: false },
      modifiers: clearContext,
      piatTarget: { targetIsHalftrack: false, targetIsGermanInBuilding: false },
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.reason.messageKey).toBe("rules.combat.piat.ineligibleTarget");
    }
  });

  it("rechaza un PIAT sin hechos de elegibilidad del objetivo", () => {
    const outcome = resolveCombat({
      kind: "piat",
      base: { threshold: 7, fixed: false },
      modifiers: clearContext,
    });
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.reason.messageKey).toBe("rules.combat.piat.missingTargetFacts");
    }
  });

  it("isPiatTargetEligible reconoce Semioruga o Unidad en edificio", () => {
    expect(isPiatTargetEligible({ targetIsHalftrack: true, targetIsGermanInBuilding: false })).toBe(true);
    expect(isPiatTargetEligible({ targetIsHalftrack: false, targetIsGermanInBuilding: true })).toBe(true);
    expect(isPiatTargetEligible({ targetIsHalftrack: false, targetIsGermanInBuilding: false })).toBe(false);
  });
});

describe("CombatResolver: casos límite de entrada", () => {
  it("rechaza un número de Unidades de Apoyo negativo o no entero", () => {
    const negative = resolveCombat(fireRequest({ supportingUnits: -1 }));
    expect(negative.kind).toBe("rejected");
    if (negative.kind === "rejected") {
      expect(negative.reason.messageKey).toBe("rules.combat.support.invalidCount");
    }
    const fractional = resolveCombat(fireRequest({ supportingUnits: 1.5 }));
    expect(fractional.kind).toBe("rejected");
  });
});
