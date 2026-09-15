/**
 * Punto de entrada principal de la interfaz web PWA (Fields of Normandy).
 *
 * Conecta la UI con el motor de reglas del dominio:
 * - Control de acceso privado por PIN (por defecto "1944" o clave guardada).
 * - Orquestador GameCommandDispatcher + DiceRollCoordinator + RulesEngine.
 * - Renderizado SVG responsive del mapa hexagonal y fichas con árboles y terrenos.
 * - Resaltado dinámico de destinos de movimiento y blancos de ataque.
 * - Diálogos modales para tiradas de dados (automático / manual), fin de partida y tutorial.
 * - Registro de batalla sincronizado (simple y detallado).
 */
import {
  gameId as makeGameId,
  rulesVersion,
  saveVersion,
  snapshotId as makeSnapshotId,
  type GameId,
} from "../domain/identity/index.js";
import {
  gameSnapshot,
  gameState,
  type GameSnapshot,
  type GameState,
} from "../domain/engine/state.js";
import { createRulesEngine } from "../domain/engine/rules-engine.js";
import {
  GameCommandDispatcher,
  DiceRollCoordinator,
  type Clock,
  type SnapshotIdGenerator,
} from "../application/games/index.js";
import {
  initialRandomState,
  pureVersionedRandom,
} from "../domain/random/index.js";
import type {
  CommitReceipt,
  GameRepository,
  PersistableTransition,
} from "../domain/ports/index.js";
import { computeIntegrity } from "../domain/persistence/index.js";
import {
  MISSION_01_ID,
  MISSION_01_MAP,
  MISSION_01_SETUP,
} from "../catalog/FON-ML-2022/mission-01.js";
import { buildExecutableCatalog } from "../application/catalog/executable-catalog.js";
import {
  createActivateUnitCommand,
  createOrderAdvanceCommand,
  createOrderFireCommand,
  createOrderGrenadeCommand,
  createOrderCoverCommand,
  createOrderRallyCommand,
  createConcludeActivationCommand,
  createResolveGermanPhaseCommand,
} from "../application/commands/game-commands.js";
import {
  buildHexGeometry,
  type HexId,
  type PieceState,
  type HexGeometry,
} from "../domain/geometry/index.js";
import { projectMapToSvg, renderSvgMarkup } from "../ui/views/map-view.js";
import {
  viewState,
  select,
  type ViewState,
} from "../ui/views/view-state.js";
import { simpleLogEntry } from "../domain/logging/index.js";
import type { DiceRollRequest } from "../domain/engine/dice-roll.js";
import { orderCodeNameEs } from "../catalog/FON-ML-2022/orders-combat-counters.js";

// --- Repositorio en memoria con persistencia en sesión ---

class InMemoryGameRepository implements GameRepository {
  private latest: GameSnapshot | undefined;

  public set(snapshot: GameSnapshot): void {
    this.latest = snapshot;
  }

