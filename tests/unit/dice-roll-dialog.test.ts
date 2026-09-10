import { describe, expect, it } from "vitest";
import {
  diceRollRequest,
  type DiceOutcomeProjection,
  type DiceRollRequest,
  type DiceRollResolution,
} from "../../src/domain/engine/dice-roll.js";
import type {
  CatalogId,
  GameId,
  SnapshotId,
} from "../../src/domain/identity/index.js";
import type { RandomState } from "../../src/domain/random/index.js";
import {
  applyResolution,
  canSubmit,
  closeDialog,
  DEFAULT_DICE_ROLL_PREFERENCE,
  openDialog,
  projectDialog,
  rememberPreference,
  selectSource,
  setManualFace,
  submit,
} from "../../src/ui/components/dice-roll-dialog.js";

/** Construye una solicitud de Tirada válida con `count` dados de `sides` caras. */
function makeRequest(count: number, sides: number): DiceRollRequest {
  return diceRollRequest({
    id: "roll-1" as unknown as DiceRollRequest["id"],
    gameId: "game-1" as unknown as GameId,
    expectedSnapshotId: "snap-1" as unknown as SnapshotId,
    context: { label: "Activación" },
    domain: { kind: "dice", count, sides },
    diceOrder: Object.freeze(Array.from({ length: count }, (_, i) => i)),
    outcomeMetadata: {
      kind: "table",
      tableId: "tabla-activacion" as unknown as CatalogId,
      sourceRefs: [],
    },
  });
}

/** Resolución de conveniencia con caras efectivas dadas. */
function makeResolution(
  request: DiceRollRequest,
  faces: readonly number[],
  source: "automatic" | "manual",
): DiceRollResolution {
  return {
    requestId: request.id,
    gameId: request.gameId,
    expectedSnapshotId: request.expectedSnapshotId,
    context: request.context,
    source,
    effectiveFaces: Object.freeze([...faces]),
    nextRandomState: "next" as unknown as RandomState,
    consumption: {} as DiceRollResolution["consumption"],
  };
}

const TABLE_OUTCOME: DiceOutcomeProjection = {
  kind: "table",
  tableId: "tabla-activacion" as unknown as CatalogId,
  rows: [
    { rowId: "1-6", cells: { rango: "1-6", efecto: "activa" } },
    { rowId: "7-12", cells: { rango: "7-12", efecto: "bloquea" } },
  ],
  appliedRowId: "7-12",
  effect: { messageKey: "log.result.hit" },
  sourceRefs: [],
};

describe("DiceRollDialog máquina de estado (Tarea 20.4, req. 41)", () => {
  it("abre con la última preferencia local como selección inicial (41.6, 41.7)", () => {
    const request = makeRequest(2, 6);
    const state = openDialog(request, rememberPreference("manual"));
    expect(state.kind).toBe("pending-entry");
    if (state.kind === "pending-entry") {
      expect(state.selectedSource).toBe("manual");
      expect(state.manualFaces).toHaveLength(2);
    }
  });

  it("representa cantidad variable de dados sin asumir 2d6 (41.5, 41.32)", () => {
    const request = makeRequest(3, 8);
    const view = projectDialog(openDialog(request));
    expect(view.kind).toBe("entry");
    if (view.kind === "entry") {
      expect(view.dice).toHaveLength(3);
      expect(view.dice.map((d) => d.position)).toStrictEqual([1, 2, 3]);
      expect(view.dice.every((d) => d.sides === 8)).toBe(true);
    }
  });

  it("Automático puede confirmar sin caras y produce input automatic (41.8)", () => {
    const request = makeRequest(2, 6);
    const state = openDialog(request, rememberPreference("automatic"));
    expect(canSubmit(state)).toBe(true);
    const result = submit(state);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.input).toStrictEqual({ source: "automatic" });
      expect(result.state.kind).toBe("resolving");
    }
  });

  it("Manual no confirma hasta recoger una cara válida por dado (41.9, 41.10)", () => {
    const request = makeRequest(2, 6);
    let state = openDialog(request, rememberPreference("manual"));
    expect(canSubmit(state)).toBe(false);
    state = setManualFace(state, 0, 4);
    expect(canSubmit(state)).toBe(false); // falta el segundo dado
    state = setManualFace(state, 1, 9); // fuera de rango
    expect(canSubmit(state)).toBe(false);
    state = setManualFace(state, 1, 3);
    expect(canSubmit(state)).toBe(true);
    const result = submit(state);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.input).toStrictEqual({ source: "manual", faces: [4, 3] });
    }
  });

  it("cambiar de Modo conserva las caras ya introducidas", () => {
    const request = makeRequest(2, 6);
    let state = setManualFace(openDialog(request, rememberPreference("manual")), 0, 5);
    state = selectSource(state, "automatic");
    state = selectSource(state, "manual");
    if (state.kind === "pending-entry") {
      expect(state.manualFaces[0]).toBe(5);
    }
  });

  it("cerrar ANTES de resolver cancela la solicitud sin commit (41.21)", () => {
    const request = makeRequest(2, 6);
    const outcome = closeDialog(openDialog(request));
    expect(outcome.action).toBe("cancel");
    if (outcome.action === "cancel") {
      expect(outcome.requestId).toBe(request.id);
      expect(outcome.state.kind).toBe("hidden");
    }
  });

  it("cerrar DESPUÉS de resolver solo oculta el diálogo (41.22)", () => {
    const request = makeRequest(2, 6);
    const state = applyResolution(
      submit(openDialog(request)).state,
      makeResolution(request, [3, 4], "automatic"),
      TABLE_OUTCOME,
    );
    expect(state.kind).toBe("resolved");
    const outcome = closeDialog(state);
    expect(outcome.action).toBe("dismiss");
    expect(outcome.state.kind).toBe("hidden");
  });

  it("proyecta caras y efecto con anuncio accesible (41.16, 41.28)", () => {
    const request = makeRequest(2, 6);
    const state = applyResolution(
      submit(openDialog(request)).state,
      makeResolution(request, [3, 4], "automatic"),
      TABLE_OUTCOME,
    );
    const view = projectDialog(state);
    expect(view.kind).toBe("resolved");
    if (view.kind === "resolved") {
      expect(view.outcome.faces).toStrictEqual([3, 4]);
      expect(view.outcome.detail.kind).toBe("table");
      if (view.outcome.detail.kind === "table") {
        const appliedRow = view.outcome.detail.rows.find((r) => r.applied);
        expect(appliedRow?.rowId).toBe("7-12");
      }
      expect(view.outcome.announcement).toContain("impacto");
    }
  });

  it("una resolución de otra solicitud no cambia el estado (41.23)", () => {
    const request = makeRequest(2, 6);
    const resolving = submit(openDialog(request)).state;
    const foreign = makeResolution(request, [1, 1], "automatic");
    const mismatched = {
      ...foreign,
      requestId: "otra" as unknown as DiceRollRequest["id"],
    } as DiceRollResolution;
    const state = applyResolution(resolving, mismatched, TABLE_OUTCOME);
    expect(state.kind).toBe("resolving");
  });

  it("la preferencia por defecto es Automático", () => {
    expect(DEFAULT_DICE_ROLL_PREFERENCE.lastSource).toBe("automatic");
  });
});
