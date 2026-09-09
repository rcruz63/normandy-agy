import { describe, expect, it } from "vitest";
import {
  availableTurnsFor,
  prepareMission,
  InvalidMissionSetupError,
  type BritishForceView,
  type FixedGermanUnitsView,
  type MissionObjective,
  type MissionSetupRequest,
} from "../../src/domain/rules/mission-setup.js";
import {
  evaluateOutcome,
  ARTILLERY_KIND,
  type OutcomePieceView,
  type OutcomeRequest,
  type OutcomeStateView,
} from "../../src/domain/rules/mission-outcome.js";
import { hexId } from "../../src/domain/geometry/identifiers.js";

// ---------------------------------------------------------------------------
// Fixtures de fuerzas por Misión (req. 33, tabla de fuerzas)
// ---------------------------------------------------------------------------

function rifle(squad: string): BritishForceView {
  return { kind: "rifle-squad", squad, labelEs: `Escuadra de fusileros ${squad}` };
}
const MG: BritishForceView = { kind: "mg-team", labelEs: "Equipo MG" };
const MORTAR: BritishForceView = { kind: "mortar", labelEs: "Mortero" };
const PIAT: BritishForceView = { kind: "piat", labelEs: "PIAT" };

const NO_FIXED: FixedGermanUnitsView = { present: false };

function setupRequest(overrides: Partial<MissionSetupRequest>): MissionSetupRequest {
  const base: MissionSetupRequest = {
    missionNumber: 1,
    duration: { baseTurns: 4 },
    durationChoice: "base",
    britishForces: [rifle("A"), rifle("B")],
    fixedGermanUnits: NO_FIXED,
    objective: { kind: "eliminate-single-revealed-german" },
    revealTable: { missionRef: "FON-ML-2022-M01" },
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Preparación: fuerzas exactas por Misión (33.1)
// ---------------------------------------------------------------------------

describe("prepareMission — Fuerzas británicas exactas por Misión (req. 33.1)", () => {
  it("la Misión 1 prepara exactamente las Escuadras de fusileros A y B", () => {
    const setup = prepareMission(setupRequest({ missionNumber: 1, britishForces: [rifle("A"), rifle("B")] }));
    expect(setup.britishForces.map((f) => f.kind)).toEqual(["rifle-squad", "rifle-squad"]);
    expect(setup.britishForces.map((f) => f.squad)).toEqual(["A", "B"]);
  });

  it("la Misión 7 prepara Escuadras A, B y C, Mortero y PIAT", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 7,
        duration: { baseTurns: 7 },
        britishForces: [rifle("A"), rifle("B"), rifle("C"), MORTAR, PIAT],
        fixedGermanUnits: { present: true, units: [{ kind: "half-track", labelEs: "Semioruga" }] },
        objective: { kind: "eliminate-all-germans" },
      }),
    );
    expect(setup.britishForces.map((f) => f.kind)).toEqual([
      "rifle-squad",
      "rifle-squad",
      "rifle-squad",
      "mortar",
      "piat",
    ]);
  });

  it("la Misión 8 prepara Escuadras A y B, Equipo MG y Mortero", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 8,
        duration: { baseTurns: 8 },
        britishForces: [rifle("A"), rifle("B"), MG, MORTAR],
        fixedGermanUnits: {
          present: true,
          units: [{ kind: "LMG", labelEs: "LMG alemana", semanticAnchorEs: "Hexágono de la iglesia" }],
        },
        objective: { kind: "occupy-church-hex" },
      }),
    );
    expect(setup.britishForces.map((f) => f.kind)).toEqual(["rifle-squad", "rifle-squad", "mg-team", "mortar"]);
  });

  it("la Misión 11 prepara Escuadras A, B y C, y Equipo MG", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 11,
        duration: { baseTurns: 8 },
        britishForces: [rifle("A"), rifle("B"), rifle("C"), MG],
        fixedGermanUnits: {
          present: true,
          units: [
            { kind: "artillery", labelEs: "Artillería" },
            { kind: "LMG", labelEs: "LMG alemana" },
          ],
        },
        objective: { kind: "destroy-artillery" },
      }),
    );
    expect(setup.britishForces.map((f) => f.kind)).toEqual(["rifle-squad", "rifle-squad", "rifle-squad", "mg-team"]);
  });

  it("rechaza una Misión fuera de 1..15 (fail-fast)", () => {
    expect(() => prepareMission(setupRequest({ missionNumber: 16 }))).toThrow(InvalidMissionSetupError);
  });
});

