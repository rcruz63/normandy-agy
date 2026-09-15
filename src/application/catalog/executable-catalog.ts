/**
 * Adaptador de Catálogo Ejecutable (`buildExecutableCatalog`).
 *
 * Compila las políticas puras de `domain/rules` y los datos canónicos de la misión
 * en una `RulesCatalogView` ejecutable que consume el `RulesEngine`.
 *
 * Es el ÚNICO punto de ensamble que traduce datos ↔ funciones sin alterar
 * la pureza del dominio.
 */
import { catalogId, snapshotId } from "../../domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameState,
} from "../../domain/engine/state.js";
import {
  transitionProposal,
} from "../../domain/engine/transition.js";
import {
  diceRollRequest,
  type DiceRollRequestId,
} from "../../domain/engine/dice-roll.js";
import type {
  CatalogActionView,
  CatalogRuleView,
  RulesCatalogView,
} from "../../domain/engine/rules-engine.js";
import {
  buildHexGeometry,
  type HexGeometry,
  type HexId,
  type HexMapDefinition,
  type PieceState,
} from "../../domain/geometry/index.js";
import type {
  DiePip,
  MoraleState,
} from "../../domain/rules/turn-order-policy.js";
import {
  resolveCombat,
  type CombatModifierContext,
} from "../../domain/rules/combat-resolver.js";
import {
  evaluateOutcome,
  type OutcomePieceView,
  type OutcomeStateView,
} from "../../domain/rules/mission-outcome.js";
import type { MissionObjective } from "../../domain/rules/mission-setup.js";
import {
  britishOrderTables,
  orderCodeNameEs,
} from "../../catalog/FON-ML-2022/orders-combat-counters.js";
import { computeIntegrity } from "../../domain/persistence/index.js";
import type { SetupDefinition } from "../../catalog/schemas/placeholders.js";
import {
  simpleLogEntry,
  detailedLogEntry,
  type SimpleLogEntry,
  type DetailedLogEntry,
} from "../../domain/logging/index.js";
import { pureVersionedRandom } from "../../domain/random/index.js";

export type ExecutableCatalogOptions = Readonly<{
  catalogId: string;
  map: HexMapDefinition;
  setup: SetupDefinition;
  objective: MissionObjective;
  maxTurns: number;
}>;

/** Genera una entrada de registro simple. */
function makeSimpleLog(
  snapshot: { gameId: any; simpleLog: readonly SimpleLogEntry[]; state: GameState },
  actor: string,
  action: string,
  result: string,
): SimpleLogEntry {
  return simpleLogEntry({
    gameId: snapshot.gameId,
    sequence: snapshot.simpleLog.length + 1,
    turn: snapshot.state.turn,
    phase: snapshot.state.phase,
    actor,
    action,
    result,
    messageKey: "log.simple.move",
    params: { turn: snapshot.state.turn, actor, result },
  });
}

/** Genera una entrada de registro detallado. */
function makeDetailedLog(
  snapshot: { gameId: any; detailedLog: readonly DetailedLogEntry[]; state: GameState },
  detail: string,
): DetailedLogEntry {
  return detailedLogEntry({
    gameId: snapshot.gameId,
    sequence: snapshot.detailedLog.length + 1,
    deterministic: {
      inputs: [detail],
      rules: ["FON-ML-2022"],
      priorities: ["100"],
      computations: ["ok"],
    },
    messageKey: "log.detailed.deterministic",
    params: { inputs: detail, rules: "FON-ML-2022", priorities: "100", computations: "ok" },
  });
}

/** Comprueba si una pieza ya actuó en el turno actual. */
function hasUnitActivatedThisTurn(state: GameState, pieceId: string): boolean {
  const marker = `activated:${pieceId}:t${state.turn}`;
  return state.effects.some((eff) => eff.kind === marker);
}

/** Marca una pieza como activada en el turno. */
function markUnitActivated(state: GameState, pieceId: string): readonly { kind: string }[] {
  const marker = `activated:${pieceId}:t${state.turn}`;
  return Object.freeze([...state.effects, { kind: marker }]);
}

/** Obtiene la lista de órdenes restantes de una unidad en su activación. */
function getUnitRemainingOrders(state: GameState, pieceId: string): string[] {
  const effect = state.effects.find((e) => e.kind.startsWith(`remaining-orders:${pieceId}:`));
  if (!effect) return [];
  const raw = effect.kind.slice(`remaining-orders:${pieceId}:`.length);
  if (!raw || raw === "NONE") return [];
  return raw.split(",").filter(Boolean);
}

