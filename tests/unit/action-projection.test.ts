import { describe, expect, it } from "vitest";
import type { ActionDescriptor } from "../../src/domain/engine/rules-engine.js";
import {
  projectAction,
  projectActions,
} from "../../src/ui/views/action-projection.js";
import type { MessageCatalog } from "../../src/ui/locale/messages-es-ES.js";

const CATALOG: MessageCatalog = Object.freeze({
  "action.advance": "Avanzar",
  "action.fire": "Fuego contra {target}",
});

describe("projectAction (3.1, 20.9)", () => {
  it("resuelve la etiqueta es-ES conservando el commandType", () => {
    const action: ActionDescriptor = Object.freeze({
      commandType: "advance",
      labelKey: "action.advance",
    });
    const option = projectAction(action, CATALOG);
    expect(option.commandType).toBe("advance");
    expect(option.label).toBe("Avanzar");
  });

  it("interpola los parámetros del descriptor", () => {
    const action: ActionDescriptor = Object.freeze({
      commandType: "fire",
      labelKey: "action.fire",
      params: Object.freeze({ target: "Escuadra alemana" }),
    });
    expect(projectAction(action, CATALOG).label).toBe(
      "Fuego contra Escuadra alemana",
    );
  });

  it("proyecta una lista conservando el orden del Motor", () => {
    const actions: readonly ActionDescriptor[] = [
      { commandType: "advance", labelKey: "action.advance" },
      { commandType: "fire", labelKey: "action.fire", params: { target: "x" } },
    ];
    const options = projectActions(actions, CATALOG);
    expect(options.map((o) => o.commandType)).toStrictEqual(["advance", "fire"]);
    expect(Object.isFrozen(options)).toBe(true);
  });
});
