/**
 * Registro y configuración unificada de las Misiones jugables de FON-ML-2022.
 */
import type { MissionId } from "../../domain/identity/index.js";
import type { HexMapDefinition, PieceState } from "../../domain/geometry/index.js";
import type { MissionObjective } from "../../domain/rules/mission-setup.js";
import type { SetupDefinition } from "../schemas/placeholders.js";

import { MISSION_01_ID, MISSION_01_MAP, MISSION_01_SETUP } from "./mission-01.js";
import { MISSION_02_ID, MISSION_02_MAP, MISSION_02_SETUP } from "./mission-02.js";
import { MISSION_03_ID, MISSION_03_MAP, MISSION_03_SETUP } from "./mission-03.js";
import { MISSION_04_ID, MISSION_04_MAP, MISSION_04_SETUP } from "./mission-04.js";
import { MISSION_05_ID, MISSION_05_MAP, MISSION_05_SETUP } from "./mission-05.js";
import { MISSION_06_ID, MISSION_06_MAP, MISSION_06_SETUP } from "./mission-06.js";
import { MISSIONS_BY_NUMBER } from "./missions.js";

export interface MissionConfig {
  id: MissionId;
  missionKey: string;
  number: number;
  name: string;
  originalTitle: string;
  baseTurns: number;
  objectiveText: string;
  objective: MissionObjective;
  map: HexMapDefinition;
  setup: SetupDefinition;
  initialPieces: Record<string, PieceState>;
  initialUnknowns: Record<string, { hidden: boolean }>;
  briefing: string;
}

function makeRifleSquad(id: "GB-A" | "GB-B" | "GB-C", hexId: string): PieceState {
  const defId = id === "GB-A" ? "rifle-squad-A" : id === "GB-B" ? "rifle-squad-B" : "rifle-squad-C";
  return {
    id: id as any,
    pieceId: id,
    definitionId: defId as any,
    side: "british",
    hexId: hexId as any,
    orientation: "N" as any,
    morale: "normal",
    cover: 0,
    visibility: "revealed",
    status: "active",
  } as any;
}

function makeMgTeam(id: "GB-MG", hexId: string): PieceState {
  return {
    id: id as any,
    pieceId: id,
    definitionId: "mg-team" as any,
    side: "british",
    hexId: hexId as any,
    orientation: "N" as any,
    morale: "normal",
    cover: 0,
    visibility: "revealed",
    status: "active",
  } as any;
}

function makeUnknown(id: string, hexId: string): PieceState {
  return {
    id: id as any,
    pieceId: id,
    definitionId: "unknown" as any,
    side: "german",
    hexId: hexId as any,
    cover: 0,
    visibility: "hidden",
    status: "active",
  } as any;
}