/** Comprueba si una unidad tiene disponible la orden especificada. */
function canUnitPerformOrder(state: GameState, pieceId: string, orderCode: string): boolean {
  const effect = state.effects.find((e) =>
    e.kind.startsWith(`remaining-orders:${pieceId}:`),
  );
  if (!effect) {
    return false;
  }
  const remaining = getUnitRemainingOrders(state, pieceId);
  if (remaining.length === 0) return false;
  if (remaining.includes(orderCode)) return true;
  return remaining.some(
    (o) => o.startsWith("DOUBLES:") && o.split(":").slice(1).includes(orderCode),
  );
}

/** Consume una orden y devuelve los nuevos efectos y las órdenes restantes. */
function consumeUnitOrder(
  state: GameState,
  pieceId: string,
  orderCode: string,
): { effects: readonly { kind: string }[]; remaining: string[] } {
  const hasRemainingEffect = state.effects.some((e) =>
    e.kind.startsWith(`remaining-orders:${pieceId}:`),
  );
  if (!hasRemainingEffect) {
    return { effects: state.effects, remaining: [] };
  }

  const currentOrders = getUnitRemainingOrders(state, pieceId);
  const remaining = [...currentOrders];

  const exactIdx = remaining.indexOf(orderCode);
  if (exactIdx !== -1) {
    remaining.splice(exactIdx, 1);
  } else {
    const doubleIdx = remaining.findIndex(
      (o) => o.startsWith("DOUBLES:") && o.split(":").slice(1).includes(orderCode),
    );
    if (doubleIdx !== -1) {
      remaining.splice(doubleIdx, 1);
    }
  }

  const otherEffects = state.effects.filter(
    (e) => !e.kind.startsWith(`remaining-orders:${pieceId}:`),
  );
  const newEffects = [...otherEffects];
  const remainingCsv = remaining.length > 0 ? remaining.join(",") : "NONE";
  newEffects.push({ kind: `remaining-orders:${pieceId}:${remainingCsv}` });

  return { effects: Object.freeze(newEffects), remaining };
}

/** Evalúa el desenlace a partir de las piezas actuales. */
function checkMissionOutcome(
  state: GameState,
  objective: MissionObjective,
  turnConcluded: boolean,
): GameState["outcome"] {
  const piecesView: OutcomePieceView[] = Object.values(state.pieces).map((p) => {
    const rawPiece = p as unknown as PieceState;
    const base: OutcomePieceView = {
      side: (rawPiece.side ?? "british") as "british" | "german" | "neutral",
      visibility: (rawPiece.visibility ?? "revealed") as "hidden" | "revealed",
      status: (rawPiece.status ?? "active") as "active" | "eliminated",
      ...(rawPiece.hexId !== undefined ? { hexId: rawPiece.hexId } : {}),
    };
    return base;
  });

  const outcomeView: OutcomeStateView = {
    pieces: piecesView,
    currentTurn: state.turn,
    lastAvailableTurn: state.duration.turns,
    currentTurnConcluded: turnConcluded,
  };

  const evalResult = evaluateOutcome({ state: outcomeView, objective });
  if (evalResult.kind === "victory") return "victory";
  if (evalResult.kind === "defeat") return "defeat";
  return state.outcome;
}

