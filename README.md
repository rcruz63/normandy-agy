# Fields of Normandy PWA

Aplicación web progresiva (PWA) de uso personal para jugar en solitario, en
español de España, las quince misiones verificadas de la edición de Mike Lambo
de 2022 «The Fields of Normandy: A Solitaire Wargame» (`FON-ML-2022`).

> **Aviso legal y de alcance.** Este repositorio **no distribuye** prosa,
> ilustraciones, mapas ni contadores del libro. El PDF fuente y sus renders son
> material protegido y están excluidos del control de versiones (ver
> `.gitignore`). Los hechos, mecánicas y valores verificados se representan como
> datos canónicos trazables a `FON-ML-2022`; los textos y recursos visuales
> distribuidos son propios o disponen de licencia documentada.

## Qué es

Un juego de guerra en solitario, jugable en el navegador y sin conexión una vez
instalado. Controlas fuerzas británicas contra unidades alemanas ocultas sobre
un mapa hexagonal. Cada misión tiene su preparación, duración y objetivo. Toda
tirada de dados y todo cálculo de reglas queda registrado y es auditable.

- **Un solo jugador**, contra un enemigo que se revela con tablas y dados.
- **Quince misiones** independientes (`M01`–`M15`), sin campaña ni progresión.
- **Determinista y auditable**: misma semilla y mismos comandos, mismo resultado.
- **Local y privada**: cada partida vive en tu dispositivo; el traslado entre
  dispositivos es manual (exportar/importar).

Para aprender a jugar, ver [`docs/usuario.md`](docs/usuario.md).

## Qué hace (funcionalmente)

- Motor de reglas puro y determinista que resuelve turnos, órdenes, moral,
  combate, cobertura, terreno, revelado, minas y artillería según `FON-ML-2022`.
- Tiradas de dados en dos fases con modo Automático o Manual (introduces las
  caras de tus dados físicos y el motor reserva el mismo paso aleatorio).
- Persistencia local transaccional en IndexedDB, con varias partidas aisladas.
- Exportación, importación y migración de partidas con verificación de integridad.
- Paquete sin conexión con activación segura y rollback.
- Interfaz accesible en `es-ES`, con equivalencia entre tacto, ratón y teclado.
- Infraestructura como código (AWS CDK): S3 privado con OAC, CloudFront con
  HTTP Basic y bloqueo de producción por coste cero verificado.

## Estado

El **núcleo está completo y verde**: dominio, motor de reglas, catálogo canónico,
persistencia, copia/migración, coordinación de tiradas, control de acceso e
infraestructura declarativa. La verificación automática pasa en su totalidad
(ver «Verificación»).

Falta el **último kilómetro** para poder jugar en un navegador y desplegar:

- No hay todavía empaquetado web (HTML de arranque, bundle, manifiesto PWA y
  registro del service worker) que ensamble la UI en un sitio servible.
- El proyecto **no está desplegado** en AWS; no existe el stack en la cuenta.
- La ejecución de CDK (`cdk synth`/`deploy`) necesita ajustes de arranque
  (ver [`docs/despliegue.md`](docs/despliegue.md)).

Detalle de lo pendiente y cómo abordarlo en
[`docs/estado.md`](docs/estado.md).

## Stack técnico

- **TypeScript** estricto, dominio puro sin dependencias de navegador ni AWS.
- **Vitest + fast-check** para pruebas unitarias y basadas en propiedades.
- **Playwright + axe-core** para PWA, offline y accesibilidad (pruebas E2E aún
  no escritas; son tareas opcionales del plan).
- **AWS CDK (TypeScript)** para la infraestructura.

## Estructura del repositorio

```
src/            Código de la PWA (dominio puro + aplicación + adaptadores + UI)
  domain/       Motor de reglas, aleatoriedad, invariantes, persistencia (puro)
  application/  Casos de uso, unidad de trabajo, coordinador de tiradas
  adapters/     IndexedDB, Cache API, capacidades y entradas de usuario
  catalog/      Datos canónicos FON-ML-2022 y Publication Gate (fail-closed)
  ui/           Vistas, componentes, locale es-ES y accesibilidad
  service-worker/  Service worker del paquete sin conexión
infrastructure/ Infraestructura como código (AWS CDK)
tests/          Pruebas unitarias, de propiedad e integración
docs/           Documentación (este proyecto)
.kiro/          Especificación (requisitos, diseño, tareas), steering y hooks
```

Mapa detallado archivo por archivo en
[`docs/arquitectura.md`](docs/arquitectura.md).

## Verificación

```bash
npm install
npm run typecheck   # tsc del dominio y de la infraestructura
npm run lint        # eslint
npm test            # vitest (unit + property + integration)
npm run build       # tsc a dist/
```

Estado actual: `typecheck`, `lint`, `build` y `test` (80 archivos, 751 pruebas)
pasan. Las pruebas E2E de Playwright y de conformidad no están escritas todavía.

## Documentación

- [`docs/usuario.md`](docs/usuario.md) — objetivo del juego, mecánicas y misiones.
- [`docs/despliegue.md`](docs/despliegue.md) — cómo desplegar en AWS y requisitos.
- [`docs/arquitectura.md`](docs/arquitectura.md) — arquitectura, capas y archivos.
- [`docs/estado.md`](docs/estado.md) — qué falta y cómo continuar el desarrollo.
- `.kiro/specs/fields-of-normandy-pwa/` — requisitos, diseño y plan de tareas.

## Flujo de trabajo con Git

Al completar cada tarea de la especificación se realiza automáticamente un
commit y un push a la rama actual (hook `PostTaskExec` →
`scripts/commit-and-push.sh`). La identidad de autoría es la personal
configurada en el repositorio local.

## Licencia

Código bajo licencia [MIT](LICENSE). La licencia MIT cubre el código propio de
este repositorio; **no** cubre el contenido del juego `FON-ML-2022`, que sigue
sujeto a los derechos de su autor.