// ---------------------------------------------------------------------------
// Preparación: unidades fijas incluidas reveladas (33.3, 33.4, 33.5, 33.6)
// ---------------------------------------------------------------------------

describe("prepareMission — Unidades alemanas fijas reveladas (req. 33.3-33.6)", () => {
  it("incluye cada unidad fija REVELADA (33.3)", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 10,
        duration: { baseTurns: 8 },
        fixedGermanUnits: {
          present: true,
          units: [
            { kind: "half-track", labelEs: "Semioruga" },
            { kind: "artillery", labelEs: "Artillería" },
          ],
        },
        objective: { kind: "eliminate-all-germans" },
      }),
    );
    expect(setup.fixedGermanUnits).toHaveLength(2);
    expect(setup.fixedGermanUnits.every((u) => u.revealed)).toBe(true);
    expect(setup.fixedGermanUnits.map((u) => u.kind)).toEqual(["half-track", "artillery"]);
  });

  it("la Misión 8 incluye la LMG fija y revelada anclada en el Hexágono de la iglesia (33.4)", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 8,
        duration: { baseTurns: 8 },
        britishForces: [rifle("A"), rifle("B"), MG, MORTAR],
        fixedGermanUnits: {
          present: true,
          units: [{ kind: "LMG", labelEs: "LMG alemana", semanticAnchorEs: "Hexágono de la iglesia" }],
        },
        objective: { kind: "occupy-church-hex" },
      }),
    );
    expect(setup.fixedGermanUnits).toHaveLength(1);
    const lmg = setup.fixedGermanUnits[0];
    expect(lmg).toBeDefined();
    expect(lmg?.kind).toBe("LMG");
    expect(lmg?.revealed).toBe(true);
    expect(lmg?.semanticAnchorEs).toBe("Hexágono de la iglesia");
  });

  it("la Misión 11 incluye reveladas la Artillería y la LMG fijas (33.5)", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 11,
        duration: { baseTurns: 8 },
        britishForces: [rifle("A"), rifle("B"), rifle("C"), MG],
        fixedGermanUnits: {
          present: true,
          units: [
            { kind: "artillery", labelEs: "Artillería" },
            { kind: "LMG", labelEs: "LMG alemana" },
          ],
        },
        objective: { kind: "destroy-artillery" },
      }),
    );
    expect(setup.fixedGermanUnits.map((u) => u.kind)).toEqual(["artillery", "LMG"]);
    expect(setup.fixedGermanUnits.every((u) => u.revealed)).toBe(true);
  });

  it("registra la ausencia explícita de unidad fija con una lista vacía (33.6)", () => {
    const setup = prepareMission(setupRequest({ missionNumber: 1, fixedGermanUnits: NO_FIXED }));
    expect(setup.fixedGermanUnits).toEqual([]);
  });

  it("no fabrica posición ni Orientación visual de la unidad fija (Estado no publicable, 33.8)", () => {
    const setup = prepareMission(
      setupRequest({
        missionNumber: 7,
        duration: { baseTurns: 7 },
        fixedGermanUnits: { present: true, units: [{ kind: "half-track", labelEs: "Semioruga" }] },
      }),
    );
    const unit = setup.fixedGermanUnits[0];
    expect(unit).toBeDefined();
    expect(unit).not.toHaveProperty("hexId");
    expect(unit).not.toHaveProperty("orientation");
  });
});

