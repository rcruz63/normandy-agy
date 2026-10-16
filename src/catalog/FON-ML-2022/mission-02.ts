/**
 * Transcripción canónica y preparación verificada de la Misión 02:
 * «Control del bosque II» (Secure the Woods (2)).
 *
 * Fuente: FON-ML-2022, páginas 18 (reglas de misión) y 19 (mapa).
 */
import { missionId } from "../../domain/identity/index.js";
import type { HexMapDefinition } from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";
import { build10HexMap } from "./mission-helper.js";

export const MISSION_02_ID = missionId("FON-ML-2022-M02");

export const MISSION_02_MAP: HexMapDefinition = build10HexMap({
  missionId: MISSION_02_ID,
  missionNumber: 2,
  mapPage: 19,
  terrainMap: {
    1: ["bosque"],
    2: ["bosque"],
    3: ["bosque"],
    4: ["despejado"],
    5: ["bosque"],
    6: ["despejado"],
    7: ["despejado"],
    8: ["bosque"],
    9: ["bosque"],
    10: ["despejado"],
  },
  entryHexIndices: [10],
});

export const MISSION_02_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M02-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M02-H10",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M02-H01",
    },
    {
      unknownId: "DE-UNK-2",
      hexId: "M02-H05",
    },
  ]),
});
