import { defineConfig } from "vitest/config";

// Vitest cubre pruebas unitarias, de propiedad (fast-check) e integración.
// Las pruebas e2e/PWA y accesibilidad (Playwright + axe-core) se ejecutan aparte.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/property/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/conformance/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
    },
  },
});
