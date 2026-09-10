/**
 * Proyección del selector de Misiones de la Interfaz (Tarea 20.5, requisitos
 * 3.1, 32.2, 32.12).
 *
 * El selector jugable presenta ÚNICAMENTE las Misiones `published` que el
 * {@link PublicationReport} (Publication Gate, Tarea 2.3) declara publicables, y
 * cada una con su NOMBRE PROPIO en `es-ES` como único contenido de juego. El
 * título inglés se conserva solo como metadato de mantenimiento y NUNCA se
 * incluye en la proyección visible (requisito 32.12).
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Transforma datos ya producidos por el
 * catálogo y el Gate; no decide qué es publicable ni contiene lógica de juego.
 * Importa solo tipos e identidades del catálogo/dominio y no toca DOM,
 * IndexedDB, red ni reloj.
 */
import type { MissionId } from "../../domain/identity/index.js";
import type { MissionIdentity } from "../../catalog/FON-ML-2022/missions.js";

/**
 * Vista de una Misión ofrecida por el selector (contenido de juego `es-ES`).
 * Contiene exclusivamente el nombre propio, el objetivo y la duración base en
 * español; el título inglés queda deliberadamente FUERA (requisito 32.12).
 */
export type MissionSelectorOption = Readonly<{
  id: MissionId;
  number: number;
  /** Nombre visible propio en es-ES (32.2). */
  name: string;
  /** Objetivo de victoria en es-ES (32.11). */
  objective: string;
  /** Turnos base de la Misión (32.4). */
  baseTurns: number;
}>;

/** Reporte de publicación mínimo consumido por el selector. */
export type PublishableMissions = Readonly<{
  publishableMissionIds: readonly MissionId[];
}>;

/** Compara dos {@link MissionId} por su valor de cadena subyacente. */
function sameMissionId(a: MissionId, b: MissionId): boolean {
  return (a as unknown as string) === (b as unknown as string);
}

/**
 * Proyecta las opciones del selector a partir del catálogo de identidades de
 * Misión y del conjunto de Misiones publicables del Gate.
 *
 * Reglas (requisitos 3.1, 32.2, 32.12):
 * - Solo se incluyen las Misiones cuyo `id` aparece en `publishableMissionIds`.
 * - Cada opción usa el nombre propio `es-ES`; el título inglés se excluye.
 * - El orden se conserva por número de Misión (orden del catálogo).
 *
 * Función pura: no muta sus argumentos y devuelve una lista congelada.
 */
export function projectMissionSelector(
  missions: readonly MissionIdentity[],
  report: PublishableMissions,
): readonly MissionSelectorOption[] {
  const options = missions
    .filter((mission) =>
      report.publishableMissionIds.some((published) =>
        sameMissionId(published, mission.id),
      ),
    )
    .map((mission) =>
      Object.freeze({
        id: mission.id,
        number: mission.number,
        name: mission.visibleNameEs,
        objective: mission.objectiveEs,
        baseTurns: mission.baseTurns,
      }),
    );
  return Object.freeze(options);
}
