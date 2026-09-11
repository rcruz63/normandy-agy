# Estado y trabajo pendiente

Qué está hecho, qué falta y en qué orden continuar. Actualiza este documento
cuando cambie lo pendiente.

## Índice

- [Resultado de la validación](#resultado-de-la-validacion)
- [Qué está completo](#que-esta-completo)
- [Qué falta](#que-falta)
- [Orden recomendado](#orden-recomendado)
- [Tareas de la spec sin marcar](#tareas-de-la-spec-sin-marcar)

## Resultado de la validación

Comprobado el 11 de septiembre de 2026:

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (dominio + infraestructura) | Pasa |
| `npm run lint` | Pasa, sin avisos |
| `npm test` (Vitest: unit + property + integration) | 80 archivos, 751 pruebas, todas verdes |
| `npm run build` (tsc → `dist/`) | Pasa |
| Pruebas E2E (Playwright) y de conformidad | No escritas (tareas opcionales) |
| Despliegue en AWS | No desplegado; el stack no existe |

## Qué está completo

El núcleo del producto, verificado con pruebas:

- Dominio puro: motor de reglas, precedencia canónica, aleatoriedad versionada,
  invariantes.
- Reglas de juego: turno y órdenes, moral, combate, terreno, revelado, minas,
  artillería, semioruga, preparación y desenlace de misión.
- Catálogo canónico `FON-ML-2022` y Publication Gate fail-closed.
- Persistencia IndexedDB transaccional, aislamiento entre partidas, cuarentena.
- Copia de seguridad (exportar/importar) y migraciones con rollback.
- Contrato de tiradas en dos fases (automático/manual) y coordinador.
- Coordinador del paquete sin conexión (stage/activate/rollback).
- Control de acceso (HTTP Basic en CloudFront Function) y bloqueo local.
- Infraestructura como código (CDK) declarativa, con `typecheck` verde.

## Qué falta

### 1. Empaquetado web de la PWA (bloqueante para jugar y desplegar)

No existe todavía el arranque web que ensamble la UI en un sitio servible:

- Un `index.html` de entrada.
- Un bundler (Vite, esbuild o similar) y un script `build:web` / `dev`.
- El manifiesto PWA (`manifest.webmanifest`) e iconos propios.
- El registro del service worker (`src/service-worker/` ya existe; falta
  registrarlo desde el arranque).
- El cableado de arranque que instancie `GameSession` y monte las vistas de
  `src/ui/` en el DOM.

Sin esto no se puede abrir el juego en un navegador ni generar el artefacto que
`HostingStack` publica en S3.

### 2. Arranque de CDK (bloqueante para desplegar)

`cdk synth`/`cdk deploy` no funcionan tal cual (ver [`despliegue.md`](despliegue.md)):

- `cdk.json` ejecuta los `.ts` con `--experimental-strip-types`, pero los
  imports usan extensión `.js`; Node no los resuelve. Compilar la infra a JS,
  usar un loader TS, o ajustar la resolución de módulos.
- El CLI `aws-cdk` no está instalado (solo `aws-cdk-lib`). Añadirlo.
- Falta `cdk bootstrap` en la cuenta/región la primera vez.

### 3. Integración del artefacto web en el despliegue

`HostingStack` sirve `index.html` y publica recursos versionados, pero no hay un
paso que suba el sitio construido al bucket. Cuando exista el empaquetado web
(punto 1), conectar su salida con la publicación de la infraestructura.

### 4. Pruebas E2E y de conformidad (opcionales según el plan)

`tests/e2e/` y `tests/conformance/` están vacíos. Corresponden a tareas
opcionales del plan (Playwright de PWA/offline/accesibilidad, matriz de
conformidad, contract tests tacto=ratón). No bloquean, pero son recomendables
antes de considerar la versión candidata.

## Orden recomendado

1. **Empaquetado web** (punto 1). Es lo que convierte el núcleo en algo jugable.
2. **Arranque de CDK** (punto 2), en paralelo si se quiere avanzar el despliegue.
3. **Integración web ↔ despliegue** (punto 3).
4. **Primer despliegue** a la cuenta personal (perfil `casa`) por el pipeline.
5. **Pruebas E2E y conformidad** (punto 4) y segunda revisión visual de mapas.

## Tareas de la spec sin marcar

En `.kiro/specs/fields-of-normandy-pwa/tasks.md`:

- **17.1** — Incompatibilidad de versiones y diagnóstico exportable: sigue sin
  marcar como completada. Revisar si está implementada (hay
  `tests/integration/incompatible-recovery.test.ts` y
  `src/application/games/recovery-*`) y, si es así, marcarla; si no, completarla.
- Sub-tareas marcadas con `*` (pruebas de propiedad, unitarias y E2E): varias
  quedan pendientes por ser opcionales. Las de propiedad ya escritas están
  verdes.
