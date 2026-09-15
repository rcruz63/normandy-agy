/**
 * Prueba de Jugabilidad Completa: Misión 1 (End-to-End).
 *
 * Criterio de aceptación: jugar la misión a través del bucle real del motor
 * (GameCommandDispatcher + DiceRollCoordinator + RulesEngine + ExecutableCatalog)
 * hasta alcanzar la victoria del jugador británico.
 */
import { describe, expect, it } from "vitest";
import {
  gameId as makeGameId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
  type GameId,
} from "../../src/domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
} from "../../src/domain/engine/state.js";
import { createRulesEngine } from "../../src/domain/engine/rules-engine.js";
import {
  GameCommandDispatcher,
  DiceRollCoordinator,
  type Clock,
  type SnapshotIdGenerator,
} from "../../src/application/games/index.js";
import {
  initialRandomState,
  pureVersionedRandom,
} from "../../src/domain/random/index.js";
import type {
  CommitReceipt,
  GameRepository,
  PersistableTransition,
} from "../../src/domain/ports/index.js";
import { computeIntegrity } from "../../src/domain/persistence/index.js";
import {
  MISSION_01_ID,
  MISSION_01_MAP,
  MISSION_01_SETUP,
} from "../../src/catalog/FON-ML-2022/mission-01.js";
import { buildExecutableCatalog } from "../../src/application/catalog/executable-catalog.js";
import {
  createActivateUnitCommand,
  createOrderAdvanceCommand,
  createOrderFireCommand,
} from "../../src/application/commands/game-commands.js";
import type { PieceState } from "../../src/domain/geometry/index.js";

class TestRepository implements GameRepository {
  private latest: GameSnapshot | undefined;

  public set(snapshot: GameSnapshot): void {
    this.latest = snapshot;
  }

  public loadLatest(gameId: GameId): Promise<GameSnapshot> {
    if (!this.latest) {
      return Promise.reject(new Error(`Sin partida: ${gameId as string}`));
    }
    return Promise.resolve(this.latest);
  }

  public commit(proposal: PersistableTransition): Promise<CommitReceipt> {
    this.latest = proposal.next;
    return Promise.resolve({
      gameId: proposal.next.gameId,
      snapshotId: proposal.next.id,
      latestSnapshotId: proposal.next.id,
    });
  }

  public list(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  public isolateCorrupt(): Promise<void> {
    return Promise.resolve();
  }
}

function makeClock(): Clock {
  let count = 0;
  return {
    now: () => {
      count += 1;
      return `2026-09-14T12:00:0${count}.000Z`;
    },
  };
}

function makeIdGen(): SnapshotIdGenerator {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `snap-test-${count}`;
    },
  };
}