  public loadLatest(id: GameId): Promise<GameSnapshot> {
    if (!this.latest) {
      return Promise.reject(new Error(`Sin partida activa: ${id as string}`));
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

// --- Estado global de la aplicación web ---

const GAME_ID = makeGameId("partida-m01-pwa");
const RV = rulesVersion("FON-ML-2022");
const SV = saveVersion("sv-1");

let repository: InMemoryGameRepository;
let dispatcher: GameCommandDispatcher;
let diceCoordinator: DiceRollCoordinator;
let currentSnapshot: GameSnapshot;
let geometry: HexGeometry;
let currentViewState: ViewState;

let selectedPieceId: string | undefined = "GB-A";
let selectedTargetHex: string | undefined = undefined;
let pendingDiceRequest: DiceRollRequest | null = null;
let activeLogTab: "simple" | "detailed" = "simple";

// --- Referencias al DOM ---

const lockScreen = document.getElementById("lock-screen") as HTMLDivElement;
const lockForm = document.getElementById("lock-form") as HTMLFormElement;
const lockPinInput = document.getElementById("lock-pin") as HTMLInputElement;
const lockError = document.getElementById("lock-error") as HTMLParagraphElement;
const appContainer = document.getElementById("app") as HTMLDivElement;

const mapContainer = document.getElementById("map-container") as HTMLDivElement;
const selectionDetails = document.getElementById("selection-details") as HTMLDivElement;
const orderBanner = document.getElementById("order-banner") as HTMLDivElement;
const phaseBadge = document.getElementById("phase-badge") as HTMLSpanElement;
const turnPips = document.querySelectorAll("#turn-pips .pip");
const logContent = document.getElementById("log-content") as HTMLDivElement;
const tabSimple = document.getElementById("tab-simple") as HTMLButtonElement;
const tabDetailed = document.getElementById("tab-detailed") as HTMLButtonElement;

// Botones de acción
const btnActivate = document.getElementById("btn-activate") as HTMLButtonElement;
const btnAdvance = document.getElementById("btn-advance") as HTMLButtonElement;
const btnFire = document.getElementById("btn-fire") as HTMLButtonElement;
const btnGrenade = document.getElementById("btn-grenade") as HTMLButtonElement;
const btnCover = document.getElementById("btn-cover") as HTMLButtonElement;
const btnRally = document.getElementById("btn-rally") as HTMLButtonElement;
const btnConclude = document.getElementById("btn-conclude") as HTMLButtonElement;
const btnGermanPhase = document.getElementById("btn-german-phase") as HTMLButtonElement;

// Diálogos modales
const diceModal = document.getElementById("dice-modal") as HTMLDialogElement;
const diceModalTitle = document.getElementById("dice-modal-title") as HTMLHeadingElement;
const diceModalDesc = document.getElementById("dice-modal-desc") as HTMLParagraphElement;
const manualDiceInputs = document.getElementById("manual-dice-inputs") as HTMLDivElement;
const die1Input = document.getElementById("die-1") as HTMLInputElement;
const die2Input = document.getElementById("die-2") as HTMLInputElement;
const displayDie1 = document.getElementById("display-die-1") as HTMLDivElement;
const displayDie2 = document.getElementById("display-die-2") as HTMLDivElement;
const btnConfirmRoll = document.getElementById("btn-confirm-roll") as HTMLButtonElement;
const btnCancelRoll = document.getElementById("btn-cancel-roll") as HTMLButtonElement;
const combatResultPanel = document.getElementById("combat-result-panel") as HTMLDivElement;
const btnCombatContinue = document.getElementById("btn-combat-continue") as HTMLButtonElement;
const combatFloatingEffect = document.getElementById("combat-floating-effect") as HTMLDivElement;
const activationSelectionPanel = document.getElementById("activation-selection-panel") as HTMLDivElement;
const activationChoicePrompt = document.getElementById("activation-choice-prompt") as HTMLParagraphElement;
const activationChoicesContainer = document.getElementById("activation-choices-container") as HTMLDivElement;

let floatingEffectTimeout: ReturnType<typeof setTimeout> | null = null;

function showCombatFloatingEffect(
  text: string,
  type: "hit" | "miss" | "grenade-hit" | "german-hit" | "info" = "info",
): void {
  if (!combatFloatingEffect) return;

  if (floatingEffectTimeout) {
    clearTimeout(floatingEffectTimeout);
    floatingEffectTimeout = null;
  }

  combatFloatingEffect.className = `combat-floating-effect ${type}`;
  combatFloatingEffect.innerHTML = text;
  combatFloatingEffect.classList.remove("hidden");

  // Reflujo para reiniciar animación CSS
  void combatFloatingEffect.offsetWidth;

  floatingEffectTimeout = setTimeout(() => {
    combatFloatingEffect.classList.add("hidden");
    floatingEffectTimeout = null;
  }, 2600);
}

const gameOverModal = document.getElementById("game-over-modal") as HTMLDialogElement;
const gameOverTitle = document.getElementById("game-over-title") as HTMLHeadingElement;
const gameOverDesc = document.getElementById("game-over-desc") as HTMLParagraphElement;
const btnRestartGame = document.getElementById("btn-restart-game") as HTMLButtonElement;

const tutorialModal = document.getElementById("tutorial-modal") as HTMLDialogElement;
const btnOpenTutorial = document.getElementById("btn-open-tutorial") as HTMLButtonElement;
const btnCloseTutorial = document.getElementById("btn-close-tutorial") as HTMLButtonElement;

const germanPhaseModal = document.getElementById("german-phase-modal") as HTMLDialogElement;
const germanPhaseTitle = document.getElementById("german-phase-title") as HTMLHeadingElement;
const germanPhaseDesc = document.getElementById("german-phase-desc") as HTMLParagraphElement;
const germanPhaseDetails = document.getElementById("german-phase-details") as HTMLDivElement;
const btnGermanPhaseOk = document.getElementById("btn-german-phase-ok") as HTMLButtonElement;

// --- Control de acceso privado ---

const DEFAULT_PIN = "1944";

function checkAuth(): boolean {
  return sessionStorage.getItem("fon_auth_unlocked") === "true";
}

function unlockApp(): void {
  sessionStorage.setItem("fon_auth_unlocked", "true");
  lockScreen.classList.add("hidden");
  appContainer.classList.remove("hidden");
  initGame();
}

lockForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const entered = lockPinInput.value.trim();
  const customPin = localStorage.getItem("fon_user_pin");
  const expected = customPin || DEFAULT_PIN;

  if (entered === expected || entered === DEFAULT_PIN) {
    lockError.classList.add("hidden");
    unlockApp();
  } else {
    lockError.classList.remove("hidden");
    lockPinInput.select();
  }
});

// --- Inicialización del juego ---

function initGame(): void {
  geometry = buildHexGeometry(MISSION_01_MAP);

  const catalog = buildExecutableCatalog({
    catalogId: "FON-ML-2022-M01-cat",
    map: MISSION_01_MAP,
    setup: MISSION_01_SETUP,
    objective: { kind: "eliminate-all-germans" },
    maxTurns: 4,
  });

  const engine = createRulesEngine();
  let snapCounter = 1;
  const clock: Clock = { now: () => new Date().toISOString() };
  const idGen: SnapshotIdGenerator = {
    next: () => `snap-${Date.now()}-${snapCounter++}`,
  };

  repository = new InMemoryGameRepository();

  dispatcher = new GameCommandDispatcher({
    repository,
    engine,
    catalog,
    clock,
    idGenerator: idGen,
  });

  diceCoordinator = new DiceRollCoordinator({
    engine,
    catalog,
    random: pureVersionedRandom,
  });

  // Fichas iniciales de la Misión 01
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
    gameId: GAME_ID,
    missionId: MISSION_01_ID,
    rulesVersion: RV,
    saveVersion: SV,
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

  currentSnapshot = gameSnapshot({
    id: makeSnapshotId("snap-init-1"),
    gameId: GAME_ID,
    confirmedAt: new Date().toISOString(),
    state: initialState,
    randomState: initialRandomState("fon-seed-" + Date.now()),
    simpleLog: [
      simpleLogEntry({
        gameId: GAME_ID,
        sequence: 1,
        turn: 1,
        phase: "british",
        actor: "Mando Aliado",
        action: "Comienzo de Misión",
        result: "Escuadras A y B desplegadas en Hexágono 10. Fuerza enemiga oculta al norte en el bosque.",
        messageKey: "log.simple.setup",
        params: {},
      }),
    ],
    detailedLog: [],
    integrity: computeIntegrity({
      gameId: GAME_ID,
      missionId: MISSION_01_ID,
      seed: "fon-seed",
      turn: 1,
    }),
  });

  repository.set(currentSnapshot);

  currentViewState = viewState({
    viewport: {
      width: Math.max(window.innerWidth || 800, 320),
      height: Math.max(window.innerHeight || 600, 400),
    },
    selection: { pieceId: "GB-A" as any, hexId: "M01-H10" as any },
  });

  selectedPieceId = "GB-A";
  selectedTargetHex = undefined;

  renderAll();
}

// --- Funciones auxiliares de estado ---

function getRemainingOrders(state: GameState, pieceId: string): string[] {
  const effect = state.effects.find((e) => e.kind.startsWith(`remaining-orders:${pieceId}:`));
  if (!effect) return [];
  const raw = effect.kind.slice(`remaining-orders:${pieceId}:`.length);
  if (!raw || raw === "NONE") return [];
  return raw.split(",").filter(Boolean);
}

function hasRemainingOrder(state: GameState, pieceId: string, orderCode: string): boolean {
  const effect = state.effects.find((e) => e.kind.startsWith(`remaining-orders:${pieceId}:`));
  if (!effect) return false;
  const remaining = getRemainingOrders(state, pieceId);
  if (remaining.length === 0) return false;
  if (remaining.includes(orderCode)) return true;
  return remaining.some(
    (o) => o.startsWith("DOUBLES:") && o.split(":").slice(1).includes(orderCode),
  );
}

function hasUnitActivatedThisTurn(state: GameState, pieceId: string): boolean {
  const marker = `activated:${pieceId}:t${state.turn}`;
  return state.effects.some((e) => e.kind === marker || e.kind === `activated:${pieceId}`);
}

// --- Renderizado general de la interfaz ---

function renderAll(): void {
  renderMap();
  renderTopBar();
  renderSelectionInfo();
  renderActionButtons();
  renderLogs();
  checkGameOver();
}

function renderMap(): void {
  const pieces = Object.values(currentSnapshot.state.pieces) as unknown as PieceState[];
  const scene = projectMapToSvg(
    MISSION_01_MAP,
    geometry,
    pieces,
    currentViewState.selection,
  );
  mapContainer.innerHTML = renderSvgMarkup(scene, currentViewState);

  // Aplicar clases dinámicas de objetivos en el SVG
  applyDynamicHighlights();
}

function applyDynamicHighlights(): void {
  const state = currentSnapshot.state;
  const activePieceId = state.activation.activePieceId;
  const pieces = state.pieces as unknown as Record<string, PieceState>;
  const activePiece = activePieceId ? pieces[activePieceId] : undefined;

  // Solo mostrar resaltados de movimiento/ataque si la unidad activa está seleccionada
  if (
    activePieceId &&
    activePiece &&
    activePiece.hexId &&
    (selectedPieceId === activePieceId || selectedPieceId === undefined)
  ) {
    const canAdvance = hasRemainingOrder(state, activePieceId, "ADV");
    const canFire = hasRemainingOrder(state, activePieceId, "FIRE");
    const canGrenade = hasRemainingOrder(state, activePieceId, "GRE");

    // 1. Resaltar hexágonos a los que se puede avanzar (vecinos libres de enemigos)
    if (canAdvance) {
      const neighbors = geometry.neighbors(activePiece.hexId);
      for (const n of neighbors) {
        const hasGerman = Object.values(pieces).some(
          (p) => p.side === "german" && p.status === "active" && p.hexId === n,
        );
        if (!hasGerman) {
          const poly = mapContainer.querySelector(`polygon[data-hex-id="${n}"]`);
          if (poly) poly.classList.add("movable-target");
        }
      }
    }

    // 2. Resaltar enemigos alcanzables por Fuego (adyacente, distancia 1) o Granada (distancia 1)
    for (const p of Object.values(pieces)) {
      if (p.side === "german" && p.status === "active" && p.visibility === "revealed" && p.hexId) {
        const dist = geometry.distance(activePiece.hexId, p.hexId);
        if ((canFire || canGrenade) && dist === 1) {
          const poly = mapContainer.querySelector(`polygon[data-hex-id="${p.hexId}"]`);
          if (poly) poly.classList.add("attack-target");
        }
      }
    }
  }
}

function renderTopBar(): void {
  const currentTurn = currentSnapshot.state.turn;
  const maxTurns = currentSnapshot.state.duration.turns;
  turnPips.forEach((pip) => {
    const turnNum = Number(pip.getAttribute("data-turn"));
    if (turnNum === currentTurn) {
      pip.classList.add("active");
    } else {
      pip.classList.remove("active");
    }
  });

  const phase = currentSnapshot.state.phase;
  const remainingTurns = Math.max(0, maxTurns - currentTurn);
  const turnsNotice = remainingTurns === 0 ? " (¡ÚLTIMO TURNO!)" : ` (Quedan ${remainingTurns})`;
  if (phase === "british") {
    phaseBadge.textContent = `Turno ${currentTurn}/${maxTurns}${turnsNotice} - Fase Británica`;
    phaseBadge.className = "phase-badge phase-british";
  } else {
    phaseBadge.textContent = `Turno ${currentTurn}/${maxTurns} - Fase Alemana`;
    phaseBadge.className = "phase-badge phase-german";
  }
}

function renderSelectionInfo(): void {
  const state = currentSnapshot.state;
  const pieces = state.pieces as unknown as Record<string, PieceState>;

  let html = "";
  if (selectedPieceId && pieces[selectedPieceId]) {
    const piece = pieces[selectedPieceId]!;
    const isBritish = piece.side === "british";
    const sideName = isBritish ? "Británica (Aliada)" : "Alemana (Enemiga)";
    const hexDef = MISSION_01_MAP.hexes[piece.hexId as HexId];
    const hexLabel = hexDef ? hexDef.coordinate.label : piece.hexId;
    const isActivated = hasUnitActivatedThisTurn(state, piece.id);
    const isCurrentlyActive = state.activation.activePieceId === piece.id;

    html += `<div class="info-group">`;
    html += `<strong>Unidad:</strong> ${piece.id} (${piece.definitionId})<br/>`;
    html += `<strong>Bando:</strong> ${sideName}<br/>`;
    html += `<strong>Posición:</strong> Hexágono ${hexLabel} (${hexDef?.terrain.join(", ") || "Terreno"})<br/>`;
    html += `<strong>Estado:</strong> ${piece.status === "active" ? "En combate" : "Eliminada"}<br/>`;
    html += `<strong>Visibilidad:</strong> ${piece.visibility === "revealed" ? "Revelada" : "Oculta (?)"}<br/>`;
    if (isBritish) {
      const isLowMorale = piece.morale === "low";
      const moraleHtml = isLowMorale
        ? `<span class="status-badge badge-morale-low">⚠️ Baja (Herida / Desmoralizada)</span>`
        : `<span class="status-badge badge-morale-normal">🟢 Normal</span>`;
      const coverHtml =
        (piece.cover ?? 0) > 0
          ? `<span class="status-badge badge-cover">🛡️ +${piece.cover} (Atrincherada)</span>`
          : `0 (Sin cobertura)`;

      html += `<strong>Moral:</strong> ${moraleHtml}<br/>`;
      html += `<strong>Cobertura:</strong> +${piece.cover ?? 0} ${coverHtml !== "0 (Sin cobertura)" ? coverHtml : ""}<br/>`;
      let currentTurnText = "";
      if (isCurrentlyActive) {
        const remaining = getRemainingOrders(state, piece.id);
        if (remaining.length === 0) {
          currentTurnText = "<span style='color: var(--accent-gold); font-weight: bold;'>Órdenes agotadas (pendiente finalizar)</span>";
        } else {
          currentTurnText = `<span style='color: var(--accent-gold); font-weight: bold;'>¡Activa ahora! (${remaining.length} orden restante)</span>`;
        }
      } else if (isActivated) {
        currentTurnText = "Ya activada este turno";
      } else {
        currentTurnText = "<span style='color: #4ade80;'>Lista para activar</span>";
      }
      html += `<strong>Turno actual:</strong> ${currentTurnText}<br/>`;
    } else if (piece.visibility === "revealed") {
      const def = piece.definitionId && piece.definitionId !== "UNKNOWN" ? piece.definitionId : "Fuerza Alemana";
      const isForest = hexDef?.terrain.some((t) => String(t) === "bosque") ?? false;
      html += `<strong>Identificación:</strong> ${def}<br/>`;
      html += `<strong>Defensa requerida:</strong> ${isForest ? "🌲 Bosque (+1) → Tirada 9+ para eliminar" : "Terreno abierto → Tirada 8+ para eliminar"}<br/>`;
    }
    html += `</div>`;
  }

  if (selectedTargetHex) {
    const hexDef = MISSION_01_MAP.hexes[selectedTargetHex as HexId];
    if (hexDef) {
      html += `<div class="info-group" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">`;
      html += `<strong>Hexágono Objetivo:</strong> ${hexDef.coordinate.label} (${hexDef.id})<br/>`;
      html += `<strong>Terreno:</strong> ${hexDef.terrain.join(", ") === "bosque" ? "🌲 Bosque (+1 defensa)" : "Despejado"}<br/>`;
      const piecesHere = (Object.values(pieces) as PieceState[]).filter(
        (p) => p.hexId === hexDef.id && p.status === "active",
      );
      if (piecesHere.length > 0) {
        html += `<strong>Ocupantes:</strong> ${piecesHere
          .map((p) => (p.visibility === "hidden" ? "Incógnita (?)" : p.id))
          .join(", ")}<br/>`;
      }
      html += `</div>`;
    }
  }

  if (!html) {
    html = `<p class="muted">Toca una unidad o hexágono en el mapa para seleccionarlo.</p>`;
  }

  selectionDetails.innerHTML = html;
}

function renderActionButtons(): void {
  const state = currentSnapshot.state;
  const isBritishPhase = state.phase === "british" && state.outcome === "in-progress";
  const pieces = state.pieces as unknown as Record<string, PieceState>;
  const activePieceId = state.activation.activePieceId;

  // Banner de órdenes activas
  if (activePieceId && isBritishPhase) {
    const remaining = getRemainingOrders(state, activePieceId);
    const orderNames = orderCodeNameEs as Readonly<Record<string, string>>;
    const activePiece = pieces[activePieceId];

    if (remaining.length > 0) {
      const remainingList = remaining
        .map((code) => {
          if (code.startsWith("DOUBLES:")) {
            const parts = code.split(":").slice(1);
            const n1 = orderNames[parts[0] ?? ""] ?? parts[0];
            const n2 = orderNames[parts[1] ?? ""] ?? parts[1];
            return `<strong>🎲 ¡DOBLES! Elige 1 sola opción:</strong><br/>• <strong>${n1}</strong> (${parts[0]})<br/>• <strong>${n2}</strong> (${parts[1]})`;
          }
          const name = orderNames[code] ?? code;
          return `<strong>${name}</strong> (${code})`;
        })
        .join(", ");

      let tip = "";
      if (remaining.includes("ADV") || remaining.some((o) => o.includes("ADV"))) {
        tip += `<div style="color: #38bdf8; margin-top: 4px; font-size: 0.82rem;">💡 <em>Toca un hexágono azul para avanzar.</em></div>`;
      }

      if (remaining.includes("FIRE") || remaining.some((o) => o.includes("FIRE"))) {
        const hasAdj =
          activePiece &&
          activePiece.hexId &&
          Object.values(pieces).some(
            (p) =>
              p.side === "german" &&
              p.status === "active" &&
              p.visibility === "revealed" &&
              p.hexId &&
              geometry.distance(activePiece.hexId!, p.hexId) === 1,
          );
        if (!hasAdj) {
          tip += `<div style="color: #fbbf24; margin-top: 4px; font-size: 0.82rem;">⚠️ <em>Fuego requiere un enemigo revelado adyacente (distancia 1). Si no hay enemigos cerca, pulsa "Finalizar activación / Descartar".</em></div>`;
        } else {
          tip += `<div style="color: #ef4444; margin-top: 4px; font-size: 0.82rem;">🎯 <em>Enemigo adyacente al alcance. Pulsa "3. Fuego (8+)" para disparar.</em></div>`;
        }
      }

      const isDoubles = remaining.some((o) => o.startsWith("DOUBLES:"));
      const countLabel = isDoubles ? "1 orden por Dobles" : `${remaining.length} orden${remaining.length > 1 ? "es" : ""}`;
      orderBanner.innerHTML =
        `<strong>Unidad ${activePieceId} activa</strong> (${countLabel}):<br/>` +
        `• ${remainingList}` +
        tip;
      orderBanner.classList.remove("hidden");
    } else {
      const otherBritReady = Object.values(pieces).find(
        (p) =>
          p.side === "british" &&
          p.status === "active" &&
          !hasUnitActivatedThisTurn(state, p.id) &&
          p.id !== activePieceId,
      );
      orderBanner.innerHTML =
        `<strong>✅ Activación completada para ${activePieceId}:</strong> Todas las órdenes han sido consumidas.<br/>` +
        `<div style="margin-top: 4px; font-size: 0.88rem;">` +
        (otherBritReady
          ? `👉 Pulsa <strong>"Finalizar activación de ${activePieceId}"</strong> o selecciona la Escuadra <strong>${otherBritReady.id}</strong> para activar.`
          : `👉 Ambas escuadras han actuado. Pulsa <strong>"Terminar fase británica"</strong> para ver el contraataque alemán.`) +
        `</div>`;
      orderBanner.classList.remove("hidden");
    }
  } else {
    orderBanner.classList.add("hidden");
  }

  // 1. Botón Activar
  let canActivate = false;
  if (isBritishPhase && selectedPieceId && pieces[selectedPieceId]) {
    const p = pieces[selectedPieceId]!;
    const alreadyActivated = hasUnitActivatedThisTurn(state, p.id);
    const activePieceRemaining = activePieceId ? getRemainingOrders(state, activePieceId) : [];
    // Se puede activar si es británica activa no activada este turno, y:
    // o bien no hay unidad activa, o bien la activa actual ya agotó sus órdenes
    canActivate = p.side === "british" && p.status === "active" && !alreadyActivated && (!activePieceId || activePieceRemaining.length === 0);
  }
  btnActivate.disabled = !canActivate;

  // Órdenes para la unidad activa
  const isControllingActivePiece =
    isBritishPhase &&
    Boolean(activePieceId) &&
    (selectedPieceId === activePieceId ||
      selectedPieceId === undefined ||
      pieces[selectedPieceId]?.side === "german");
  const activePiece = activePieceId ? pieces[activePieceId] : undefined;

  let canAdvance = false;
  let canFire = false;
  let canGrenade = false;
  let canCover = false;
  let canRally = false;

  if (isControllingActivePiece && activePieceId && activePiece && activePiece.hexId) {
    const neighbors = geometry.neighbors(activePiece.hexId);

    // Avanzar: requiere tener la orden ADV disponible y vecinos libres
    if (hasRemainingOrder(state, activePieceId, "ADV") && neighbors.length > 0) {
      canAdvance = true;
    }

    // Fuego & Granada: requiere enemigo revelado y adyacente (distancia 1)
    for (const p of Object.values(pieces)) {
      if (p.side === "german" && p.status === "active" && p.visibility === "revealed" && p.hexId) {
        const dist = geometry.distance(activePiece.hexId, p.hexId);
        if (dist === 1) {
          if (hasRemainingOrder(state, activePieceId, "FIRE")) canFire = true;
          if (hasRemainingOrder(state, activePieceId, "GRE")) canGrenade = true;
        }
      }
    }

    // Cobertura: si la orden está disponible y aún no tiene cobertura
    if (hasRemainingOrder(state, activePieceId, "COV") && (activePiece.cover ?? 0) === 0) {
      canCover = true;
    }

    // Reagrupar: si la orden está disponible y tiene moral baja
    if (hasRemainingOrder(state, activePieceId, "RAL") && activePiece.morale === "low") {
      canRally = true;
    }
  }

  btnAdvance.disabled = !canAdvance;
  btnFire.disabled = !canFire;
  btnGrenade.disabled = !canGrenade;
  btnCover.disabled = !canCover;
  btnRally.disabled = !canRally;

  // Botón Finalizar activación de la unidad
  if (activePieceId && isBritishPhase) {
    btnConclude.disabled = false;
    const remaining = getRemainingOrders(state, activePieceId);
    if (remaining.length === 0) {
      btnConclude.textContent = `Finalizar activación de ${activePieceId}`;
      btnConclude.classList.add("btn-primary");
      btnConclude.classList.remove("btn-secondary");
    } else {
      btnConclude.textContent = `Finalizar activación / Descartar (${activePieceId})`;
      btnConclude.classList.remove("btn-primary");
      btnConclude.classList.add("btn-secondary");
    }
  } else {
    btnConclude.disabled = true;
    btnConclude.textContent = "Finalizar activación / Descartar";
    btnConclude.classList.remove("btn-primary");
    btnConclude.classList.add("btn-secondary");
  }

  // Botón Terminar fase británica: habilitado siempre que no haya órdenes activas pendientes
  const hasPendingOrders = activePieceId ? getRemainingOrders(state, activePieceId).length > 0 : false;
  btnGermanPhase.disabled = !isBritishPhase || hasPendingOrders;
}

function renderLogs(): void {
  const entries = activeLogTab === "simple" ? currentSnapshot.simpleLog : currentSnapshot.detailedLog;
  if (!entries || entries.length === 0) {
    logContent.innerHTML = `<p class="log-entry">Sin eventos registrados aún.</p>`;
    return;
  }

  const items = entries.slice(-25).map((entry) => {
    if (activeLogTab === "simple") {
      const e = entry as any;
      return `<p class="log-entry"><span style="color: var(--accent-gold)">[T${e.turn} ${e.phase === "british" ? "BRIT" : "ALEM"}]</span> <strong>${e.actor}</strong>: ${e.result}</p>`;
    } else {
      const e = entry as any;
      const detail = e.deterministic?.inputs?.join("; ") || "Evento";
      return `<p class="log-entry" style="font-size: 0.75rem;">[#${e.sequence}] ${detail}</p>`;
    }
  });

  logContent.innerHTML = items.join("");
}

function checkGameOver(): void {
  const outcome = currentSnapshot.state.outcome;
  const state = currentSnapshot.state;
  if (outcome === "victory") {
    gameOverTitle.textContent = "¡VICTORIA ALIADA!";
    gameOverDesc.textContent =
      "¡Enhorabuena! Has neutralizado con éxito a todas las fuerzas alemanas del bosque y asegurado la posición.";
    gameOverModal.showModal();
  } else if (outcome === "defeat") {
    gameOverTitle.textContent = "MISIÓN FALLIDA";
    const activeBritish = Object.values(state.pieces).filter(
      (p: any) => p.side === "british" && p.status === "active",
    );
    if (activeBritish.length === 0) {
      gameOverDesc.textContent =
        "Todas tus escuadras han sido eliminadas por el fuego enemigo. Tus hombres no han podido sostener la ofensiva.";
    } else {
      gameOverDesc.textContent =
        `Se han completado los ${state.duration.turns} turnos de la misión sin eliminar a la guarnición alemana oculta en el bosque. El enemigo ha reforzado su posición.`;
    }
    gameOverModal.showModal();
  }
}

// --- Manejadores de interacción con el mapa ---

mapContainer.addEventListener("click", async (e) => {
  const target = e.target as SVGElement;
  const pieceEl = target.closest("[data-piece-id]") as SVGElement | null;
  const hexEl = target.closest("[data-hex-id]") as SVGElement | null;

  if (pieceEl) {
    const pieceId = pieceEl.getAttribute("data-piece-id");
    if (pieceId && currentSnapshot) {
      const piece = currentSnapshot.state.pieces[pieceId] as unknown as PieceState | undefined;
      if (piece) {
        const activePieceId = currentSnapshot.state.activation.activePieceId;

        // Si ya hay una unidad británica activa seleccionada y tocamos una unidad alemana:
        if (activePieceId && activePieceId === selectedPieceId && piece.side === "german") {
          selectedTargetHex = piece.hexId;
        } else {
          selectedPieceId = pieceId;
          selectedTargetHex = undefined;
        }

        const sel: { pieceId?: any; hexId?: HexId } = { pieceId: selectedPieceId as any };
        if (piece.hexId) sel.hexId = piece.hexId;
        currentViewState = select(currentViewState, sel);
        renderAll();
        return;
      }
    }
  }

  if (hexEl) {
    const hexId = hexEl.getAttribute("data-hex-id");
    if (hexId && currentSnapshot) {
      const activePieceId = currentSnapshot.state.activation.activePieceId;
      const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
      const activePiece = activePieceId ? pieces[activePieceId] : undefined;

      // Movimiento rápido: si la unidad activa pulsa directamente un hexágono vecino resaltado
      if (
        activePieceId &&
        activePiece &&
        activePiece.hexId &&
        geometry.neighbors(activePiece.hexId).includes(hexId as HexId) &&
        btnAdvance &&
        !btnAdvance.disabled
      ) {
        selectedTargetHex = hexId;
        await executeAdvance(activePieceId, hexId);
        return;
      }

      selectedTargetHex = hexId;
      if (selectedPieceId) {
        currentViewState = select(currentViewState, {
          pieceId: selectedPieceId as any,
          hexId: hexId as any,
        });
      } else {
        currentViewState = select(currentViewState, { hexId: hexId as any });
      }
      renderAll();
    }
  }
});

// --- Pestañas de registro ---

tabSimple.addEventListener("click", () => {
  activeLogTab = "simple";
  tabSimple.classList.add("active");
  tabDetailed.classList.remove("active");
  renderLogs();
});

tabDetailed.addEventListener("click", () => {
  activeLogTab = "detailed";
  tabDetailed.classList.add("active");
  tabSimple.classList.remove("active");
  renderLogs();
});

const btnCopyLog = document.getElementById("btn-copy-log") as HTMLButtonElement | null;
if (btnCopyLog) {
  btnCopyLog.addEventListener("click", async () => {
    const entries = activeLogTab === "simple" ? currentSnapshot.simpleLog : currentSnapshot.detailedLog;
    const text = entries
      .map((entry: any) => {
        if (activeLogTab === "simple") {
          return `[T${entry.turn} ${entry.phase === "british" ? "BRIT" : "ALEM"}] ${entry.actor}: ${entry.result || entry.action}`;
        }
        return `[T${entry.turn} ${entry.phase}] ${entry.summary}`;
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      const prev = btnCopyLog.textContent;
      btnCopyLog.textContent = "✅ ¡Copiado!";
      setTimeout(() => {
        btnCopyLog.textContent = prev;
      }, 2000);
    } catch {
      alert("No se pudo copiar automáticamente al portapapeles. Puedes seleccionarlo directamente en la caja de registro con el ratón.");
    }
  });
}

// --- Ejecución de órdenes de combate y mando ---

// 1. Activar
btnActivate.addEventListener("click", async () => {
  if (!selectedPieceId) return;

  // Si hay otra unidad activa que ya agotó sus órdenes, concluirla primero
  const prevActivePieceId = currentSnapshot.state.activation.activePieceId;
  if (prevActivePieceId && prevActivePieceId !== selectedPieceId) {
    const concludeCmd = createConcludeActivationCommand(GAME_ID, currentSnapshot.id, prevActivePieceId);
    const concludeOutcome = await dispatcher.execute(concludeCmd);
    if (concludeOutcome.kind === "committed") {
      currentSnapshot = await repository.loadLatest(GAME_ID);
    }
  }

  const cmd = createActivateUnitCommand(GAME_ID, currentSnapshot.id, selectedPieceId);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "awaiting-roll") {
    openDiceModal(
      outcome.request,
      `Tirada de activación: ${selectedPieceId}`,
      `Lanza 2d6. El 1º dado da la orden de la Columna 1 y el 2º dado la orden de la Columna 2.`,
    );
  } else if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);
    renderAll();
  }
});

