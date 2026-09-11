import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Configuración de Vite para el «shell» web de la PWA (Tarea del shell de
 * aplicación).
 *
 * Vite solo EMPAQUETA el arranque: toma el `index.html` y el punto de entrada de
 * `src/web/` y produce un sitio estático servible. No contiene lógica de juego;
 * el shell únicamente compone las piezas ya existentes (dominio puro,
 * aplicación, adaptadores de navegador y vistas de `ui/`).
 *
 * Decisiones:
 * - `root` es `src/web`: aísla el sitio del resto del código y evita que Vite
 *   arrastre pruebas o infraestructura.
 * - `base: "./"`: rutas relativas para servir el sitio desde cualquier prefijo
 *   de CloudFront/S3 sin reescrituras.
 * - `outDir` apunta a `dist-web/` en la raíz del repositorio (separado de
 *   `dist/`, que produce `tsc`). Está en `.gitignore`.
 * - `publicDir` en `src/web/public`: manifiesto, iconos y el service worker
 *   registrable se copian tal cual a la raíz del sitio.
 */
const root = fileURLToPath(new URL("./src/web", import.meta.url));
const outDir = fileURLToPath(new URL("./dist-web", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  publicDir: fileURLToPath(new URL("./src/web/public", import.meta.url)),
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