export const MISSION_CONFIGS: readonly MissionConfig[] = Object.freeze([
  // Misión 1
  {
    id: MISSION_01_ID,
    missionKey: "M01",
    number: 1,
    name: MISSIONS_BY_NUMBER.get(1)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(1)!.maintenanceMetadata.originalTitle,
    baseTurns: 4,
    objectiveText: MISSIONS_BY_NUMBER.get(1)!.objectiveEs,
    objective: { kind: "eliminate-single-revealed-german" },
    map: MISSION_01_MAP,
    setup: MISSION_01_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M01-H10"),
      "GB-B": makeRifleSquad("GB-B", "M01-H10"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M01-H04"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
    },
    briefing:
      "Misión introductoria: Las Escuadras A y B deben avanzar hacia el norte para descubrir y neutralizar a la fuerza enemiga oculta en el bosque.",
  },

  // Misión 2
  {
    id: MISSION_02_ID,
    missionKey: "M02",
    number: 2,
    name: MISSIONS_BY_NUMBER.get(2)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(2)!.maintenanceMetadata.originalTitle,
    baseTurns: 5,
    objectiveText: MISSIONS_BY_NUMBER.get(2)!.objectiveEs,
    objective: { kind: "eliminate-all-germans" },
    map: MISSION_02_MAP,
    setup: MISSION_02_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M02-H10"),
      "GB-B": makeRifleSquad("GB-B", "M02-H10"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M02-H01"),
      "DE-UNK-2": makeUnknown("DE-UNK-2", "M02-H05"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
      "DE-UNK-2": { hidden: true },
    },
    briefing:
      "Dos posiciones alemanas ocultas en el bosque (H01 y H05). Ambas deben ser reveladas y eliminadas antes de concluir el 5º turno.",
  },

  // Misión 3
  {
    id: MISSION_03_ID,
    missionKey: "M03",
    number: 3,
    name: MISSIONS_BY_NUMBER.get(3)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(3)!.maintenanceMetadata.originalTitle,
    baseTurns: 6,
    objectiveText: MISSIONS_BY_NUMBER.get(3)!.objectiveEs,
    objective: { kind: "eliminate-all-germans" },
    map: MISSION_03_MAP,
    setup: MISSION_03_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M03-H10"),
      "GB-B": makeRifleSquad("GB-B", "M03-H10"),
      "GB-C": makeRifleSquad("GB-C", "M03-H10"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M03-H04"),
      "DE-UNK-2": makeUnknown("DE-UNK-2", "M03-H05"),
      "DE-UNK-3": makeUnknown("DE-UNK-3", "M03-H06"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
      "DE-UNK-2": { hidden: true },
      "DE-UNK-3": { hidden: true },
    },
    briefing:
      "La fuerza enemiga ocupa un edificio clave (H04, defensa +2), con apoyos en el bosque y flanco. Dispones de tres escuadras de fusileros (A, B y C).",
  },

  // Misión 4
  {
    id: MISSION_04_ID,
    missionKey: "M04",
    number: 4,
    name: MISSIONS_BY_NUMBER.get(4)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(4)!.maintenanceMetadata.originalTitle,
    baseTurns: 6,
    objectiveText: MISSIONS_BY_NUMBER.get(4)!.objectiveEs,
    objective: { kind: "eliminate-all-germans" },
    map: MISSION_04_MAP,
    setup: MISSION_04_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M04-H10"),
      "GB-B": makeRifleSquad("GB-B", "M04-H10"),
      "GB-C": makeRifleSquad("GB-C", "M04-H10"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M04-H01"),
      "DE-UNK-2": makeUnknown("DE-UNK-2", "M04-H03"),
      "DE-UNK-3": makeUnknown("DE-UNK-3", "M04-H04"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
      "DE-UNK-2": { hidden: true },
      "DE-UNK-3": { hidden: true },
    },
    briefing:
      "Los alemanes dominan la colina boscosa (H03) y edificios adyacentes. Usa las coberturas y coordina el avance de las escuadras A, B y C.",
  },

  // Misión 5
  {
    id: MISSION_05_ID,
    missionKey: "M05",
    number: 5,
    name: MISSIONS_BY_NUMBER.get(5)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(5)!.maintenanceMetadata.originalTitle,
    baseTurns: 6,
    objectiveText: MISSIONS_BY_NUMBER.get(5)!.objectiveEs,
    objective: { kind: "eliminate-all-germans" },
    map: MISSION_05_MAP,
    setup: MISSION_05_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M05-H10"),
      "GB-B": makeRifleSquad("GB-B", "M05-H10"),
      "GB-MG": makeMgTeam("GB-MG", "M05-H10"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M05-H03"),
      "DE-UNK-2": makeUnknown("DE-UNK-2", "M05-H04"),
      "DE-UNK-3": makeUnknown("DE-UNK-3", "M05-H05"),
      "DE-UNK-4": makeUnknown("DE-UNK-4", "M05-H06"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
      "DE-UNK-2": { hidden: true },
      "DE-UNK-3": { hidden: true },
      "DE-UNK-4": { hidden: true },
    },
    briefing:
      "Despliegue del Equipo de Ametralladora (GB-MG, fuego 6+). Cuatro incógnitas enemigas atrincheradas en edificios, bosque y colina.",
  },

  // Misión 6
  {
    id: MISSION_06_ID,
    missionKey: "M06",
    number: 6,
    name: MISSIONS_BY_NUMBER.get(6)!.visibleNameEs,
    originalTitle: MISSIONS_BY_NUMBER.get(6)!.maintenanceMetadata.originalTitle,
    baseTurns: 6,
    objectiveText: MISSIONS_BY_NUMBER.get(6)!.objectiveEs,
    objective: { kind: "eliminate-all-germans" },
    map: MISSION_06_MAP,
    setup: MISSION_06_SETUP,
    initialPieces: {
      "GB-A": makeRifleSquad("GB-A", "M06-H10"),
      "GB-B": makeRifleSquad("GB-B", "M06-H10"),
      "GB-C": makeRifleSquad("GB-C", "M06-H08"),
      "GB-MG": makeMgTeam("GB-MG", "M06-H08"),
      "DE-UNK-1": makeUnknown("DE-UNK-1", "M06-H02"),
      "DE-UNK-2": makeUnknown("DE-UNK-2", "M06-H03"),
      "DE-UNK-3": makeUnknown("DE-UNK-3", "M06-H04"),
      "DE-UNK-4": makeUnknown("DE-UNK-4", "M06-H06"),
    },
    initialUnknowns: {
      "DE-UNK-1": { hidden: true },
      "DE-UNK-2": { hidden: true },
      "DE-UNK-3": { hidden: true },
      "DE-UNK-4": { hidden: true },
    },
    briefing:
      "Asalto en pinza desde dos accesos (Sur H10 y Suroeste H08). Cuatro escuadras británicas (A, B, C y MG) deben neutralizar las 4 posiciones enemigas.",
  },
]);

export function getMissionConfigByNumber(n: number): MissionConfig | undefined {
  return MISSION_CONFIGS.find((m) => m.number === n);
}

export function getMissionConfigById(id: MissionId): MissionConfig | undefined {
  return MISSION_CONFIGS.find((m) => (m.id as unknown as string) === (id as unknown as string));
}