// ---------------------------------------------------------------------------
// Preparación: duración base∓1 exacta (17.2, 32.4, 32.5, 32.8, 32.9, 32.10)
// ---------------------------------------------------------------------------

describe("prepareMission — Duración base∓1 exacta (req. 32.4-32.10)", () => {
  it("la duración base conserva los turnos base (32.10)", () => {
    const setup = prepareMission(setupRequest({ duration: { baseTurns: 4 }, durationChoice: "base" }));
    expect(setup.availableTurns).toBe(4);
  });

  it("la variante «un turno menos» reduce en uno la base (32.8)", () => {
    const setup = prepareMission(setupRequest({ duration: { baseTurns: 4 }, durationChoice: "shorter" }));
    expect(setup.availableTurns).toBe(3);
  });

  it("la variante «un turno más» aumenta en uno la base (32.9)", () => {
    const setup = prepareMission(setupRequest({ duration: { baseTurns: 4 }, durationChoice: "longer" }));
    expect(setup.availableTurns).toBe(5);
  });

  it("availableTurnsFor produce exactamente base−1, base y base+1 (32.5)", () => {
    expect(availableTurnsFor({ baseTurns: 8 }, "shorter")).toBe(7);
    expect(availableTurnsFor({ baseTurns: 8 }, "base")).toBe(8);
    expect(availableTurnsFor({ baseTurns: 8 }, "longer")).toBe(9);
  });

  it("rechaza turnos base no positivos (fail-fast)", () => {
    expect(() => availableTurnsFor({ baseTurns: 0 }, "base")).toThrow(InvalidMissionSetupError);
  });
});

// ---------------------------------------------------------------------------
// Desenlace: helpers de estado
// ---------------------------------------------------------------------------

function german(overrides: Partial<OutcomePieceView>): OutcomePieceView {
  return { side: "german", visibility: "revealed", status: "active", ...overrides };
}
function british(overrides: Partial<OutcomePieceView>): OutcomePieceView {
  return { side: "british", visibility: "revealed", status: "active", ...overrides };
}

function state(overrides: Partial<OutcomeStateView>): OutcomeStateView {
  const base: OutcomeStateView = {
    pieces: [],
    currentTurn: 1,
    lastAvailableTurn: 4,
    currentTurnConcluded: false,
  };
  return { ...base, ...overrides };
}

function outcomeRequest(
  objective: MissionObjective,
  stateView: OutcomeStateView,
  unresolvedPrecedence?: boolean,
): OutcomeRequest {
  return unresolvedPrecedence === undefined
    ? { objective, state: stateView }
    : { objective, state: stateView, unresolvedPrecedence };
}

// ---------------------------------------------------------------------------
// Desenlace: victoria solo si el objetivo se cumple hasta el último turno (18.1, 32.6)
// ---------------------------------------------------------------------------

describe("evaluateOutcome — Victoria hasta el último turno inclusive (req. 18.1, 32.6)", () => {
  it("declara victoria si el objetivo se cumple antes del último turno", () => {
    const s = state({ pieces: [german({ status: "eliminated" })], currentTurn: 2, lastAvailableTurn: 4 });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("victory");
  });

  it("declara victoria si el objetivo se cumple justo en la conclusión del último turno (inclusive)", () => {
    const s = state({
      pieces: [german({ status: "eliminated" })],
      currentTurn: 4,
      lastAvailableTurn: 4,
      currentTurnConcluded: true,
    });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("victory");
  });

  it("sigue en curso si el objetivo no está cumplido y no ha concluido el último turno", () => {
    const s = state({ pieces: [german({})], currentTurn: 2, lastAvailableTurn: 4 });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("ongoing");
  });
});

// ---------------------------------------------------------------------------
// Desenlace: derrota al concluir el último turno sin cumplir (32.7)
// ---------------------------------------------------------------------------