// 2. Avanzar
async function executeAdvance(pieceId: string, toHex: string): Promise<void> {
  const cmd = createOrderAdvanceCommand(GAME_ID, currentSnapshot.id, pieceId, toHex);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);
    selectedTargetHex = undefined;
    const activeP = currentSnapshot.state.pieces[pieceId] as unknown as PieceState;
    if (activeP && activeP.hexId) {
      currentViewState = select(currentViewState, { pieceId: pieceId as any, hexId: activeP.hexId });
    }

    renderAll();
  }
}

btnAdvance.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;

  if (selectedTargetHex) {
    const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
    const activePiece = pieces[activePieceId];
    if (activePiece && activePiece.hexId && geometry.neighbors(activePiece.hexId).includes(selectedTargetHex as HexId)) {
      await executeAdvance(activePieceId, selectedTargetHex);
      return;
    }
  }

  // Si no hay hexágono objetivo seleccionado, informar al jugador
  alert("Por favor, toca uno de los hexágonos vecinos resaltados en azul en el mapa para moverte a él.");
});

// 3. Fuego
btnFire.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;

  // Auto-seleccionar enemigo en rango si solo hay uno
  const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
  const activePiece = pieces[activePieceId];
  if (!activePiece || !activePiece.hexId) return;

  let targetHex = selectedTargetHex;
  if (!targetHex) {
    const enemy = Object.values(pieces).find(
      (p) =>
        p.side === "german" &&
        p.status === "active" &&
        p.visibility === "revealed" &&
        p.hexId &&
        geometry.distance(activePiece.hexId as HexId, p.hexId) === 1,
    );
    if (enemy) targetHex = enemy.hexId;
  }

  if (!targetHex) {
    alert("Selecciona un enemigo revelado en un hexágono adyacente (distancia 1) para disparar.");
    return;
  }

  const cmd = createOrderFireCommand(GAME_ID, currentSnapshot.id, activePieceId, targetHex);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "awaiting-roll") {
    openDiceModal(
      outcome.request,
      `Fuego de fusilería (8+): ${activePieceId}`,
      `Disparando a ${targetHex}. Necesitas 8 o más en 2d6 (modificado por la cobertura enemiga).`,
    );
  }
});

