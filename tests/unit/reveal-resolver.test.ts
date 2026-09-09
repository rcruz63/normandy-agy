import { describe, expect, it } from "vitest";
import {
  resolveReveal,
  type RevealRequest,
  type RevealResultKind,
  type RevealSourceRef,
  type RevealTableView,
} from "../../src/domain/rules/reveal-resolver.js";
import {
  directionId,
  hexId,
  pieceId,
  pieceState,
  type PieceState,
} from "../../src/domain/geometry/index.js";
import { catalogId } from "../../src/domain/identity/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Referencia de fuente de la Misión para registrar DP-002 (37.9, 13.8). */
const sourceRef: RevealSourceRef = {
  sourceVersion: "FON-ML-2022",
  page: 16,
  element: "Tabla de revelado",
  missionRef: "FON-ML-2022-M07",
};

/** Identificadores canónicos de definición por resultado (Datos canónicos). */
const definitionIds = {
  HMG: catalogId("german-hmg"),
  LMG: catalogId("german-lmg"),
  "german-rifles": catalogId("german-rifles"),
  mine: catalogId("mine"),
} as const;

/** Tabla de revelado estructural de la Misión 7: 1 HMG; 2-3 LMG; 4-5 Fusileros; 6 Mina. */
const missionSevenTable: RevealTableView = {
  resultOf: {
    1: "HMG",
    2: "LMG",
    3: "LMG",
    4: "german-rifles",
    5: "german-rifles",
    6: "mine",
  },
};

/** Incógnita oculta en un Hexágono concreto (13.1, 37.6). */
function unknownAt(hex: string): PieceState {
  return pieceState({
    id: pieceId("unk-1"),
    definitionId: catalogId("unknown-marker"),
    side: "neutral",
    hexId: hexId(hex),
    visibility: "hidden",
    status: "active",
  });
}

/** Petición base de Revelado por adyacencia con un único reveladora. */
function baseAdjacencyRequest(dieResult: number): RevealRequest {
  return {
    unknown: unknownAt("h5"),
    cause: "adjacency",
    missionNumber: 7,
    dieResult,
    table: missionSevenTable,
    definitionIds,
    revealers: [{ revealerId: pieceId("br-1"), directionToRevealer: directionId("N") }],
    sourceRef,
  };
}

// ---------------------------------------------------------------------------
// Sustitución de la Incógnita por el resultado de la tabla en el mismo Hexágono
// ---------------------------------------------------------------------------

