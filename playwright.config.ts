import { defineConfig, devices } from "@playwright/test";

// Playwright cubre PWA, offline, actualización y accesibilidad (axe-core).
// Incluye un perfil de iPad estándar y navegadores de escritorio.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], locale: "es-ES" },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"], locale: "es-ES" },
    },
    {
      name: "ipad",
      use: { ...devices["iPad (gen 7)"], locale: "es-ES" },
    },
  ],
});
