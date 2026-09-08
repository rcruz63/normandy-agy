/**
 * Configuración ESLint centrada en las fronteras arquitectónicas del diseño.
 * El dominio (`src/domain`) no puede importar DOM, IndexedDB, red, reloj,
 * `Math.random` ni SDK de AWS, ni depender de capas externas (adapters, ui,
 * application, service-worker, infrastructure).
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  env: {
    es2022: true,
  },
  ignorePatterns: ["dist/", "node_modules/", "coverage/", "cdk.out/", "*.cjs"],
  overrides: [
    {
      // Frontera del dominio: prohíbe importaciones fuera de dominio,
      // el SDK de AWS y APIs de plataforma (DOM/IndexedDB/Node).
      files: ["src/domain/**/*.ts"],
      excludedFiles: ["src/domain/**/*.test.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "aws-cdk-lib",
                  "aws-cdk-lib/*",
                  "@aws-sdk/*",
                  "aws-sdk",
                  "fake-indexeddb",
                  "fake-indexeddb/*",
                  "**/adapters/*",
                  "**/application/*",
                  "**/ui/*",
                  "**/service-worker/*",
                  "**/infrastructure/*",
                ],
                message:
                  "El dominio no puede importar DOM/IndexedDB/AWS ni capas externas (adapters, application, ui, service-worker, infrastructure).",
              },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          { name: "window", message: "El dominio no accede al DOM." },
          { name: "document", message: "El dominio no accede al DOM." },
          { name: "indexedDB", message: "El dominio no accede a IndexedDB." },
          { name: "caches", message: "El dominio no accede a la Cache API." },
          { name: "fetch", message: "El dominio no realiza peticiones de red." },
          { name: "Date", message: "El dominio no lee el reloj." },
        ],
        "no-restricted-properties": [
          "error",
          {
            object: "Math",
            property: "random",
            message:
              "El dominio usa VersionedRandom; nunca Math.random (requisito 19).",
          },
        ],
      },
    },
  ],
};
