/**
 * Transcripción canónica y preparación verificada de la Misión 06:
 * «Control de la zona II» (Secure the Area (2)).
 *
 * Fuente: FON-ML-2022, páginas 26 (reglas de misión) y 27 (mapa).
 */
import { missionId } from "../../domain/identity/index.js";
import type { HexMapDefinition } from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";
import { build10HexMap } from "./mission-helper.js";

export const MISSION_06_ID = missionId("FON-ML-2022-M06");

export const MISSION_06_MAP: HexMapDefinition = build10HexMap({
  missionId: MISSION_06_ID,
  missionNumber: 6,
  mapPage: 27,
  terrainMap: {
    1: ["colina", "bosque"],
    2: ["edificio"],
    3: ["colina", "bosque"],
    4: ["bosque"],
    5: ["bosque"],
    6: ["edificio"],
    7: ["colina"],
    8: ["despejado"],
    9: ["bosque"],
    10: ["despejado"],
  },
  entryHexIndices: [8, 10],
});

export const MISSION_06_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M06-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M06-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-C",
      definitionId: "rifle-squad-C",
      hexId: "M06-H08",
      orientation: "N",
    },
    {
      pieceId: "GB-MG",
      definitionId: "mg-team",
      hexId: "M06-H08",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M06-H02",
    },
    {
      unknownId: "DE-UNK-2",
      hexId: "M06-H03",
    },
    {
      unknownId: "DE-UNK-3",
      hexId: "M06-H04",
    },
    {
      unknownId: "DE-UNK-4",
      hexId: "M06-H06",
    },
  ]),
});