// 4. Granada
btnGrenade.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;

  const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
  const activePiece = pieces[activePieceId];
  if (!activePiece || !activePiece.hexId) return;

  let targetHex = selectedTargetHex;
  if (!targetHex) {
    const enemy = Object.values(pieces).find(
      (p) =>
        p.side === "german" &&
        p.status === "active" &&
        p.visibility === "revealed" &&
        p.hexId &&
        geometry.distance(activePiece.hexId as HexId, p.hexId) === 1,
    );
    if (enemy) targetHex = enemy.hexId;
  }

  if (!targetHex) {
    alert("Selecciona un enemigo en un hexágono adyacente para lanzar una granada.");
    return;
  }

  const cmd = createOrderGrenadeCommand(GAME_ID, currentSnapshot.id, activePieceId, targetHex);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "awaiting-roll") {
    openDiceModal(
      outcome.request,
      `Lanzamiento de granada (6+): ${activePieceId}`,
      `Lanzando granada contra ${targetHex}. Necesitas 6 o más en 2d6.`,
    );
  }
});

// 5. Cobertura
btnCover.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;
  const cmd = createOrderCoverCommand(GAME_ID, currentSnapshot.id, activePieceId);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);
    showCombatFloatingEffect(`🛡️ +1 Cobertura defensiva para ${activePieceId}`, "info");
    renderAll();
  }
});