describe("evaluateOutcome — Derrota al concluir el último turno sin cumplir (req. 32.7)", () => {
  it("declara derrota si concluye el último turno con Unidades alemanas activas", () => {
    const s = state({
      pieces: [german({})],
      currentTurn: 4,
      lastAvailableTurn: 4,
      currentTurnConcluded: true,
    });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("defeat");
  });

  it("no declara derrota si el último turno aún no ha concluido", () => {
    const s = state({
      pieces: [german({})],
      currentTurn: 4,
      lastAvailableTurn: 4,
      currentTurnConcluded: false,
    });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("ongoing");
  });
});

// ---------------------------------------------------------------------------
// Desenlace: aplica SOLO el objetivo de la Misión seleccionada (32.11)
// ---------------------------------------------------------------------------

describe("evaluateOutcome — Aplica solo el objetivo de la Misión seleccionada (req. 32.11)", () => {
  it("eliminate-single-revealed-german ignora Unidades alemanas ocultas", () => {
    const s = state({
      pieces: [german({ visibility: "revealed", status: "eliminated" }), german({ visibility: "hidden" })],
      currentTurn: 2,
    });
    // La única alemana REVELADA fue eliminada; las ocultas no cuentan para M01.
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-single-revealed-german" }, s));
    expect(result.kind).toBe("victory");
  });

  it("eliminate-all-germans NO se cumple con Unidades alemanas ocultas aún activas", () => {
    const s = state({
      pieces: [german({ visibility: "revealed", status: "eliminated" }), german({ visibility: "hidden" })],
      currentTurn: 2,
    });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s));
    expect(result.kind).toBe("ongoing");
  });

  it("destroy-artillery se cumple al eliminar la Artillería aunque queden otras alemanas", () => {
    const s = state({
      pieces: [
        german({ kind: ARTILLERY_KIND, status: "eliminated" }),
        german({ kind: "LMG" }),
      ],
      currentTurn: 3,
    });
    const result = evaluateOutcome(outcomeRequest({ kind: "destroy-artillery" }, s));
    expect(result.kind).toBe("victory");
  });

  it("occupy-church-hex se cumple si una Unidad británica ocupa el Hexágono de la iglesia", () => {
    const church = hexId("church");
    const s = state({ pieces: [british({ hexId: church }), german({})], currentTurn: 3 });
    const result = evaluateOutcome(outcomeRequest({ kind: "occupy-church-hex", churchHexId: church }, s));
    expect(result.kind).toBe("victory");
  });

  it("occupy-church-hex se suspende si el Hexágono de la iglesia no está resuelto (DP-001, 33.8)", () => {
    const s = state({ pieces: [british({ hexId: hexId("h1") })], currentTurn: 3 });
    const result = evaluateOutcome(outcomeRequest({ kind: "occupy-church-hex" }, s));
    expect(result).toEqual({ kind: "suspended", reason: "church-hex-unresolved" });
  });
});

// ---------------------------------------------------------------------------
// Desenlace: suspensión ante precedencia no resuelta (18.2, 18.4)
// ---------------------------------------------------------------------------

describe("evaluateOutcome — Suspensión ante precedencia no resuelta (req. 18.2, 18.4)", () => {
  it("suspende el cierre sin modificar el resultado si la precedencia no está resuelta", () => {
    const s = state({
      pieces: [german({ status: "eliminated" })],
      currentTurn: 4,
      lastAvailableTurn: 4,
      currentTurnConcluded: true,
    });
    // Aun con el objetivo cumplido, la precedencia no resuelta suspende el cierre.
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s, true));
    expect(result).toEqual({ kind: "suspended", reason: "unresolved-precedence" });
  });

  it("no suspende cuando la precedencia está resuelta (false)", () => {
    const s = state({ pieces: [german({ status: "eliminated" })], currentTurn: 2 });
    const result = evaluateOutcome(outcomeRequest({ kind: "eliminate-all-germans" }, s, false));
    expect(result.kind).toBe("victory");
  });
});
