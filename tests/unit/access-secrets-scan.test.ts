import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ACCESS_VERIFIER_ALGORITHM_V1,
  ACCESS_VERIFIER_ITERATIONS_V1,
  AccessVerifierRenderer,
} from "../../infrastructure/access/index.js";

/**
 * Tarea 23.3 — Pruebas de acceso y ausencia de secretos (requisitos 26.4, 26.6,
 * 26.7).
 *
 * Complementa a `access-verifier-renderer.test.ts` (que valida el
 * comportamiento lógico de la función) con dos garantías adicionales:
 *
 * 1. refuerzo de 26.4: un rechazo (401) NUNCA devuelve la request/uri, es
 *    decir, no accede al origen bajo ningún camino de fallo (ausente, clave
 *    incorrecta, usuario incorrecto, cabecera malformada);
 * 2. ESCANEO DE ARTEFACTOS (26.6, 26.7): renderiza la función con una
 *    credencial de prueba de alta entropía y verifica que ni la clave, ni el par
 *    `usuario:clave`, ni su codificación base64, ni la cabecera `Authorization`
 *    aparecen en el árbol de fuentes que se empaqueta y se sube (la PWA, el
 *    Paquete sin conexión y los artefactos destinados a Amazon S3). También
 *    confirma que el código generado incrusta SOLO material verificador
 *    versionado no recuperable y no emite la credencial en logs.
 */

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO_ROOT = resolve(HERE, "..", "..");

const SALT = "0123456789abcdef-scan-salt-material";
// Credencial de prueba de alta entropía. NO es una credencial real: se genera
// aquí para el escaneo y jamás se persiste en el repositorio.
const TEST_USERNAME = "owner-scan-8f3a1c";
const TEST_KEY = "Zq7-Wm2!kP9x_Rt4vB6nL0eH5sD8gA1c-alta-entropia";

/**
 * Directorios que forman parte del artefacto entregable (lo que se empaqueta y
 * se sube a S3 / se sirve a la PWA / entra en el Paquete sin conexión). Solo se
 * escanean los que existan realmente.
 */
const SHIPPABLE_DIRS = ["src", "dist"] as const;

/** Extensiones de archivo de texto que tiene sentido inspeccionar. */
const SCANNABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".map",
  ".txt",
  ".md",
];