// 6. Reagrupar
btnRally.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;
  const cmd = createOrderRallyCommand(GAME_ID, currentSnapshot.id, activePieceId);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);
    showCombatFloatingEffect(`🎖️ ¡Moral de ${activePieceId} restaurada a Normal!`, "info");
    renderAll();
  }
});

// 7. Finalizar activación de la unidad
btnConclude.addEventListener("click", async () => {
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (!activePieceId) return;

  const cmd = createConcludeActivationCommand(GAME_ID, currentSnapshot.id, activePieceId);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);

    // Buscar automáticamente a la otra unidad británica lista para activar
    const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
    const otherUnit = Object.values(pieces).find(
      (p) =>
        p.side === "british" &&
        p.status === "active" &&
        !hasUnitActivatedThisTurn(currentSnapshot.state, p.id),
    );

    if (otherUnit) {
      selectedPieceId = otherUnit.id;
      selectedTargetHex = undefined;
      const sel: { pieceId?: any; hexId?: HexId } = { pieceId: otherUnit.id as any };
      if (otherUnit.hexId) sel.hexId = otherUnit.hexId;
      currentViewState = select(currentViewState, sel);
    } else {
      selectedTargetHex = undefined;
    }

    renderAll();
  }
});

let pendingGermanPhaseEffect: {
  text: string;
  type: "hit" | "miss" | "grenade-hit" | "german-hit" | "info";
} | null = null;

