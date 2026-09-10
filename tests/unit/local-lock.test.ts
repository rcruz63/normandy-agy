import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  LOCAL_VERIFIER_ALGORITHM_V1,
  attemptUnlock,
  createLocalVerifierMaterial,
  evaluateStartupLock,
  localVerifierAlgorithmVersion,
  projectLockView,
  verifyLocalCredential,
  type LocalCredential,
} from "../../src/domain/access/index.js";

const SALT = "0123456789abcdef-local";

function credential(username: string, key: string): LocalCredential {
  return { username, key };
}

describe("Verificador local (dominio, requisitos 26.10-26.12)", () => {
  it("verifica correctamente la misma credencial y rechaza otras", () => {
    const material = createLocalVerifierMaterial(
      SALT,
      credential("owner", "clave-de-alta-entropia-123"),
    );
    expect(
      verifyLocalCredential(material, credential("owner", "clave-de-alta-entropia-123")),
    ).toBe(true);
    expect(
      verifyLocalCredential(material, credential("owner", "clave-incorrecta")),
    ).toBe(false);
    expect(
      verifyLocalCredential(material, credential("otro", "clave-de-alta-entropia-123")),
    ).toBe(false);
  });

  it("no persiste la clave ni una representación recuperable (26.12)", () => {
    const key = "clave-secreta-de-alta-entropia";
    const material = createLocalVerifierMaterial(SALT, credential("owner", key));
    const serialized = JSON.stringify(material);
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain("owner:");
    // El digest es de tamaño fijo (256 bits => 64 hex) independientemente de la
    // longitud de la credencial: no reversible.
    expect(material.digest).toHaveLength(64);
    expect(material.algorithmVersion).toBe(LOCAL_VERIFIER_ALGORITHM_V1);
  });

  it("rechaza versiones de algoritmo no soportadas", () => {
    expect(() =>
      createLocalVerifierMaterial(
        SALT,
        credential("owner", "clave"),
        localVerifierAlgorithmVersion("desconocida-v9"),
      ),
    ).toThrow();
  });

  it("propiedad: solo la credencial exacta verifica", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (user, key, otherUser, otherKey) => {
          fc.pre(user !== otherUser || key !== otherKey);
          // El validador exige usuario no vacío tras recortar y clave no vacía.
          fc.pre(user.trim().length > 0 && otherUser.trim().length > 0);
          fc.pre(key.length > 0 && otherKey.length > 0);
          fc.pre(!user.includes("\u0000") && !key.includes("\u0000"));
          const material = createLocalVerifierMaterial(SALT, credential(user, key));
          expect(verifyLocalCredential(material, credential(user, key))).toBe(true);
          expect(
            verifyLocalCredential(material, credential(otherUser, otherKey)),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Máquina del Bloqueo local (requisito 26.11)", () => {
  const material = createLocalVerifierMaterial(SALT, credential("owner", "clave123456"));

  it("sin material inicializado el estado es 'uninitialized'", () => {
    expect(evaluateStartupLock({ online: false, material: undefined })).toBe(
      "uninitialized",
    );
    expect(evaluateStartupLock({ online: true, material: undefined })).toBe(
      "uninitialized",
    );
  });

  it("con material y sin conexión se bloquea ocultando contenido (26.11)", () => {
    const status = evaluateStartupLock({ online: false, material });
    expect(status).toBe("locked");
    const view = projectLockView(status);
    expect(view.contentVisible).toBe(false);
    expect(view.promptForCredential).toBe(true);
  });

  it("con material y con conexión permanece desbloqueado", () => {
    const status = evaluateStartupLock({ online: true, material });
    expect(status).toBe("unlocked");
    expect(projectLockView(status).contentVisible).toBe(true);
  });

  it("solo la credencial correcta desbloquea", () => {
    expect(attemptUnlock(material, credential("owner", "clave123456"))).toEqual({
      status: "unlocked",
      unlocked: true,
    });
    expect(attemptUnlock(material, credential("owner", "otra"))).toEqual({
      status: "locked",
      unlocked: false,
    });
  });
});