/** Rutas que nunca se escanean (dependencias, control de versiones, pruebas). */
const EXCLUDED_SEGMENTS = new Set(["node_modules", ".git", "coverage"]);

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasScannableExtension(name: string): boolean {
  return SCANNABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Recorre recursivamente un directorio con Node `fs`/`path` y devuelve las rutas
 * de los archivos de texto escaneables, excluyendo dependencias, control de
 * versiones y los propios archivos de prueba (`*.test.ts`).
 */
function collectShippableFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.js")) {
        continue;
      }
      if (hasScannableExtension(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  walk(root);
  return files;
}

function loadHandler(code: string): (event: unknown) => {
  statusCode?: number;
  uri?: string;
  request?: unknown;
  headers?: Record<string, { value: string }>;
} {
  const bytesFrom = (
    input: string,
    encoding: string,
  ): { toString: (enc: string) => string } => {
    const buffer = Buffer.from(input, encoding as BufferEncoding);
    return { toString: (enc: string) => buffer.toString(enc as BufferEncoding) };
  };
  const factory = new Function("String", "Math", `${code}\nreturn handler;`) as (
    stringLike: unknown,
    mathLike: unknown,
  ) => (event: unknown) => {
    statusCode?: number;
    uri?: string;
    request?: unknown;
    headers?: Record<string, { value: string }>;
  };
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

const renderer = new AccessVerifierRenderer(SALT);

describe("Acceso: rechazo sin origen (Tarea 23.3, requisito 26.4)", () => {
  const { code } = renderer.render({ username: TEST_USERNAME, key: TEST_KEY });

  it("entrega el recurso solo con la credencial exacta y elimina Authorization", () => {
    const handler = loadHandler(code);
    const event = requestEvent(basicHeader(TEST_USERNAME, TEST_KEY)) as {
      request: { headers: Record<string, unknown>; uri: string };
    };
    const result = handler(event);
    // Éxito: NO es un 401 y devuelve la request para continuar al origen.
    expect(result.statusCode).toBeUndefined();
    expect((result as { uri?: string }).uri).toBe("/index.html");
    expect(event.request.headers["authorization"]).toBeUndefined();
  });

  it("ningún camino de fallo devuelve la request/uri (sin acceso al origen)", () => {
    const handler = loadHandler(code);
    const rejections: ReadonlyArray<readonly [string, string | undefined]> = [
      ["ausente", undefined],
      ["clave incorrecta", basicHeader(TEST_USERNAME, "clave-erronea")],
      ["usuario incorrecto", basicHeader("intruso", TEST_KEY)],
      ["esquema no Basic", "Bearer token-cualquiera"],
      ["base64 malformado", "Basic @@no-base64@@"],
      ["sin separador ':'", `Basic ${Buffer.from("sindospuntos", "utf-8").toString("base64")}`],
    ];
    for (const [etiqueta, authValue] of rejections) {
      const result = handler(requestEvent(authValue));
      expect(result.statusCode, etiqueta).toBe(401);
      // Un 401 NUNCA transporta la request ni la uri: no hay origen.
      expect((result as { request?: unknown }).request, etiqueta).toBeUndefined();
      expect((result as { uri?: string }).uri, etiqueta).toBeUndefined();
      expect(result.headers?.["www-authenticate"]?.value, etiqueta).toContain(
        "Basic realm=",
      );
      expect(result.headers?.["cache-control"]?.value, etiqueta).toBe("no-store");
    }
  });
});

describe("Acceso: material versionado no recuperable (Tarea 23.3, requisitos 26.6, 26.7)", () => {
  it("el código generado incrusta solo sal, iteraciones, versión y digest", () => {
    const { code, material, algorithmVersion } = renderer.render({
      username: TEST_USERNAME,
      key: TEST_KEY,
    });
    expect(algorithmVersion).toBe(ACCESS_VERIFIER_ALGORITHM_V1);
    expect(material.iterations).toBe(ACCESS_VERIFIER_ITERATIONS_V1);
    expect(material.digest).toHaveLength(64);
    expect(material.digest).toMatch(/^[0-9a-f]{64}$/);
    // El material verificador incrustado son SOLO campos públicos no recuperables.
    expect(Object.keys(material).sort()).toEqual(
      ["algorithmVersion", "digest", "iterations", "salt"].sort(),
    );
    // El código incrusta el digest y la sal, pero jamás la credencial.
    expect(code).toContain(material.digest);
    expect(code).toContain(material.salt);
  });

  it("ni el código ni el material contienen la credencial ni su base64, ni emiten logs", () => {
    const { code, material } = renderer.render({
      username: TEST_USERNAME,
      key: TEST_KEY,
    });
    const pair = `${TEST_USERNAME}:${TEST_KEY}`;
    const pairB64 = Buffer.from(pair, "utf-8").toString("base64");
    const keyB64 = Buffer.from(TEST_KEY, "utf-8").toString("base64");
    const serialized = JSON.stringify(material) + code;
    expect(serialized).not.toContain(TEST_KEY);
    expect(serialized).not.toContain(pair);
    expect(serialized).not.toContain(pairB64);
    expect(serialized).not.toContain(keyB64);
    // Sin emisión de logs de credenciales en el runtime.
    expect(code).not.toContain("console");
  });
});

describe("Escaneo de artefactos entregables (Tarea 23.3, requisitos 26.6, 26.7)", () => {
  // Renderiza para asegurar que aunque se ejecute el renderer no queda ningún
  // artefacto con la credencial; el escaneo es estático sobre el repositorio.
  renderer.render({ username: TEST_USERNAME, key: TEST_KEY });

  const pair = `${TEST_USERNAME}:${TEST_KEY}`;
  const pairB64 = Buffer.from(pair, "utf-8").toString("base64");
  const keyB64 = Buffer.from(TEST_KEY, "utf-8").toString("base64");

  const existingDirs = SHIPPABLE_DIRS.map((dir) => resolve(REPO_ROOT, dir)).filter(
    directoryExists,
  );

  it("existe al menos un árbol de fuentes entregable que inspeccionar", () => {
    expect(existingDirs.length).toBeGreaterThan(0);
  });

  const scannedFiles = existingDirs.flatMap((dir) => collectShippableFiles(dir));

  it("recopila archivos de texto sin incluir dependencias ni pruebas", () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(scannedFiles.some((file) => file.includes("node_modules"))).toBe(false);
    expect(scannedFiles.some((file) => file.endsWith(".test.ts"))).toBe(false);
  });

  it("ningún artefacto entregable contiene la clave ni el par usuario:clave", () => {
    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const content = readFileSync(file, "utf-8");
      if (
        content.includes(TEST_KEY) ||
        content.includes(pair) ||
        content.includes(pairB64) ||
        content.includes(keyB64)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ningún artefacto entregable incrusta un valor de cabecera Authorization Basic", () => {
    // Detecta credenciales HTTP Basic embebidas: `Authorization: Basic <b64>`
    // o `authorization` con un valor base64 de credencial. La ausencia de la
    // cabecera con material de credencial confirma 26.6/26.7.
    const basicHeaderPattern = /authorization["'\s:]+basic\s+[a-z0-9+/=]{8,}/i;
    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const content = readFileSync(file, "utf-8");
      if (basicHeaderPattern.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