// 8. Terminar fase británica (Fase Alemana)
btnGermanPhase.addEventListener("click", async () => {
  // Si la última unidad activa agotó sus órdenes pero no se pulsó concluir, concluirla antes de cerrar la fase
  const activePieceId = currentSnapshot.state.activation.activePieceId;
  if (activePieceId) {
    const concludeCmd = createConcludeActivationCommand(GAME_ID, currentSnapshot.id, activePieceId);
    const concludeOutcome = await dispatcher.execute(concludeCmd);
    if (concludeOutcome.kind === "committed") {
      currentSnapshot = await repository.loadLatest(GAME_ID);
    }
  }

  const cmd = createResolveGermanPhaseCommand(GAME_ID, currentSnapshot.id);
  const outcome = await dispatcher.execute(cmd);

  if (outcome.kind === "committed") {
    currentSnapshot = await repository.loadLatest(GAME_ID);
    selectedTargetHex = undefined;

    // Seleccionar la primera unidad británica activa
    const pieces = currentSnapshot.state.pieces as unknown as Record<string, PieceState>;
    const firstBrit = Object.values(pieces).find(
      (p) => p.side === "british" && p.status === "active",
    );
    if (firstBrit) {
      selectedPieceId = firstBrit.id;
      const sel: { pieceId?: any; hexId?: HexId } = { pieceId: firstBrit.id as any };
      if (firstBrit.hexId) sel.hexId = firstBrit.hexId;
      currentViewState = select(currentViewState, sel);
    }

    renderAll();

    // Mostrar modal con los resultados de la fase alemana si la partida sigue en curso
    if (currentSnapshot.state.outcome === "in-progress") {
      const lastGermanLog = [...currentSnapshot.simpleLog]
        .reverse()
        .find((e: any) => e.actor === "Fase alemana");
      const detailText = lastGermanLog?.result || "Sin incidentes enemigos en este turno.";

      germanPhaseTitle.textContent = "Resolución: Fase Alemana";
      germanPhaseDesc.textContent = `Turno ${currentSnapshot.state.turn - 1} completado.`;

      // Formatear visualmente las acciones del Eje
      if (detailText.includes("Sin fuego enemigo")) {
        germanPhaseDetails.innerHTML = `
          <div class="german-attack-card quiet">
            <div class="german-card-header">🌲 Posiciones aseguradas</div>
            <div class="german-card-body">${detailText}</div>
            <div><span class="german-card-badge badge-safe">Sin bajas aliadas</span></div>
          </div>
        `;
        pendingGermanPhaseEffect = null;
      } else {
        const sentences = detailText.split(/(?<=\.)\s+/).filter(Boolean);
        let cardsHtml = "";
        let hasHit = false;
        let hitTarget = "";
        for (const s of sentences) {
          const isHit = s.includes("¡Impacto!") || s.includes("¡IMPACTO!");
          if (isHit) {
            hasHit = true;
            const match = s.match(/contra\s+(GB-[AB])/i);
            if (match && match[1]) hitTarget = match[1];
            const isEliminated = s.includes("eliminada");
            cardsHtml += `
              <div class="german-attack-card hit">
                <div class="german-card-header">🚨💥 ¡Fuego enemigo recibido!</div>
                <div class="german-card-body">${s}</div>
                <div><span class="german-card-badge badge-danger">${isEliminated ? "☠️ ¡Unidad Británica Eliminada!" : "⚠️ ¡Moral Reducida a BAJA (Herida)!"}</span></div>
              </div>
            `;
          } else {
            cardsHtml += `
              <div class="german-attack-card miss">
                <div class="german-card-header">🛡️ ¡Fuego enemigo repelido!</div>
                <div class="german-card-body">${s}</div>
                <div><span class="german-card-badge badge-safe">✅ El fuego no causó bajas</span></div>
              </div>
            `;
          }
        }
        germanPhaseDetails.innerHTML = cardsHtml;
        if (hasHit) {
          pendingGermanPhaseEffect = {
            text: `🚨 ¡${hitTarget || "Escuadra británica"} bajo fuego! Moral: BAJA`,
            type: "german-hit",
          };
        } else {
          pendingGermanPhaseEffect = {
            text: "🛡️ ¡Fuego enemigo repelido sin bajas!",
            type: "info",
          };
        }
      }

      btnGermanPhaseOk.textContent = `Comenzar Turno ${currentSnapshot.state.turn}`;
      germanPhaseModal.showModal();
    }
  }
});

