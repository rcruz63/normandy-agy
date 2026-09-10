import { describe, expect, it } from "vitest";
import {
  areIntentsEquivalent,
  checkAlternativeCoverage,
  createInputAdapters,
  HIDDEN_INTERACTION_KINDS,
  interactionIntent,
  IntentTranslator,
  InvalidInteractionIntentError,
  visibleAlternativeControl,
  type ActionDescriptor,
  type CommandContext,
  type GestureDescriptor,
} from "../../src/adapters/browser/inputs/index.js";
import { gameId, snapshotId } from "../../src/domain/identity/index.js";
import { hexId, pieceId } from "../../src/domain/geometry/identifiers.js";

const CONTEXT: CommandContext = {
  gameId: gameId("game-1"),
  expectedSnapshotId: snapshotId("snap-1"),
};

const REVERSIBLE: ActionDescriptor = {
  commandType: "select-hex",
  irreversible: false,
};

const IRREVERSIBLE: ActionDescriptor = {
  commandType: "resolve-combat",
  irreversible: true,
};

describe("interactionIntent — normalización y validación (24.1, 24.2)", () => {
  it("omite campos opcionales ausentes en lugar de dejarlos undefined", () => {
    const intent = interactionIntent({ semanticAction: "select", source: "touch" });
    expect(Object.prototype.hasOwnProperty.call(intent, "subjectId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(intent, "targetId")).toBe(false);
  });

  it("rechaza acción semántica desconocida", () => {
    expect(() =>
      // @ts-expect-error valor inválido intencionado
      interactionIntent({ semanticAction: "teleport", source: "touch" }),
    ).toThrow(InvalidInteractionIntentError);
  });

  it("rechaza modalidad de origen desconocida", () => {
    expect(() =>
      // @ts-expect-error valor inválido intencionado
      interactionIntent({ semanticAction: "select", source: "brainwave" }),
    ).toThrow(InvalidInteractionIntentError);
  });
});

describe("adaptadores de entrada — intención idéntica por dispositivo (24.1, 24.2, 24.11)", () => {
  const adapters = createInputAdapters();
  const gesture: GestureDescriptor = {
    semanticAction: "select",
    subjectId: hexId("h-5"),
  };

  it("tacto, ratón, teclado y asistencia difieren solo en source", () => {
    const touch = adapters.touch.toIntent(gesture);
    const mouse = adapters.mouse.toIntent(gesture);
    const keyboard = adapters.keyboard.toIntent(gesture);
    const assistive = adapters.assistive.toIntent(gesture);

    expect(touch.source).toBe("touch");
    expect(mouse.source).toBe("mouse");
    expect(keyboard.source).toBe("keyboard");
    expect(assistive.source).toBe("assistive");

    // Equivalentes salvo source: misma acción semántica y mismos identificadores.
    expect(areIntentsEquivalent(touch, mouse)).toBe(true);
    expect(areIntentsEquivalent(mouse, keyboard)).toBe(true);
    expect(areIntentsEquivalent(keyboard, assistive)).toBe(true);
  });
});

describe("IntentTranslator — elimina source antes del comando (24.11)", () => {
  it("produce el mismo comando por tacto y por ratón desde el mismo estado", () => {
    const adapters = createInputAdapters();
    const gesture: GestureDescriptor = {
      semanticAction: "activate",
      subjectId: hexId("h-3"),
    };
    const translatorTouch = new IntentTranslator();
    const translatorMouse = new IntentTranslator();

    const touch = translatorTouch.translate(
      adapters.touch.toIntent(gesture),
      REVERSIBLE,
      CONTEXT,
    );
    const mouse = translatorMouse.translate(
      adapters.mouse.toIntent(gesture),
      REVERSIBLE,
      CONTEXT,
    );

    expect(touch.kind).toBe("command");
    expect(mouse.kind).toBe("command");
    if (touch.kind === "command" && mouse.kind === "command") {
      expect(touch.command).toEqual(mouse.command);
    }
  });

  it("nunca copia source al payload del comando", () => {
    const translator = new IntentTranslator();
    const intent = interactionIntent({
      semanticAction: "activate",
      source: "mouse",
      subjectId: hexId("h-9"),
    });
    const result = translator.translate(intent, REVERSIBLE, CONTEXT);
    expect(result.kind).toBe("command");
    if (result.kind === "command") {
      expect(JSON.stringify(result.command)).not.toContain("mouse");
      expect(result.command.payload).not.toHaveProperty("source");
    }
  });
});

describe("IntentTranslator — Acción irreversible selected→confirmed (24.5, 24.12)", () => {
  it("select sobre acción irreversible no emite comando; queda a la espera", () => {
    const translator = new IntentTranslator();
    const intent = interactionIntent({
      semanticAction: "select",
      source: "touch",
      subjectId: pieceId("p-1"),
    });
    const result = translator.translate(intent, IRREVERSIBLE, CONTEXT);
    expect(result.kind).toBe("awaiting-confirmation");
    expect(translator.hasPendingConfirmation()).toBe(true);
  });

  it("confirm sobre el mismo sujeto emite exactamente el comando irreversible", () => {
    const translator = new IntentTranslator();
    translator.translate(
      interactionIntent({ semanticAction: "select", source: "touch", subjectId: pieceId("p-1") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    const confirm = translator.translate(
      interactionIntent({ semanticAction: "confirm", source: "touch", subjectId: pieceId("p-1") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    expect(confirm.kind).toBe("command");
    if (confirm.kind === "command") {
      expect(confirm.command.type).toBe("resolve-combat");
      expect(confirm.command.payload["subjectId"]).toBe("p-1");
    }
    expect(translator.hasPendingConfirmation()).toBe(false);
  });

  it("cancel descarta la pendiente sin emitir comando (conserva estado, 24.12)", () => {
    const translator = new IntentTranslator();
    translator.translate(
      interactionIntent({ semanticAction: "select", source: "mouse", subjectId: pieceId("p-2") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    const cancel = translator.translate(
      interactionIntent({ semanticAction: "cancel", source: "mouse" }),
      IRREVERSIBLE,
      CONTEXT,
    );
    expect(cancel.kind).toBe("cleared");
    expect(translator.hasPendingConfirmation()).toBe(false);
  });

  it("confirm sobre sujeto distinto no emite comando y descarta la pendiente", () => {
    const translator = new IntentTranslator();
    translator.translate(
      interactionIntent({ semanticAction: "select", source: "touch", subjectId: pieceId("p-1") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    const confirm = translator.translate(
      interactionIntent({ semanticAction: "confirm", source: "touch", subjectId: pieceId("p-99") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    expect(confirm.kind).toBe("cleared");
    expect(translator.hasPendingConfirmation()).toBe(false);
  });

  it("confirm sin selección previa no emite comando", () => {
    const translator = new IntentTranslator();
    const confirm = translator.translate(
      interactionIntent({ semanticAction: "confirm", source: "keyboard", subjectId: pieceId("p-1") }),
      IRREVERSIBLE,
      CONTEXT,
    );
    expect(confirm.kind).toBe("cleared");
  });

  it("inspect no emite comando (solo afecta a la vista, 24.10)", () => {
    const translator = new IntentTranslator();
    const result = translator.translate(
      interactionIntent({ semanticAction: "inspect", source: "mouse", subjectId: pieceId("p-1") }),
      REVERSIBLE,
      CONTEXT,
    );
    expect(result.kind).toBe("ignored");
  });
});

describe("alternativas visibles a interacciones ocultas (24.3)", () => {
  it("cobertura insatisfecha cuando falta alguna interacción oculta", () => {
    const result = checkAlternativeCoverage([
      visibleAlternativeControl({
        replaces: "hover",
        controlId: "btn-inspect",
        labelKey: "ui.control.inspect",
        semanticAction: "inspect",
      }),
    ]);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain("gesture");
    expect(result.missing).toContain("secondary-click");
    expect(result.missing).toContain("wheel");
    expect(result.missing).toContain("drag");
  });

  it("cobertura satisfecha con un control por cada interacción oculta", () => {
    const controls = HIDDEN_INTERACTION_KINDS.map((kind) =>
      visibleAlternativeControl({
        replaces: kind,
        controlId: `btn-${kind}`,
        labelKey: `ui.control.${kind}`,
        semanticAction: "activate",
      }),
    );
    const result = checkAlternativeCoverage(controls);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});
