import { describe, expect, it } from "vitest";
import {
  gameId,
  rulesVersion,
  saveVersion,
} from "../../src/domain/identity/index.js";
import {
  CURRENT_ENVELOPE_VERSION,
  INTEGRITY_ALGORITHM,
  EnvelopeValidationError,
  canonicalize,
  computeIntegrity,
  openEnvelope,
  sealEnvelope,
  type CompatibilityPolicy,
  type EnvelopeCompatibility,
} from "../../src/domain/persistence/index.js";

const compatibility: EnvelopeCompatibility = {
  saveVersion: saveVersion("sv-1"),
  rulesVersion: rulesVersion("rv-1"),
  algorithmVersion: "rav-1",
};

const policy: CompatibilityPolicy = {
  supportedEnvelopeVersions: [CURRENT_ENVELOPE_VERSION],
  supportedSaveVersions: [saveVersion("sv-1")],
  supportedRulesVersions: [rulesVersion("rv-1")],
  supportedAlgorithmVersions: ["rav-1"],
};

type Payload = Readonly<{ a: number; b: string }>;

describe("versioned-envelope — canonicalización e integridad", () => {
  it("canonicaliza objetos con claves ordenadas de forma estable", () => {
    const left = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const right = canonicalize({ c: { x: 2, y: 1 }, a: 2, b: 1 });
    expect(left).toBe(right);
  });

  it("calcula una suma de integridad con el algoritmo declarado", () => {
    const integrity = computeIntegrity({ a: 1, b: "x" });
    expect(integrity.algorithm).toBe(INTEGRITY_ALGORITHM);
    expect(integrity.value).toMatch(/^[0-9a-f]{8}$/u);
  });

  it("produce sumas distintas para payloads distintos", () => {
    const first = computeIntegrity({ a: 1 }).value;
    const second = computeIntegrity({ a: 2 }).value;
    expect(first).not.toBe(second);
  });
});

describe("versioned-envelope — sellado y apertura", () => {
  it("hace round-trip de un payload sellado y abierto", () => {
    const envelope = sealEnvelope<Payload>({
      compatibility,
      gameId: gameId("g-1"),
      payload: { a: 7, b: "siete" },
    });
    expect(envelope.envelopeVersion).toBe(CURRENT_ENVELOPE_VERSION);
    const payload = openEnvelope<Payload>(envelope, policy, { expectedGameId: gameId("g-1") });
    expect(payload).toEqual({ a: 7, b: "siete" });
  });

  it("permite sellar sobres globales sin gameId (metadatos)", () => {
    const envelope = sealEnvelope({ compatibility, payload: { generationId: "gen-1" } });
    expect(envelope.gameId).toBeUndefined();
    expect(openEnvelope(envelope, policy)).toEqual({ generationId: "gen-1" });
  });

  it("rechaza una versión de sobre no soportada", () => {
    const envelope = sealEnvelope({ compatibility, payload: { a: 1 } });
    expect(() => openEnvelope(envelope, { ...policy, supportedEnvelopeVersions: [2] })).toThrow(
      EnvelopeValidationError,
    );
  });

  it("rechaza un gameId interno que no coincide con el esperado", () => {
    const envelope = sealEnvelope({ compatibility, gameId: gameId("g-1"), payload: { a: 1 } });
    expect(() =>
      openEnvelope(envelope, policy, { expectedGameId: gameId("g-2") }),
    ).toThrow(/game-id-mismatch/u);
  });

  it("rechaza un sobre con integridad alterada", () => {
    const envelope = sealEnvelope({ compatibility, payload: { a: 1 } });
    const tampered = { ...envelope, payload: { a: 2 } };
    expect(() => openEnvelope(tampered, policy)).toThrow(/integrity-mismatch/u);
  });

  it("rechaza un candidato con forma de sobre inválida", () => {
    expect(() => openEnvelope(null, policy)).toThrow(/malformed-envelope/u);
    expect(() => openEnvelope({ envelopeVersion: "x" }, policy)).toThrow(/malformed-envelope/u);
  });
});
