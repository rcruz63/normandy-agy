/**
 * Transcripción canónica y preparación verificada de la Misión 03:
 * «Control del edificio» (Secure the Building).
 *
 * Fuente: FON-ML-2022, páginas 20 (reglas de misión) y 21 (mapa).
 */
import { missionId } from "../../domain/identity/index.js";
import type { HexMapDefinition } from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";
import { build10HexMap } from "./mission-helper.js";

export const MISSION_03_ID = missionId("FON-ML-2022-M03");

export const MISSION_03_MAP: HexMapDefinition = build10HexMap({
  missionId: MISSION_03_ID,
  missionNumber: 3,
  mapPage: 21,
  terrainMap: {
    1: ["bosque"],
    2: ["bosque"],
    3: ["colina", "bosque"],
    4: ["edificio"],
    5: ["bosque"],
    6: ["despejado"],
    7: ["colina"],
    8: ["bosque"],
    9: ["despejado"],
    10: ["despejado"],
  },
  entryHexIndices: [10],
});

export const MISSION_03_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M03-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M03-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-C",
      definitionId: "rifle-squad-C",
      hexId: "M03-H10",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M03-H04",
    },
    {
      unknownId: "DE-UNK-2",
      hexId: "M03-H05",
    },
    {
      unknownId: "DE-UNK-3",
      hexId: "M03-H06",
    },
  ]),
});