// --- Manejo del diálogo de dados ---

const RIFLE_SQUAD_ROWS: Record<number, { first: string; second: string }> = {
  1: { first: "RAL", second: "GRE" },
  2: { first: "ADV", second: "SCO" },
  3: { first: "ADV", second: "COV" },
  4: { first: "FIRE", second: "COV" },
  5: { first: "FIRE", second: "ADV" },
  6: { first: "ADV", second: "FIRE" },
};

function openDiceModal(request: DiceRollRequest, title: string, desc: string): void {
  pendingDiceRequest = request;
  diceModalTitle.textContent = title;
  diceModalDesc.textContent = desc;

  displayDie1.textContent = "?";
  displayDie2.textContent = "?";

  combatResultPanel.classList.add("hidden");
  combatResultPanel.innerHTML = "";
  btnCombatContinue.classList.add("hidden");

  activationSelectionPanel.classList.add("hidden");
  activationChoicesContainer.innerHTML = "";
  btnConfirmRoll.classList.remove("hidden");

  if (request.context.label.startsWith("activate-unit:")) {
    btnConfirmRoll.textContent = "🎲 Lanzar dados";
  } else if (request.context.label.startsWith("order-fire:")) {
    btnConfirmRoll.textContent = "🎯 Disparar (Tirar 2d6)";
  } else if (request.context.label.startsWith("order-grenade:")) {
    btnConfirmRoll.textContent = "💣 Lanzar Granada (Tirar 2d6)";
  } else {
    btnConfirmRoll.textContent = "Tirar / Confirmar";
  }

  btnCancelRoll.classList.remove("hidden");
  diceModal.showModal();
}

document.querySelectorAll("input[name='dice-mode']").forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    if (val === "manual") {
      manualDiceInputs.classList.remove("hidden");
    } else {
      manualDiceInputs.classList.add("hidden");
    }
  });
});

async function handleRollDice(): Promise<void> {
  if (!pendingDiceRequest) return;

  const isActivation = pendingDiceRequest.context.label.startsWith("activate-unit:");
  const modeRadio = document.querySelector("input[name='dice-mode']:checked") as HTMLInputElement;
  const isManual = modeRadio && modeRadio.value === "manual";

  let d1: number;
  let d2: number;

  if (isManual) {
    d1 = Math.min(6, Math.max(1, parseInt(die1Input.value, 10) || 1));
    d2 = Math.min(6, Math.max(1, parseInt(die2Input.value, 10) || 1));
  } else {
    d1 = Math.floor(Math.random() * 6) + 1;
    d2 = Math.floor(Math.random() * 6) + 1;
  }

  displayDie1.textContent = String(d1);
  displayDie2.textContent = String(d2);

  if (isActivation) {
    // Reglas oficiales de Mike Lambo (pág. 6):
    // El jugador elige UNO de los dos dados para seleccionar la fila de órdenes.
    // Si saca dobles, puede aceptar la fila o relanzar ambos dados.
    showActivationChoices(d1, d2, isManual);
    return;
  }

  // Si es combate (Fuego o Granada), resolver directamente
  await resolveAndCommitRoll([d1, d2]);
}

function showActivationChoices(d1: number, d2: number, isManual: boolean): void {
  if (!pendingDiceRequest) return;

  const pieceId = pendingDiceRequest.context.label.split(":")[1] || "";
  const piece = currentSnapshot.state.pieces[pieceId] as unknown as PieceState | undefined;
  const isLowMorale = piece?.morale === "low";
  const names = orderCodeNameEs as Record<string, string>;

  btnConfirmRoll.classList.add("hidden");
  activationSelectionPanel.classList.remove("hidden");
  activationChoicesContainer.innerHTML = "";

  if (d1 === d2) {
    // Dobles: opción de aceptar la fila o relanzar ambos dados
    activationChoicePrompt.innerHTML =
      `<span style="color: var(--accent-gold); font-weight: bold; font-size: 1.05rem;">🎲 ¡Has obtenido Dobles (${d1} y ${d1})!</span><br/>` +
      `Según la regla oficial de Mike Lambo (pág. 6), puedes aceptar esta fila o relanzar ambos dados:`;

    const row = RIFLE_SQUAD_ROWS[d1] || { first: "ADV", second: "COV" };
    const n1 = names[row.first] ?? row.first;
    const n2 = names[row.second] ?? row.second;
    const desc = isLowMorale
      ? `• 1ª orden: <strong>${n1}</strong> (Moral baja: solo 1ª orden)`
      : `• 1ª orden: <strong>${n1}</strong> (${row.first})<br/>• 2ª orden: <strong>${n2}</strong> (${row.second})`;

    // Tarjeta 1: Aceptar Fila
    const acceptCard = document.createElement("button");
    acceptCard.className = "choice-card";
    acceptCard.type = "button";
    acceptCard.innerHTML = `
      <div class="choice-card-header">✅ Aceptar Fila ${d1}</div>
      <div class="choice-card-orders">${desc}</div>
    `;
    acceptCard.addEventListener("click", async () => {
      await resolveAndCommitRoll([d1, d1]);
    });
    activationChoicesContainer.appendChild(acceptCard);

    // Tarjeta 2: Relanzar dados
    const rerollCard = document.createElement("button");
    rerollCard.className = "choice-card doubles-reroll";
    rerollCard.type = "button";
    rerollCard.innerHTML = `
      <div class="choice-card-header">🎲 Relanzar dados (Regla oficial de dobles)</div>
      <div class="choice-card-orders">Descarta esta tirada y lanza 2 dados nuevos.</div>
    `;
    rerollCard.addEventListener("click", () => {
      if (isManual) {
        activationSelectionPanel.classList.add("hidden");
        btnConfirmRoll.classList.remove("hidden");
        btnConfirmRoll.textContent = "Verificar nuevos dados";
        displayDie1.textContent = "?";
        displayDie2.textContent = "?";
        die1Input.value = "";
        die2Input.value = "";
        die1Input.focus();
      } else {
        handleRollDice();
      }
    });
    activationChoicesContainer.appendChild(rerollCard);
  } else {
    // Dados distintos: elegir Dado 1 o Dado 2
    activationChoicePrompt.textContent =
      "Elige qué dado deseas conservar para activar la unidad (el otro dado se descarta):";

    const createChoiceCard = (chosen: number, other: number) => {
      const row = RIFLE_SQUAD_ROWS[chosen] || { first: "ADV", second: "FIRE" };
      const n1 = names[row.first] ?? row.first;
      const n2 = names[row.second] ?? row.second;
      const desc = isLowMorale
        ? `• 1ª orden: <strong>${n1}</strong> (Moral baja: solo 1ª orden)`
        : `• 1ª orden: <strong>${n1}</strong> (${row.first})<br/>• 2ª orden: <strong>${n2}</strong> (${row.second})`;

      const card = document.createElement("button");
      card.className = "choice-card";
      card.type = "button";
      card.innerHTML = `
        <div class="choice-card-header">🎲 Elegir Fila ${chosen} (Dado ${chosen})</div>
        <div class="choice-card-orders">${desc}</div>
      `;
      card.addEventListener("click", async () => {
        await resolveAndCommitRoll([chosen, other]);
      });
      return card;
    };

    activationChoicesContainer.appendChild(createChoiceCard(d1, d2));
    activationChoicesContainer.appendChild(createChoiceCard(d2, d1));
  }
}

