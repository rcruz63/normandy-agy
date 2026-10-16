/**
 * Transcripción canónica y preparación verificada de la Misión 04:
 * «Control de la colina» (Secure the Hill).
 *
 * Fuente: FON-ML-2022, páginas 22 (reglas de misión) y 23 (mapa).
 */
import { missionId } from "../../domain/identity/index.js";
import type { HexMapDefinition } from "../../domain/geometry/index.js";
import type { SetupDefinition } from "../schemas/placeholders.js";
import { build10HexMap } from "./mission-helper.js";

export const MISSION_04_ID = missionId("FON-ML-2022-M04");

export const MISSION_04_MAP: HexMapDefinition = build10HexMap({
  missionId: MISSION_04_ID,
  missionNumber: 4,
  mapPage: 23,
  terrainMap: {
    1: ["bosque"],
    2: ["edificio"],
    3: ["colina", "bosque"],
    4: ["edificio"],
    5: ["bosque"],
    6: ["despejado"],
    7: ["colina"],
    8: ["edificio"],
    9: ["despejado"],
    10: ["despejado"],
  },
  entryHexIndices: [10],
});

export const MISSION_04_SETUP: SetupDefinition = Object.freeze({
  britishStart: Object.freeze([
    {
      pieceId: "GB-A",
      definitionId: "rifle-squad-A",
      hexId: "M04-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-B",
      definitionId: "rifle-squad-B",
      hexId: "M04-H10",
      orientation: "N",
    },
    {
      pieceId: "GB-C",
      definitionId: "rifle-squad-C",
      hexId: "M04-H10",
      orientation: "N",
    },
  ]),
  fixedGermanStart: Object.freeze([]),
  unknowns: Object.freeze([
    {
      unknownId: "DE-UNK-1",
      hexId: "M04-H01",
    },
    {
      unknownId: "DE-UNK-2",
      hexId: "M04-H03",
    },
    {
      unknownId: "DE-UNK-3",
      hexId: "M04-H04",
    },
  ]),
});
