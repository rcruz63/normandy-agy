import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  InvalidIdentifierError,
  catalogId,
  decisionRef,
  gameId,
  isGameId,
  missionId,
  packageVersion,
  randomAlgorithmVersion,
  rulesVersion,
  saveVersion,
  snapshotId,
} from "../../src/domain/identity/index.js";

const constructors = [
  catalogId,
  missionId,
  gameId,
  snapshotId,
  rulesVersion,
  decisionRef,
  saveVersion,
  packageVersion,
  randomAlgorithmVersion,
] as const;

describe("constructores de identificadores opacos", () => {
  it("conservan el valor original de una cadena no vacía", () => {
    for (const make of constructors) {
      expect(make("abc-123")).toBe("abc-123");
    }
  });

  it("rechazan cadenas vacías o solo con espacios", () => {
    for (const make of constructors) {
      expect(() => make("")).toThrow(InvalidIdentifierError);
      expect(() => make("   ")).toThrow(InvalidIdentifierError);
    }
  });

  it("un GameId construido es reconocido por su guardia de tipo", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (raw) => {
          const id = gameId(raw);
          expect(id).toBe(raw);
          expect(isGameId(id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cualquier cadena en blanco es rechazada por el constructor", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\s*$/), (blank) => {
        expect(() => gameId(blank)).toThrow(InvalidIdentifierError);
      }),
      { numRuns: 100 },
    );
  });
});
