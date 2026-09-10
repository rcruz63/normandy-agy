import { describe, expect, it } from "vitest";
import {
  MISSIONS,
  type MissionIdentity,
} from "../../src/catalog/FON-ML-2022/missions.js";
import { projectMissionSelector } from "../../src/ui/views/mission-selector.js";

describe("projectMissionSelector (3.1, 32.2, 32.12)", () => {
  it("solo incluye las Misiones publicables del Gate", () => {
    const publishable = [MISSIONS[0]!.id, MISSIONS[2]!.id];
    const options = projectMissionSelector(MISSIONS, {
      publishableMissionIds: publishable,
    });
    expect(options.map((o) => o.number)).toStrictEqual([
      MISSIONS[0]!.number,
      MISSIONS[2]!.number,
    ]);
  });

  it("devuelve una lista vacía cuando ninguna Misión es publicable", () => {
    const options = projectMissionSelector(MISSIONS, {
      publishableMissionIds: [],
    });
    expect(options).toHaveLength(0);
  });

  it("usa el nombre propio en es-ES como contenido de juego", () => {
    const options = projectMissionSelector(MISSIONS, {
      publishableMissionIds: [MISSIONS[0]!.id],
    });
    expect(options[0]?.name).toBe(MISSIONS[0]!.visibleNameEs);
  });

  it("excluye el título inglés de la proyección visible (32.12)", () => {
    const options = projectMissionSelector(MISSIONS, {
      publishableMissionIds: MISSIONS.map((m) => m.id),
    });
    const serialized = JSON.stringify(options);
    for (const mission of MISSIONS) {
      expect(serialized).not.toContain(
        mission.maintenanceMetadata.originalTitle,
      );
    }
  });

  it("conserva el orden por número de Misión del catálogo", () => {
    const shuffled: readonly MissionIdentity[] = [...MISSIONS].reverse();
    const options = projectMissionSelector(shuffled, {
      publishableMissionIds: MISSIONS.map((m) => m.id),
    });
    // El orden de salida sigue el orden de la lista de entrada (catálogo dado).
    expect(options.map((o) => o.number)).toStrictEqual(
      shuffled.map((m) => m.number),
    );
  });

  it("no muta la entrada y devuelve una lista congelada", () => {
    const options = projectMissionSelector(MISSIONS, {
      publishableMissionIds: [MISSIONS[0]!.id],
    });
    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options[0])).toBe(true);
  });
});