describe("resolveReveal — sustitución por el resultado de la Tabla en el mismo Hexágono (13.3, 33.2, 37.6)", () => {
  const cases: ReadonlyArray<readonly [number, RevealResultKind]> = [
    [1, "HMG"],
    [2, "LMG"],
    [4, "german-rifles"],
  ];

  for (const [die, expected] of cases) {
    it(`sustituye la Incógnita por ${expected} conservando el Hexágono`, () => {
      const outcome = resolveReveal(baseAdjacencyRequest(die));
      expect(outcome.kind).toBe("revealed");
      if (outcome.kind === "revealed") {
        expect(outcome.result).toBe(expected);
        expect(outcome.piece.definitionId).toBe(definitionIds[expected]);
        expect(outcome.piece.side).toBe("german");
        expect(outcome.piece.visibility).toBe("revealed");
        expect(outcome.piece.hexId).toBe(hexId("h5"));
        expect(outcome.piece.id).toBe(pieceId("unk-1"));
      }
    });
  }

  it("no muta la Incógnita recibida (función pura)", () => {
    const request = baseAdjacencyRequest(1);
    resolveReveal(request);
    expect(request.unknown.visibility).toBe("hidden");
    expect(request.unknown.side).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// Orientación hacia la única reveladora (37.7)
// ---------------------------------------------------------------------------

describe("resolveReveal — Orientación hacia la única reveladora (37.7)", () => {
  it("orienta la Unidad alemana revelada hacia la única Unidad británica reveladora", () => {
    const outcome = resolveReveal(baseAdjacencyRequest(1));
    expect(outcome.kind).toBe("revealed");
    if (outcome.kind === "revealed") {
      expect(outcome.orientation).toBe(directionId("N"));
      expect(outcome.piece.orientation).toBe(directionId("N"));
    }
  });
});

// ---------------------------------------------------------------------------
// Suspensión + DP-002 con dos o más reveladoras (37.8, 37.9, 13.8)
// ---------------------------------------------------------------------------

describe("resolveReveal — suspensión de Orientación con dos o más reveladoras (37.8, 37.9)", () => {
  it("suspende la Orientación y registra DP-002 sin seleccionar reveladora", () => {
    const request: RevealRequest = {
      ...baseAdjacencyRequest(1),
      revealers: [
        { revealerId: pieceId("br-1"), directionToRevealer: directionId("N") },
        { revealerId: pieceId("br-2"), directionToRevealer: directionId("S") },
      ],
    };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("orientation-suspended");
    if (outcome.kind === "orientation-suspended") {
      expect(outcome.piece.orientation).toBeUndefined();
      expect(outcome.piece.visibility).toBe("revealed");
      expect(outcome.piece.hexId).toBe(hexId("h5"));
      expect(outcome.dp002.decision).toBe("DP-002");
      expect(outcome.dp002.reason).toBe("orientation-tie");
      expect(outcome.dp002.sourceRef.missionRef).toBe("FON-ML-2022-M07");
    }
  });
});

// ---------------------------------------------------------------------------
// Explorar: sin prueba inmediata de Mina y Orientación inferior elegida (37.10, 37.11)
// ---------------------------------------------------------------------------

describe("resolveReveal — Explorar sin prueba inmediata de Mina (37.10)", () => {
  it("revela una Mina por Explorar sin disparar prueba inmediata", () => {
    const request: RevealRequest = {
      unknown: unknownAt("h5"),
      cause: "scout",
      missionNumber: 7,
      dieResult: 6,
      table: missionSevenTable,
      definitionIds,
      sourceRef,
    };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("mine-revealed");
    if (outcome.kind === "mine-revealed") {
      expect(outcome.triggersImmediateTest).toBe(false);
      expect(outcome.piece.hexId).toBe(hexId("h5"));
    }
  });

  it("usa la Orientación inferior válida elegida por el Jugador al revelar una Unidad alemana (37.11)", () => {
    const request: RevealRequest = {
      unknown: unknownAt("h5"),
      cause: "scout",
      missionNumber: 7,
      dieResult: 1,
      table: missionSevenTable,
      definitionIds,
      scoutChosenOrientation: directionId("SE"),
      sourceRef,
    };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("revealed");
    if (outcome.kind === "revealed") {
      expect(outcome.orientation).toBe(directionId("SE"));
      expect(outcome.piece.orientation).toBe(directionId("SE"));
    }
  });
});

// ---------------------------------------------------------------------------
// Sustitución por Mina en el mismo Hexágono y disparo por adyacencia (37.12, 37.13)
// ---------------------------------------------------------------------------

describe("resolveReveal — sustitución por Mina en el mismo Hexágono (37.12, 37.13)", () => {
  it("sustituye la Incógnita por la Mina en el mismo Hexágono sin Orientación", () => {
    const outcome = resolveReveal(baseAdjacencyRequest(6));
    expect(outcome.kind).toBe("mine-revealed");
    if (outcome.kind === "mine-revealed") {
      expect(outcome.piece.definitionId).toBe(definitionIds.mine);
      expect(outcome.piece.hexId).toBe(hexId("h5"));
      expect(outcome.piece.visibility).toBe("revealed");
      expect(outcome.piece.orientation).toBeUndefined();
    }
  });

  it("dispara la prueba inmediata de Mina por adyacencia desde la Misión 7 (37.13)", () => {
    const outcome = resolveReveal(baseAdjacencyRequest(6));
    expect(outcome.kind).toBe("mine-revealed");
    if (outcome.kind === "mine-revealed") {
      expect(outcome.triggersImmediateTest).toBe(true);
    }
  });

  it("no dispara la prueba inmediata por adyacencia por debajo de la Misión 7", () => {
    const request: RevealRequest = { ...baseAdjacencyRequest(6), missionNumber: 6 };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("mine-revealed");
    if (outcome.kind === "mine-revealed") {
      expect(outcome.triggersImmediateTest).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Detención sin resolución canónica (13.6, 13.8)
// ---------------------------------------------------------------------------

describe("resolveReveal — detención sin resolución canónica (13.6, 13.8)", () => {
  it("detiene el Revelado y registra DP-002 cuando el resultado de d6 no tiene fila", () => {
    const request: RevealRequest = { ...baseAdjacencyRequest(1), dieResult: 9 };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("stopped");
    if (outcome.kind === "stopped") {
      expect(outcome.cause.messageKey).toBe("rules.reveal.unmappedDieResult");
      expect(outcome.dp002.decision).toBe("DP-002");
      expect(outcome.dp002.reason).toBe("no-canonical-resolution");
    }
  });

  it("detiene el Revelado si la Incógnita no está oculta (13.1)", () => {
    const revealedPiece = pieceState({
      id: pieceId("unk-1"),
      definitionId: catalogId("german-lmg"),
      side: "german",
      hexId: hexId("h5"),
      visibility: "revealed",
      status: "active",
    });
    const request: RevealRequest = { ...baseAdjacencyRequest(1), unknown: revealedPiece };
    const outcome = resolveReveal(request);
    expect(outcome.kind).toBe("stopped");
    if (outcome.kind === "stopped") {
      expect(outcome.cause.messageKey).toBe("rules.reveal.invalidUnknown");
    }
  });
});