async function resolveAndCommitRoll(faces: [number, number]): Promise<void> {
  if (!pendingDiceRequest) return;

  const req = pendingDiceRequest;
  const rollInput = {
    source: "manual" as const,
    faces,
  };

  const rollRes = diceCoordinator.resolve(
    currentSnapshot,
    req,
    rollInput,
    currentSnapshot.randomState as any,
  );

  if (rollRes.kind === "resolved" && rollRes.decision.kind === "accepted") {
    const proposal = rollRes.decision.proposal;
    await dispatcher.confirmDecision(proposal);
    currentSnapshot = await repository.loadLatest(GAME_ID);
    pendingDiceRequest = null;

    const label = req.context.label;
    const isCombat = label.startsWith("order-fire:") || label.startsWith("order-grenade:");

    if (isCombat) {
      const logs = proposal.next.simpleLog;
      const lastLog = logs[logs.length - 1];
      const resultText = lastLog?.result || "";
      const isHit = resultText.includes("¡IMPACTO");
      const rollTotal = faces[0] + faces[1];
      const parts = label.split(":");
      const targetHex = parts[2] || "";

      let icon = "";
      let title = "";
      let desc = "";
      const boxClass = isHit ? "hit" : "miss";
      let floatingText = "";
      let floatingType: "hit" | "miss" | "grenade-hit" = isHit ? "hit" : "miss";

      if (label.startsWith("order-fire:")) {
        if (isHit) {
          icon = "🎯💥";
          title = "¡IMPACTO DE FUSILERÍA!";
          desc = `¡Disparo certero! La fuerza enemiga en el hexágono ${targetHex} ha sido neutralizada y eliminada del combate.`;
          floatingText = `🎯💥 ¡IMPACTO! Enemigo en ${targetHex} eliminado`;
          floatingType = "hit";
        } else {
          icon = "💨❌";
          title = "DISPARO FALLADO";
          desc = `El fuego de fusilería no causó bajas al enemigo en ${targetHex}.`;
          floatingText = `💨❌ Disparo fallado (Tirada: ${rollTotal})`;
          floatingType = "miss";
        }
      } else {
        // order-grenade
        if (isHit) {
          icon = "💣💥";
          title = "¡IMPACTO DE GRANADA!";
          desc = `¡Detonación exitosa! La fuerza defensora en ${targetHex} ha sido destruida por la explosión.`;
          floatingText = `💣💥 ¡GRANADA! Enemigo en ${targetHex} eliminado`;
          floatingType = "grenade-hit";
        } else {
          icon = "💣💨";
          title = "GRANADA DESVIADA";
          desc = `La granada detonó fuera de la posición enemiga en ${targetHex} (se requería 6+).`;
          floatingText = `💣💨 Granada desviada (Tirada: ${rollTotal} vs 6+)`;
          floatingType = "miss";
        }
      }

      btnConfirmRoll.classList.add("hidden");
      btnCancelRoll.classList.add("hidden");
      manualDiceInputs.classList.add("hidden");
      activationSelectionPanel.classList.add("hidden");

      combatResultPanel.innerHTML = `
        <div class="combat-result-box ${boxClass}">
          <div class="combat-result-icon">${icon}</div>
          <div class="combat-result-title">${title}</div>
          <div class="combat-result-dice">🎲 Tirada obtenida: ${faces[0]} + ${faces[1]} = ${rollTotal}</div>
          <div class="combat-result-desc">${desc}</div>
        </div>
      `;
      combatResultPanel.classList.remove("hidden");

      btnCombatContinue.classList.remove("hidden");
      btnCombatContinue.focus();

      btnCombatContinue.onclick = () => {
        diceModal.close();
        combatResultPanel.classList.add("hidden");
        btnCombatContinue.classList.add("hidden");
        showCombatFloatingEffect(floatingText, floatingType);
        renderAll();
      };
    } else {
      setTimeout(() => {
        diceModal.close();
        renderAll();
      }, 250);
    }
  } else {
    alert("La tirada no fue aceptada por las reglas del juego.");
    diceModal.close();
    pendingDiceRequest = null;
  }
}

btnConfirmRoll.addEventListener("click", handleRollDice);

btnCancelRoll.addEventListener("click", () => {
  pendingDiceRequest = null;
  diceModal.close();
});

diceModal.addEventListener("close", () => {
  combatResultPanel.classList.add("hidden");
  btnCombatContinue.classList.add("hidden");
  btnConfirmRoll.classList.remove("hidden");
  btnCancelRoll.classList.remove("hidden");
  renderAll();
});

// Reiniciar partida
btnRestartGame.addEventListener("click", () => {
  gameOverModal.close();
  initGame();
});

// Tutorial modal
btnOpenTutorial.addEventListener("click", () => {
  tutorialModal.showModal();
});

btnCloseTutorial.addEventListener("click", () => {
  tutorialModal.close();
});

btnGermanPhaseOk.addEventListener("click", () => {
  germanPhaseModal.close();
  if (pendingGermanPhaseEffect) {
    showCombatFloatingEffect(pendingGermanPhaseEffect.text, pendingGermanPhaseEffect.type);
    pendingGermanPhaseEffect = null;
  }
});

// --- Arranque inicial ---

window.addEventListener("resize", () => {
  if (currentViewState) {
    currentViewState = viewState({
      ...currentViewState,
      viewport: {
        width: Math.max(window.innerWidth || 800, 320),
        height: Math.max(window.innerHeight || 600, 400),
      },
    });
    renderMap();
  }
});

if (checkAuth()) {
  lockScreen.classList.add("hidden");
  appContainer.classList.remove("hidden");
  initGame();
} else {
  lockScreen.classList.remove("hidden");
  appContainer.classList.add("hidden");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        reg.update();
      })
      .catch(() => {
        // Registro opcional en desarrollo
      });
  });
}