describe("Jugabilidad de la Misión 01", () => {
  it("ejecuta el bucle de colocación, activación, avance, revelado y victoria por fuego", async () => {
    const gameId = makeGameId("partida-test-m01");
    const rv = rulesVersion("FON-ML-2022");
    const sv = saveVersion("sv-1");

    // Construir catálogo ejecutable
    const catalog = buildExecutableCatalog({
      catalogId: "FON-ML-2022-M01-cat",
      map: MISSION_01_MAP,
      setup: MISSION_01_SETUP,
      objective: { kind: "eliminate-all-germans" },
      maxTurns: 4,
    });

    // Colocación inicial según MISSION_01_SETUP
    const initialPieces: Record<string, PieceState> = {
      "GB-A": {
        id: "GB-A" as any,
        pieceId: "GB-A",
        definitionId: "rifle-squad-A" as any,
        side: "british",
        hexId: "M01-H10" as any,
        orientation: "N" as any,
        morale: "normal",
        cover: 0,
        visibility: "revealed",
        status: "active",
      } as any,
      "GB-B": {
        id: "GB-B" as any,
        pieceId: "GB-B",
        definitionId: "rifle-squad-B" as any,
        side: "british",
        hexId: "M01-H10" as any,
        orientation: "N" as any,
        morale: "normal",
        cover: 0,
        visibility: "revealed",
        status: "active",
      } as any,
      "DE-UNK-1": {
        id: "DE-UNK-1" as any,
        pieceId: "DE-UNK-1",
        definitionId: "unknown" as any,
        side: "german",
        hexId: "M01-H04" as any,
        cover: 0,
        visibility: "hidden",
        status: "active",
      } as any,
    };

    const initialUnknowns = {
      "DE-UNK-1": { hidden: true },
    };

    const initialState: GameState = gameState({
      gameId,
      missionId: MISSION_01_ID,
      rulesVersion: rv,
      saveVersion: sv,
      difficulty: { id: "normal" },
      duration: { turns: 4 },
      turn: 1,
      phase: "british",
      activation: {},
      pieces: initialPieces as any,
      unknowns: initialUnknowns,
      objectives: { "eliminate-all-germans": { met: false } },
      effects: [],
      outcome: "in-progress",
    });

    const initialSnapshot: GameSnapshot = gameSnapshot({
      id: makeSnapshotId("snap-init"),
      gameId,
      confirmedAt: "2026-09-14T12:00:00.000Z",
      state: initialState,
      randomState: initialRandomState("test-seed-1"),
      simpleLog: [],
      detailedLog: [],
      integrity: computeIntegrity({
        gameId,
        missionId: MISSION_01_ID,
        seed: "test-seed-1",
        turn: 1,
      }),
    });

    const repository = new TestRepository();
    repository.set(initialSnapshot);

    const engine = createRulesEngine();
    const clock = makeClock();
    const idGen = makeIdGen();
    const dispatcher = new GameCommandDispatcher({
      repository,
      engine,
      catalog,
      clock,
      idGenerator: idGen,
    });
    const diceCoordinator = new DiceRollCoordinator({
      engine,
      catalog,
      random: pureVersionedRandom,
    });

    // 1. Activar unidad británica GB-A
    const actCmd = createActivateUnitCommand(gameId, initialSnapshot.id, "GB-A");
    const actOutcome = await dispatcher.execute(actCmd);
    expect(actOutcome.kind).toBe("awaiting-roll");
    if (actOutcome.kind !== "awaiting-roll") return;

    // 2. Resolver tirada de dados para activación (dados 3 y 4)
    const currentSnap = await repository.loadLatest(gameId);
    const rollRes = diceCoordinator.resolve(
      currentSnap,
      actOutcome.request,
      { source: "manual", faces: [6, 3] },
      currentSnap.randomState as any,
    );
    expect(rollRes.kind).toBe("resolved");
    if (rollRes.kind !== "resolved" || rollRes.decision.kind !== "accepted") return;

    // Confirmar propuesta de activación
    await dispatcher.confirmDecision(rollRes.decision.proposal);

    const snapAfterAct = await repository.loadLatest(gameId);
    expect(snapAfterAct.state.activation.activePieceId).toBe("GB-A");

    // 3. Orden: Avanzar a M01-H07
    const advCmd = createOrderAdvanceCommand(gameId, snapAfterAct.id, "GB-A", "M01-H07");
    const advOutcome = await dispatcher.execute(advCmd);
    expect(advOutcome.kind).toBe("committed");

    const snapAfterAdv = await repository.loadLatest(gameId);
    const pieceA = snapAfterAdv.state.pieces["GB-A"] as unknown as PieceState;
    expect(pieceA.hexId).toBe("M01-H07");

    // Verificar que la incógnita en M01-H04 (adyacente a M01-H07) se ha revelado
    const germanPiece = snapAfterAdv.state.pieces["DE-UNK-1"] as unknown as PieceState;
    expect(germanPiece.visibility).toBe("revealed");
    expect(germanPiece.definitionId as string).toBe("LMG");

    // 4. Orden: Fuego contra M01-H04
    const fireCmd = createOrderFireCommand(gameId, snapAfterAdv.id, "GB-A", "M01-H04");
    const fireOutcome = await dispatcher.execute(fireCmd);
    expect(fireOutcome.kind).toBe("awaiting-roll");
    if (fireOutcome.kind !== "awaiting-roll") return;

    // 5. Resolver tirada de dados de Fuego (dados 5 y 5 = 10, supera dificultad 9)
    const snapBeforeFireRoll = await repository.loadLatest(gameId);
    const fireRollRes = diceCoordinator.resolve(
      snapBeforeFireRoll,
      fireOutcome.request,
      { source: "manual", faces: [5, 5] },
      snapBeforeFireRoll.randomState as any,
    );
    expect(fireRollRes.kind).toBe("resolved");
    if (fireRollRes.kind !== "resolved" || fireRollRes.decision.kind !== "accepted") return;

    await dispatcher.confirmDecision(fireRollRes.decision.proposal);

    // 6. Verificar desenlace: la unidad alemana está eliminada y el desenlace es VICTORIA
    const finalSnap = await repository.loadLatest(gameId);
    const finalGerman = finalSnap.state.pieces["DE-UNK-1"] as unknown as PieceState;
    expect(finalGerman.status).toBe("eliminated");
    expect(finalSnap.state.outcome).toBe("victory");
  });

  it("permite concluir la fase británica y ejecutar la fase alemana", async () => {
    const gameId = makeGameId("partida-test-german-phase");
    const rv = rulesVersion("FON-ML-2022");
    const sv = saveVersion("sv-1");
    const catalog = buildExecutableCatalog({
      catalogId: "FON-ML-2022-M01-cat",
      map: MISSION_01_MAP,
      setup: MISSION_01_SETUP,
      objective: { kind: "eliminate-all-germans" },
      maxTurns: 4,
    });

    const initialPieces: Record<string, PieceState> = {
      "GB-A": {
        id: "GB-A" as any,
        pieceId: "GB-A",
        definitionId: "rifle-squad-A" as any,
        side: "british",
        hexId: "M01-H10" as any,
        orientation: "N" as any,
        morale: "normal",
        cover: 0,
        visibility: "revealed",
        status: "active",
      } as any,
      "GB-B": {
        id: "GB-B" as any,
        pieceId: "GB-B",
        definitionId: "rifle-squad-B" as any,
        side: "british",
        hexId: "M01-H10" as any,
        orientation: "N" as any,
        morale: "normal",
        cover: 0,
        visibility: "revealed",
        status: "active",
      } as any,
      "DE-UNK-1": {
        id: "DE-UNK-1" as any,
        pieceId: "DE-UNK-1",
        definitionId: "UNKNOWN" as any,
        side: "german",
        hexId: "M01-H04" as any,
        orientation: "N" as any,
        morale: "normal",
        cover: 1,
        visibility: "hidden",
        status: "active",
      } as any,
    };

    const initSnap = gameSnapshot({
      id: makeSnapshotId("snap-init-gp"),
      gameId,
      confirmedAt: "2026-09-14T12:00:00.000Z",
      state: gameState({
        gameId,
        missionId: MISSION_01_ID,
        rulesVersion: rv,
        saveVersion: sv,
        difficulty: { id: "normal" },
        turn: 1,
        duration: { turns: 4 },
        phase: "british",
        activation: {},
        pieces: initialPieces as any,
        unknowns: { "DE-UNK-1": { hidden: true } },
        objectives: {},
        effects: [],
        outcome: "in-progress",
      }),
      randomState: initialRandomState("test-seed-gp"),
      simpleLog: [],
      detailedLog: [],
      integrity: computeIntegrity({
        gameId,
        missionId: MISSION_01_ID,
        seed: "test-seed-gp",
        turn: 1,
        piecesCount: 3,
      }),
    });

    const repository = new TestRepository();
    repository.set(initSnap);

    const engine = createRulesEngine();
    const dispatcher = new GameCommandDispatcher({
      repository,
      engine,
      catalog,
      clock: makeClock(),
      idGenerator: makeIdGen(),
    });

    // Ejecutar fin de fase británica
    const cmd = {
      gameId,
      expectedSnapshotId: initSnap.id,
      type: "resolve-german-phase",
      payload: {},
    } as any;
    const outcome = await dispatcher.execute(cmd);
    expect(outcome.kind).toBe("committed");
  });
});
