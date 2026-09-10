import { describe, expect, it } from "vitest";
import {
  ACCESS_VERIFIER_ALGORITHM_V1,
  AccessVerifierRenderer,
  constantTimeEquals,
  deriveAccessDigest,
} from "../../infrastructure/access/index.js";

const SALT = "0123456789abcdef-access-salt";
const USERNAME = "owner";
const KEY = "clave-de-alta-entropia-Xyz-2024";

/**
 * Evalúa el código de la CloudFront Function generado en un sandbox que aporta
 * `String.bytesFrom` (API del runtime 2.0 no presente en Node) y devuelve el
 * `handler`. Solo para pruebas; valida el comportamiento lógico de la función.
 */
function loadHandler(code: string): (event: unknown) => {
  statusCode?: number;
  headers?: Record<string, { value: string }>;
} {
  const bytesFrom = (input: string, encoding: string): { toString: (enc: string) => string } => {
    const buffer = Buffer.from(input, encoding as BufferEncoding);
    return { toString: (enc: string) => buffer.toString(enc as BufferEncoding) };
  };
  const factory = new Function(
    "String",
    "Math",
    `${code}\nreturn handler;`,
  ) as (
    stringLike: unknown,
    mathLike: unknown,
  ) => (event: unknown) => { statusCode?: number; headers?: Record<string, { value: string }> };
  const stringLike = Object.assign(function () {}, { bytesFrom });
  return factory(stringLike, Math);
}

function basicHeader(username: string, key: string): string {
  return `Basic ${Buffer.from(`${username}:${key}`, "utf-8").toString("base64")}`;
}

function requestEvent(authValue?: string): unknown {
  const headers: Record<string, { value: string }> = {};
  if (authValue !== undefined) {
    headers["authorization"] = { value: authValue };
  }
  return { request: { headers, uri: "/index.html" } };
}

describe("AccessVerifierRenderer (Tarea 23.1, requisitos 26.1-26.9)", () => {
  const renderer = new AccessVerifierRenderer(SALT);

  it("deriva material versionado y no recuperable, sin la clave", () => {
    const { material, code, algorithmVersion } = renderer.render({
      username: USERNAME,
      key: KEY,
    });
    expect(algorithmVersion).toBe(ACCESS_VERIFIER_ALGORITHM_V1);
    expect(material.digest).toHaveLength(64);
    // El material y el código NUNCA contienen usuario, clave ni "Authorization"
    // en claro (requisitos 26.6, 26.7).
    const serialized = JSON.stringify(material) + code;
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain(`${USERNAME}:${KEY}`);
  });

  it("el código no emite logs ni base64 de la credencial", () => {
    const { code } = renderer.render({ username: USERNAME, key: KEY });
    expect(code).not.toContain("console");
    const credentialB64 = Buffer.from(`${USERNAME}:${KEY}`, "utf-8").toString("base64");
    expect(code).not.toContain(credentialB64);
  });

  it("la derivación del código coincide con la del despliegue (equivalencia)", () => {
    const digestNode = deriveAccessDigest(
      ACCESS_VERIFIER_ALGORITHM_V1,
      SALT,
      `${USERNAME}:${KEY}`,
    );
    const { material } = renderer.render({ username: USERNAME, key: KEY });
    expect(material.digest).toBe(digestNode);
  });

  it("entrega el recurso y elimina Authorization con credencial válida (26.4)", () => {
    const { code } = renderer.render({ username: USERNAME, key: KEY });
    const handler = loadHandler(code);
    const event = requestEvent(basicHeader(USERNAME, KEY)) as {
      request: { headers: Record<string, unknown> };
    };
    const result = handler(event) as { request?: { headers: Record<string, unknown> } };
    // Éxito: devuelve la request (no un 401) y sin la cabecera sensible.
    expect((result as { statusCode?: number }).statusCode).toBeUndefined();
    expect(event.request.headers["authorization"]).toBeUndefined();
  });

  it("devuelve 401 sin origen ante credencial ausente (26.4)", () => {
    const { code } = renderer.render({ username: USERNAME, key: KEY });
    const handler = loadHandler(code);
    const result = handler(requestEvent(undefined));
    expect(result.statusCode).toBe(401);
    expect(result.headers?.["www-authenticate"]?.value).toContain("Basic realm=");
    expect(result.headers?.["cache-control"]?.value).toBe("no-store");
  });

  it("devuelve 401 ante credencial incorrecta", () => {
    const { code } = renderer.render({ username: USERNAME, key: KEY });
    const handler = loadHandler(code);
    expect(handler(requestEvent(basicHeader(USERNAME, "clave-mala"))).statusCode).toBe(
      401,
    );
    expect(handler(requestEvent(basicHeader("intruso", KEY))).statusCode).toBe(401);
    expect(handler(requestEvent("Bearer token")).statusCode).toBe(401);
  });
});

describe("constantTimeEquals", () => {
  it("compara igualdad de contenido y longitud", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "ab")).toBe(false);
  });
});
