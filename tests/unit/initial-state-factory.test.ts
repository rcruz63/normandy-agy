import { describe, expect, it } from "vitest";
import {
  gameId as makeGameId,
  missionId as makeMissionId,
  rulesVersion,
  saveVersion,
} from "../../src/domain/identity/index.js";
import { prepareMission, type MissionSetup } from "../../src/domain/rules/index.js";
import {
  buildInitialSnapshot,
  type Clock,
  type GameIdentity,
  type InitialSnapshotInput,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";

function missionSetup(): MissionSetup {
  return prepareMission({
    missionNumber: 1,
    duration: { baseTurns: 4 },
    durationChoice: "longer",
    britishForces: [
      { kind: "rifle-squad", squad: "A", labelEs: "Escuadra de fusileros A" },
    ],
    fixedGermanUnits: { present: false },
    objective: { kind: "eliminate-single-revealed-german" },
    revealTable: { missionRef: "FON-ML-2022-M01" },
  });
}

function identity(): GameIdentity {
  return {
    gameId: makeGameId("g-1"),
    missionId: makeMissionId("FON-ML-2022-M01"),
    rulesVersion: rulesVersion("rv-1"),
    saveVersion: saveVersion("sv-1"),
    difficulty: { id: "normal" },
  };
}

function input(seed = "seed-1"): InitialSnapshotInput {
  return { missionSetup: missionSetup(), identity: identity(), seed };
}

const fixedClock: Clock = { now: (): string => "2024-06-01T00:00:00.000Z" };

function idGen(prefix: string): SnapshotIdGenerator {
  let n = 0;
  return { next: (): string => `${prefix}-${(n += 1)}` };
}

describe("buildInitialSnapshot — Instantánea inicial fiel", () => {
  it("refleja la duración disponible elegida (base+1) y arranca en turno 1 fase británica", () => {
    const snapshot = buildInitialSnapshot(input(), fixedClock, idGen("s"));
    expect(snapshot.state.duration.turns).toBe(5); // base 4 + 1 (longer)
    expect(snapshot.state.turn).toBe(1);
    expect(snapshot.state.phase).toBe("british");
    expect(snapshot.state.outcome).toBe("in-progress");
  });

  it("no incluye posiciones ni Fichas (Estado no publicable, DP-001)", () => {
    const snapshot = buildInitialSnapshot(input(), fixedClock, idGen("s"));
    expect(snapshot.state.pieces).toEqual({});
    expect(snapshot.state.unknowns).toEqual({});
    expect(snapshot.state.objectives).toEqual({
      "eliminate-single-revealed-german": { met: false },
    });
  });

  it("es la Instantánea inicial (sin previousSnapshotId) con Estado aleatorio en posición 0", () => {
    const snapshot = buildInitialSnapshot(input("semilla-x"), fixedClock, idGen("s"));
    expect(snapshot.previousSnapshotId).toBeUndefined();
    expect(snapshot.randomState.seed).toBe("semilla-x");
    expect(snapshot.randomState.position).toBe(0);
    expect(snapshot.confirmedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("es reproducible: misma entrada y dependencias producen la misma Instantánea", () => {
    const a = buildInitialSnapshot(input("seed-r"), fixedClock, idGen("s"));
    const b = buildInitialSnapshot(input("seed-r"), fixedClock, idGen("s"));
    expect(b).toEqual(a);
  });
});
