/**
 * Transcripción canónica y preparación verificada de la Misión 05:
 * «Control de la zona I» (Secure the Area (1)).
 *
 * Fuente: FON-ML-2022, páginas 24 (reglas de misión) y 25 (mapa).
 */
import { missionId } from "../../domain/identity/index.js";
import type { HexMapDefinition } from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";
import { build10HexMap } from "./mission-helper.js";

export const MISSION_05_ID = missionId("FON-ML-2022-M05");

export const MISSION_05_MAP: HexMapDefinition = build10HexMap({
  missionId: MISSION_05_ID,
  missionNumber: 5,
  mapPage: 25,
  terrainMap: {
    1: ["bosque"],
    2: ["bosque"],
    3: ["colina", "bosque"],
    4: ["edificio"],
    5: ["bosque"],
    6: ["despejado"],
    7: ["colina"],
    8: ["edificio"],
    9: ["bosque"],
    10: ["despejado"],
  },
  entryHexIndices: [10],
});

export const MISSION_05_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M05-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M05-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-MG",
      definitionId: "mg-team",
      hexId: "M05-H10",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M05-H03",
    },
    {
      unknownId: "DE-UNK-2",
      hexId: "M05-H04",
    },
    {
      unknownId: "DE-UNK-3",
      hexId: "M05-H05",
    },
    {
      unknownId: "DE-UNK-4",
      hexId: "M05-H06",
    },
  ]),
});