/** Construye la RulesCatalogView ejecutable para una misión. */
export function buildExecutableCatalog(options: ExecutableCatalogOptions): RulesCatalogView {
  const { map, objective, maxTurns } = options;
  const geometry: HexGeometry = buildHexGeometry(map);

  // --- Regla 1: activate-unit ---
  const activateUnitRule: CatalogRuleView = {
    id: "activate-unit-rule",
    kind: "concrete",
    priority: 100,
    commandType: "activate-unit",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      if (!pieceId || !state.pieces[pieceId]) return false;
      const piece = state.pieces[pieceId] as unknown as PieceState;
      if (piece.status === "eliminated" || piece.side !== "british") return false;
      return !hasUnitActivatedThisTurn(state, pieceId);
    },
    apply: (_snapshot, _command) => {
      throw new Error("activate-unit requiere tirada de dados (fase 1)");
    },
    roll: {
      requestRoll: (snapshot, command) => {
        const pieceId = command.payload["pieceId"] as string;
        return diceRollRequest({
          id: `req-act-${snapshot.state.turn}-${pieceId}` as DiceRollRequestId,
          gameId: snapshot.gameId,
          expectedSnapshotId: snapshot.id,
          context: { label: `activate-unit:${pieceId}` },
          domain: { kind: "dice", count: 2, sides: 6 },
          diceOrder: [0, 1],
          outcomeMetadata: {
            kind: "table",
            tableId: catalogId("order-table"),
            sourceRefs: [],
          },
        });
      },
      interpret: (snapshot, resolution) => {
        const pieceId = (resolution.context.label.split(":")[1] ?? "") as string;
        const faces = resolution.effectiveFaces;
        const chosenDie = (faces[0] ?? 1) as DiePip;
        const otherDie = (faces[1] ?? chosenDie) as DiePip;

        const piece = snapshot.state.pieces[pieceId] as unknown as PieceState;
        const currentMorale = (piece.morale ?? "normal") as MoraleState;

        // Tabla de órdenes de Rifle Squad (Reglas oficiales Mike Lambo 2022, pág. 6)
        // El dado elegido selecciona la Fila completa de la tabla.
        const tableDef = britishOrderTables["rifle-squad"];
        const selectedRow = tableDef.rows.find((r) => r.input === chosenDie) ?? tableDef.rows[0]!;
        const order1 = selectedRow.output.first;
        const order2 = selectedRow.output.second;

        let initialOrders: string[];
        if (currentMorale === "low") {
          // Moral baja: solo la primera orden de la fila
          initialOrders = [order1];
        } else {
          // Moral normal: ambas órdenes en secuencia
          initialOrders = [order1, order2];
        }

        const col1Name = orderCodeNameEs[order1] ?? order1;
        const col2Name = orderCodeNameEs[order2] ?? order2;

        const newEffects = markUnitActivated(snapshot.state, pieceId);
        const nextState = gameState({
          ...snapshot.state,
          activation: { activePieceId: pieceId },
          effects: [
            ...newEffects,
            { kind: `orders:${pieceId}:${JSON.stringify(currentMorale === "low" ? ["first", "discard"] : ["first", "second", "both", "discard"])}` },
            { kind: `allowed-orders:${pieceId}:${order1}:${order2}` },
            { kind: `remaining-orders:${pieceId}:${initialOrders.join(",")}` },
          ],
        });

        let logMsg: string;
        if (chosenDie === otherDie) {
          if (currentMorale === "low") {
            logMsg = `Tirada: [${chosenDie}, ${otherDie}] (¡Dobles aceptados! Moral baja: solo 1ª orden) → Fila ${chosenDie}: ${col1Name} (${order1})`;
          } else {
            logMsg = `Tirada: [${chosenDie}, ${otherDie}] (¡Dobles aceptados!) → Fila ${chosenDie}: 1ª ${col1Name} (${order1}) y 2ª ${col2Name} (${order2})`;
          }
        } else if (currentMorale === "low") {
          logMsg = `Tirada: [${chosenDie}, ${otherDie}] → Eliges Fila ${chosenDie} (Moral baja: solo 1ª orden): ${col1Name} (${order1})`;
        } else {
          logMsg = `Tirada: [${chosenDie}, ${otherDie}] → Eliges Fila ${chosenDie}: 1ª ${col1Name} (${order1}) y 2ª ${col2Name} (${order2})`;
        }

        const nextSimpleLog = [
          ...snapshot.simpleLog,
          makeSimpleLog(snapshot, pieceId, "activación", logMsg),
        ];

        const nextDetailedLog = [
          ...snapshot.detailedLog,
          makeDetailedLog(
            snapshot,
            `Activación de ${pieceId}: elegido=Fila ${chosenDie}, descartado=${otherDie}, moral=${currentMorale}, órdenes=[${order1}, ${order2}]`,
          ),
        ];

        return transitionProposal({
          expectedSnapshotId: snapshot.id,
          mode: "complete",
          next: gameSnapshot({
            id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
            gameId: snapshot.gameId,
            confirmedAt: new Date().toISOString(),
            state: nextState,
            randomState: resolution.nextRandomState,
            simpleLog: nextSimpleLog,
            detailedLog: nextDetailedLog,
            integrity: computeIntegrity({
              gameId: snapshot.gameId,
              missionId: snapshot.state.missionId,
              seed: resolution.nextRandomState.seed,
              turn: snapshot.state.turn,
            }),
          }),
        });
      },
    },
  };

  // --- Regla 2: order-advance ---
  const orderAdvanceRule: CatalogRuleView = {
    id: "order-advance-rule",
    kind: "concrete",
    priority: 100,
    commandType: "order-advance",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      const toHex = command.payload["toHex"] as HexId;
      if (!pieceId || !toHex) return false;
      if (!canUnitPerformOrder(state, pieceId, "ADV")) return false;
      const piece = state.pieces[pieceId] as unknown as PieceState;
      if (!piece || !piece.hexId || piece.status === "eliminated") return false;
      if (!geometry.areAdjacent(piece.hexId, toHex)) return false;

      // No avanzar a hexágono con unidad alemana activa
      const blocked = Object.values(state.pieces).some((other) => {
        const o = other as unknown as PieceState;
        return o.side === "german" && o.status === "active" && o.hexId === toHex;
      });
      return !blocked;
    },
    apply: (snapshot, command) => {
      const pieceId = command.payload["pieceId"] as string;
      const toHex = command.payload["toHex"] as HexId;
      const piece = snapshot.state.pieces[pieceId] as unknown as PieceState;

      // Mover unidad y quitar cobertura
      const updatedMover: PieceState = {
        ...piece,
        hexId: toHex,
        cover: 0,
      };

      const newPieces = { ...snapshot.state.pieces, [pieceId]: updatedMover as any };
      const newUnknowns = { ...snapshot.state.unknowns };

      // Revelar incógnitas adyacentes al destino
      const revealedMessages: string[] = [];
      for (const [key, p] of Object.entries(newPieces)) {
        const other = p as unknown as PieceState;
        if (other.side === "german" && other.visibility === "hidden" && other.hexId) {
          if (geometry.areAdjacent(toHex, other.hexId)) {
            // Revelado: unidad LMG (3-6) o HMG (1-2)
            const revealedKind = "LMG";
            const revealedPiece: PieceState = {
              ...other,
              definitionId: catalogId(revealedKind),
              visibility: "revealed",
            };
            newPieces[key] = revealedPiece as any;
            if (newUnknowns[key]) {
              newUnknowns[key] = { hidden: false };
            }
            revealedMessages.push(`¡Enemigo revelado en ${other.hexId}: ${revealedKind}!`);
          }
        }
      }

      const updatedOutcome = checkMissionOutcome(
        { ...snapshot.state, pieces: newPieces, unknowns: newUnknowns },
        objective,
        false,
      );

      // Consumir la orden ADV
      const { effects: nextEffects, remaining } = consumeUnitOrder(snapshot.state, pieceId, "ADV");
      const isActivationDone = remaining.length === 0;
      const nextActivation = { activePieceId: pieceId };

      const nextState = gameState({
        ...snapshot.state,
        pieces: newPieces,
        unknowns: newUnknowns,
        effects: nextEffects,
        activation: nextActivation,
        outcome: updatedOutcome,
      });

      const doneMessage = isActivationDone ? " (Órdenes completadas)." : "";
      const nextSimpleLog = [
        ...snapshot.simpleLog,
        makeSimpleLog(
          snapshot,
          pieceId,
          "avanza",
          `a ${toHex}. ${revealedMessages.join(" ")}${doneMessage}`,
        ),
      ];

      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        mode: "complete",
        next: gameSnapshot({
          id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
          gameId: snapshot.gameId,
          confirmedAt: new Date().toISOString(),
          state: nextState,
          randomState: snapshot.randomState,
          simpleLog: nextSimpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: computeIntegrity({
            gameId: snapshot.gameId,
            missionId: snapshot.state.missionId,
            seed: snapshot.randomState.seed,
            turn: snapshot.state.turn,
          }),
        }),
      });
    },
  };

  // --- Regla 3: order-fire ---
  const orderFireRule: CatalogRuleView = {
    id: "order-fire-rule",
    kind: "concrete",
    priority: 100,
    commandType: "order-fire",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      const targetHex = command.payload["targetHex"] as HexId;
      if (!pieceId || !targetHex) return false;
      if (!canUnitPerformOrder(state, pieceId, "FIRE")) return false;
      const attacker = state.pieces[pieceId] as unknown as PieceState;
      if (!attacker || !attacker.hexId || attacker.status === "eliminated") return false;

      // Debe haber unidad alemana revelada en targetHex
      const targetPiece = Object.values(state.pieces).find((p) => {
        const piece = p as unknown as PieceState;
        return (
          piece.side === "german" &&
          piece.status === "active" &&
          piece.visibility === "revealed" &&
          piece.hexId === targetHex
        );
      });
      if (!targetPiece) return false;

      return geometry.areAdjacent(attacker.hexId, targetHex);
    },
    apply: (_snapshot, _command) => {
      throw new Error("order-fire requiere tirada de dados 2d6");
    },
    roll: {
      requestRoll: (snapshot, command) => {
        const pieceId = command.payload["pieceId"] as string;
        const targetHex = command.payload["targetHex"] as string;
        return diceRollRequest({
          id: `req-fire-${snapshot.state.turn}-${pieceId}` as DiceRollRequestId,
          gameId: snapshot.gameId,
          expectedSnapshotId: snapshot.id,
          context: { label: `order-fire:${pieceId}:${targetHex}` },
          domain: { kind: "dice", count: 2, sides: 6 },
          diceOrder: [0, 1],
          outcomeMetadata: {
            kind: "calculation",
            targetValue: 8,
            baseValues: [{ name: "Base Fuego fusileros", value: 8 }],
            modifiers: [],
            formula: "2d6 >= 8",
            comparison: ">=",
            sourceRefs: [],
          },
        });
      },
      interpret: (snapshot, resolution) => {
        const parts = resolution.context.label.split(":");
        const pieceId = parts[1] ?? "";
        const targetHex = parts[2] ?? "";
        const faces = resolution.effectiveFaces;
        const rollTotal = (faces[0] ?? 0) + (faces[1] ?? 0);

        // Modificador de terreno: si el hexágono defensor tiene bosque -> +1 al umbral
        const targetHexDef = map.hexes[targetHex as HexId];
        const isForest = targetHexDef?.terrain.some((t) => String(t) === "bosque") ?? false;

        const modifierContext: CombatModifierContext = {
          defenderTerrain: isForest ? "forest" : "clear",
          attackerOnHill: false,
          flanking: false,
          supportingUnits: 0,
          mortar: "none",
        };

        const combatResult = resolveCombat({
          kind: "fire",
          base: { threshold: 8, fixed: false },
          modifiers: modifierContext,
        });

        const effectiveThreshold =
          combatResult.kind === "resolved" ? combatResult.resolution.effectiveThreshold : 8;

        const isHit = rollTotal >= effectiveThreshold;
        const newPieces = { ...snapshot.state.pieces };

        if (isHit) {
          // Eliminar la unidad alemana en targetHex
          for (const [key, p] of Object.entries(newPieces)) {
            const piece = p as unknown as PieceState;
            if (piece.side === "german" && piece.hexId === targetHex && piece.status === "active") {
              newPieces[key] = { ...piece, status: "eliminated" } as any;
            }
          }
        }

        const updatedOutcome = checkMissionOutcome(
          { ...snapshot.state, pieces: newPieces },
          objective,
          false,
        );

        const { effects: nextEffects } = consumeUnitOrder(snapshot.state, pieceId, "FIRE");
        const nextActivation = { activePieceId: pieceId };

        const nextState = gameState({
          ...snapshot.state,
          pieces: newPieces,
          effects: nextEffects,
          activation: nextActivation,
          outcome: updatedOutcome,
        });

        const resultText = isHit
          ? `¡IMPACTO! Unidad enemiga en ${targetHex} eliminada.`
          : `Fallo (Tirada: ${rollTotal} frente a dificultad ${effectiveThreshold}).`;

        const nextSimpleLog = [
          ...snapshot.simpleLog,
          makeSimpleLog(
            snapshot,
            pieceId,
            "dispara",
            `a ${targetHex}. ${resultText}`,
          ),
        ];

        return transitionProposal({
          expectedSnapshotId: snapshot.id,
          mode: "complete",
          next: gameSnapshot({
            id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
            gameId: snapshot.gameId,
            confirmedAt: new Date().toISOString(),
            state: nextState,
            randomState: resolution.nextRandomState,
            simpleLog: nextSimpleLog,
            detailedLog: snapshot.detailedLog,
            integrity: computeIntegrity({
              gameId: snapshot.gameId,
              missionId: snapshot.state.missionId,
              seed: resolution.nextRandomState.seed,
              turn: snapshot.state.turn,
            }),
          }),
        });
      },
    },
  };

  // --- Regla 4: order-grenade ---
  const orderGrenadeRule: CatalogRuleView = {
    id: "order-grenade-rule",
    kind: "concrete",
    priority: 100,
    commandType: "order-grenade",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      const targetHex = command.payload["targetHex"] as HexId;
      if (!pieceId || !targetHex) return false;
      if (!canUnitPerformOrder(state, pieceId, "GRE")) return false;
      const attacker = state.pieces[pieceId] as unknown as PieceState;
      if (!attacker || !attacker.hexId || attacker.status === "eliminated") return false;

      const targetPiece = Object.values(state.pieces).find((p) => {
        const piece = p as unknown as PieceState;
        return (
          piece.side === "german" &&
          piece.status === "active" &&
          piece.visibility === "revealed" &&
          piece.hexId === targetHex
        );
      });
      return targetPiece !== undefined && geometry.areAdjacent(attacker.hexId, targetHex);
    },
    apply: (_snapshot, _command) => {
      throw new Error("order-grenade requiere tirada de dados 2d6");
    },
    roll: {
      requestRoll: (snapshot, command) => {
        const pieceId = command.payload["pieceId"] as string;
        const targetHex = command.payload["targetHex"] as string;
        return diceRollRequest({
          id: `req-gre-${snapshot.state.turn}-${pieceId}` as DiceRollRequestId,
          gameId: snapshot.gameId,
          expectedSnapshotId: snapshot.id,
          context: { label: `order-grenade:${pieceId}:${targetHex}` },
          domain: { kind: "dice", count: 2, sides: 6 },
          diceOrder: [0, 1],
          outcomeMetadata: {
            kind: "calculation",
            targetValue: 6,
            baseValues: [{ name: "Base Granada fija", value: 6 }],
            modifiers: [],
            formula: "2d6 >= 6",
            comparison: ">=",
            sourceRefs: [],
          },
        });
      },
      interpret: (snapshot, resolution) => {
        const parts = resolution.context.label.split(":");
        const pieceId = parts[1] ?? "";
        const targetHex = parts[2] ?? "";
        const faces = resolution.effectiveFaces;
        const rollTotal = (faces[0] ?? 0) + (faces[1] ?? 0);

        const isHit = rollTotal >= 6;
        const newPieces = { ...snapshot.state.pieces };

        if (isHit) {
          for (const [key, p] of Object.entries(newPieces)) {
            const piece = p as unknown as PieceState;
            if (piece.side === "german" && piece.hexId === targetHex && piece.status === "active") {
              newPieces[key] = { ...piece, status: "eliminated" } as any;
            }
          }
        }

        const updatedOutcome = checkMissionOutcome(
          { ...snapshot.state, pieces: newPieces },
          objective,
          false,
        );

        const { effects: nextEffects } = consumeUnitOrder(snapshot.state, pieceId, "GRE");
        const nextActivation = { activePieceId: pieceId };

        const nextState = gameState({
          ...snapshot.state,
          pieces: newPieces,
          effects: nextEffects,
          activation: nextActivation,
          outcome: updatedOutcome,
        });

        const resultText = isHit
          ? `¡IMPACTO DE GRANADA! Unidad enemiga en ${targetHex} eliminada.`
          : `Granada fallada (Tirada: ${rollTotal} frente a 6+).`;

        const nextSimpleLog = [
          ...snapshot.simpleLog,
          makeSimpleLog(
            snapshot,
            pieceId,
            "lanza granada",
            `a ${targetHex}. ${resultText}`,
          ),
        ];

        return transitionProposal({
          expectedSnapshotId: snapshot.id,
          mode: "complete",
          next: gameSnapshot({
            id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
            gameId: snapshot.gameId,
            confirmedAt: new Date().toISOString(),
            state: nextState,
            randomState: resolution.nextRandomState,
            simpleLog: nextSimpleLog,
            detailedLog: snapshot.detailedLog,
            integrity: computeIntegrity({
              gameId: snapshot.gameId,
              missionId: snapshot.state.missionId,
              seed: resolution.nextRandomState.seed,
              turn: snapshot.state.turn,
            }),
          }),
        });
      },
    },
  };

  // --- Regla 5: order-cover ---
  const orderCoverRule: CatalogRuleView = {
    id: "order-cover-rule",
    kind: "concrete",
    priority: 100,
    commandType: "order-cover",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      if (!canUnitPerformOrder(state, pieceId, "COV")) return false;
      const piece = state.pieces[pieceId] as unknown as PieceState;
      return piece !== undefined && piece.status === "active";
    },
    apply: (snapshot, command) => {
      const pieceId = command.payload["pieceId"] as string;
      const piece = snapshot.state.pieces[pieceId] as unknown as PieceState;
      const updated: PieceState = { ...piece, cover: piece.cover + 1 };
      const newPieces = { ...snapshot.state.pieces, [pieceId]: updated as any };

      const { effects: nextEffects } = consumeUnitOrder(snapshot.state, pieceId, "COV");
      const nextActivation = { activePieceId: pieceId };

      const nextState = gameState({
        ...snapshot.state,
        pieces: newPieces,
        effects: nextEffects,
        activation: nextActivation,
      });

      const nextSimpleLog = [
        ...snapshot.simpleLog,
        makeSimpleLog(
          snapshot,
          pieceId,
          "cobertura",
          `nivel aumentado a ${updated.cover}.`,
        ),
      ];

      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        mode: "complete",
        next: gameSnapshot({
          id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
          gameId: snapshot.gameId,
          confirmedAt: new Date().toISOString(),
          state: nextState,
          randomState: snapshot.randomState,
          simpleLog: nextSimpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: computeIntegrity({
            gameId: snapshot.gameId,
            missionId: snapshot.state.missionId,
            seed: snapshot.randomState.seed,
            turn: snapshot.state.turn,
          }),
        }),
      });
    },
  };

  // --- Regla 6: order-rally ---
  const orderRallyRule: CatalogRuleView = {
    id: "order-rally-rule",
    kind: "concrete",
    priority: 100,
    commandType: "order-rally",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      if (!canUnitPerformOrder(state, pieceId, "RAL")) return false;
      const piece = state.pieces[pieceId] as unknown as PieceState;
      return piece !== undefined && piece.status === "active" && piece.morale === "low";
    },
    apply: (snapshot, command) => {
      const pieceId = command.payload["pieceId"] as string;
      const piece = snapshot.state.pieces[pieceId] as unknown as PieceState;
      const updated: PieceState = { ...piece, morale: "normal" };
      const newPieces = { ...snapshot.state.pieces, [pieceId]: updated as any };

      const { effects: nextEffects } = consumeUnitOrder(snapshot.state, pieceId, "RAL");
      const nextActivation = { activePieceId: pieceId };

      const nextState = gameState({
        ...snapshot.state,
        pieces: newPieces,
        effects: nextEffects,
        activation: nextActivation,
      });

      const nextSimpleLog = [
        ...snapshot.simpleLog,
        makeSimpleLog(
          snapshot,
          pieceId,
          "reagrupamiento",
          "Moral restaurada a normal.",
        ),
      ];

      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        mode: "complete",
        next: gameSnapshot({
          id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
          gameId: snapshot.gameId,
          confirmedAt: new Date().toISOString(),
          state: nextState,
          randomState: snapshot.randomState,
          simpleLog: nextSimpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: computeIntegrity({
            gameId: snapshot.gameId,
            missionId: snapshot.state.missionId,
            seed: snapshot.randomState.seed,
            turn: snapshot.state.turn,
          }),
        }),
      });
    },
  };

  // --- Regla 7: conclude-activation ---
  const concludeActivationRule: CatalogRuleView = {
    id: "conclude-activation-rule",
    kind: "concrete",
    priority: 100,
    commandType: "conclude-activation",
    matches: (state, command) => {
      if (state.phase !== "british" || state.outcome !== "in-progress") return false;
      const pieceId = command.payload["pieceId"] as string;
      return Boolean(pieceId && state.activation.activePieceId === pieceId);
    },
    apply: (snapshot, command) => {
      const pieceId = command.payload["pieceId"] as string;
      // Limpiar cualquier orden restante de esta unidad
      const cleanEffects = snapshot.state.effects.filter(
        (e) => !e.kind.startsWith(`remaining-orders:${pieceId}:`),
      );
      const nextState = gameState({
        ...snapshot.state,
        activation: {},
        effects: cleanEffects,
      });
      const nextSimpleLog = [
        ...snapshot.simpleLog,
        makeSimpleLog(
          snapshot,
          pieceId,
          "fin de activación",
          `Activación de ${pieceId} concluida.`,
        ),
      ];
      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        mode: "complete",
        next: gameSnapshot({
          id: snapshotId(`snap-${snapshot.state.turn}-${Date.now()}`),
          gameId: snapshot.gameId,
          confirmedAt: new Date().toISOString(),
          state: nextState,
          randomState: snapshot.randomState,
          simpleLog: nextSimpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: computeIntegrity({
            gameId: snapshot.gameId,
            missionId: snapshot.state.missionId,
            seed: snapshot.randomState.seed,
            turn: snapshot.state.turn,
          }),
        }),
      });
    },
  };

  // --- Regla 8: resolve-german-phase ---
  const resolveGermanPhaseRule: CatalogRuleView = {
    id: "resolve-german-phase-rule",
    kind: "concrete",
    priority: 100,
    commandType: "resolve-german-phase",
    matches: (state, _command) => {
      return state.phase === "british" && state.outcome === "in-progress";
    },
    apply: (snapshot, _command) => {
      const newPieces = { ...snapshot.state.pieces };
      const germanCombatLogs: string[] = [];
      let currentRandomState = snapshot.randomState;

      // Fuego alemán de cada unidad alemana revelada y activa
      for (const p of Object.values(newPieces)) {
        const german = p as unknown as PieceState;
        if (german.side !== "german" || german.status !== "active" || german.visibility !== "revealed") {
          continue;
        }

        // Buscar unidades británicas adyacentes
        const adjacentBritish = Object.values(newPieces).filter((b) => {
          const brit = b as unknown as PieceState;
          return (
            brit.side === "british" &&
            brit.status === "active" &&
            brit.hexId &&
            german.hexId &&
            geometry.areAdjacent(german.hexId, brit.hexId)
          );
        }) as unknown as PieceState[];

        if (adjacentBritish.length > 0) {
          const target = adjacentBritish[0]!;
          const isHmg = String(german.definitionId).includes("HMG");
          const baseThreshold = isHmg ? 5 : 6;
          const targetThreshold = baseThreshold + (target.cover ?? 0);

          const step = pureVersionedRandom.next(currentRandomState as any, {
            gameId: snapshot.gameId,
            domain: { kind: "dice", count: 2, sides: 6 },
            context: { label: `german-attack:${german.id}:${target.id}` },
          });
          currentRandomState = step.state;
          const rawDice = step.consumption.rawResult;
          const d1 = (rawDice[0] ?? 0) + 1;
          const d2 = (rawDice[1] ?? 0) + 1;
          const rollTotal = d1 + d2;
          const hits = rollTotal >= targetThreshold;

          if (hits) {
            if (target.morale === "low") {
              newPieces[target.id] = { ...target, status: "eliminated" } as any;
              germanCombatLogs.push(
                `Fuego enemigo de ${german.id} contra ${target.id}: tirada [${d1}, ${d2}] = ${rollTotal} vs umbral ${targetThreshold}+. ¡IMPACTO! Unidad británica eliminada.`
              );
            } else {
              newPieces[target.id] = { ...target, morale: "low" } as any;
              germanCombatLogs.push(
                `Fuego enemigo de ${german.id} contra ${target.id}: tirada [${d1}, ${d2}] = ${rollTotal} vs umbral ${targetThreshold}+. ¡Impacto! Moral británica reducida a Baja.`
              );
            }
          } else {
            germanCombatLogs.push(
              `Fuego enemigo de ${german.id} contra ${target.id}: tirada [${d1}, ${d2}] = ${rollTotal} vs umbral ${targetThreshold}+. El fuego enemigo falla.`
            );
          }
        }
      }

      // Comprobar derrota si todas las británicas fueron eliminadas
      const activeBritish = Object.values(newPieces).filter(
        (b) => (b as unknown as PieceState).side === "british" && (b as unknown as PieceState).status === "active",
      );

      let nextOutcome: GameState["outcome"] = snapshot.state.outcome;
      if (activeBritish.length === 0) {
        nextOutcome = "defeat";
      }

      // Fin del turno: avanzar turn tracker
      const isLastTurn = snapshot.state.turn >= maxTurns;
      const turnConcluded = true;
      if (nextOutcome === "in-progress") {
        nextOutcome = checkMissionOutcome(
          { ...snapshot.state, pieces: newPieces },
          objective,
          turnConcluded,
        );
      }

      const nextTurn = isLastTurn ? snapshot.state.turn : snapshot.state.turn + 1;
      const nextPhase = nextOutcome !== "in-progress" ? "german" : "british";

      // Limpiar efectos de activación y órdenes para el nuevo turno
      const cleanEffects = snapshot.state.effects.filter(
        (e) =>
          !e.kind.startsWith("activated:") &&
          !e.kind.startsWith("allowed-orders:") &&
          !e.kind.startsWith("orders:") &&
          !e.kind.startsWith("remaining-orders:"),
      );

      const nextState = gameState({
        ...snapshot.state,
        turn: nextTurn,
        phase: nextPhase,
        pieces: newPieces,
        activation: {},
        effects: cleanEffects,
        outcome: nextOutcome,
      });

      const nextSimpleLog = [
        ...snapshot.simpleLog,
        makeSimpleLog(
          snapshot,
          "Fase alemana",
          "combate",
          germanCombatLogs.length > 0 ? germanCombatLogs.join(" ") : "Sin fuego enemigo: no hay unidades británicas al alcance en este turno.",
        ),
      ];

      return transitionProposal({
        expectedSnapshotId: snapshot.id,
        mode: "complete",
        next: gameSnapshot({
          id: snapshotId(`snap-${nextTurn}-${Date.now()}`),
          gameId: snapshot.gameId,
          confirmedAt: new Date().toISOString(),
          state: nextState,
          randomState: currentRandomState,
          simpleLog: nextSimpleLog,
          detailedLog: snapshot.detailedLog,
          integrity: computeIntegrity({
            gameId: snapshot.gameId,
            missionId: snapshot.state.missionId,
            seed: snapshot.randomState.seed,
            turn: nextTurn,
          }),
        }),
      });
    },
  };

  // --- Acciones disponibles proyectables a la UI ---
  const actions: CatalogActionView[] = [
    {
      commandType: "activate-unit",
      labelKey: "log.simple.move",
      enabled: (state) =>
        state.phase === "british" &&
        state.outcome === "in-progress" &&
        Object.values(state.pieces).some(
          (p) =>
            (p as unknown as PieceState).side === "british" &&
            (p as unknown as PieceState).status === "active" &&
            !hasUnitActivatedThisTurn(state, (p as unknown as PieceState).id),
        ),
    },
    {
      commandType: "order-advance",
      labelKey: "log.simple.move",
      enabled: (state) => state.phase === "british" && Boolean(state.activation.activePieceId),
    },
    {
      commandType: "order-fire",
      labelKey: "log.simple.fire",
      enabled: (state) => state.phase === "british" && Boolean(state.activation.activePieceId),
    },
    {
      commandType: "order-grenade",
      labelKey: "log.simple.fire",
      enabled: (state) => state.phase === "british" && Boolean(state.activation.activePieceId),
    },
    {
      commandType: "order-cover",
      labelKey: "log.simple.move",
      enabled: (state) => state.phase === "british" && Boolean(state.activation.activePieceId),
    },
    {
      commandType: "order-rally",
      labelKey: "log.simple.move",
      enabled: (state) => {
        if (state.phase !== "british" || !state.activation.activePieceId) return false;
        const piece = state.pieces[state.activation.activePieceId] as unknown as PieceState;
        return piece?.morale === "low";
      },
    },
    {
      commandType: "resolve-german-phase",
      labelKey: "log.simple.move",
      enabled: (state) => state.phase === "british" && state.outcome === "in-progress",
    },
  ];

  return Object.freeze({
    id: options.catalogId,
    rules: Object.freeze([
      activateUnitRule,
      orderAdvanceRule,
      orderFireRule,
      orderGrenadeRule,
      orderCoverRule,
      orderRallyRule,
      concludeActivationRule,
      resolveGermanPhaseRule,
    ]),
    actions: Object.freeze(actions),
  });
}
