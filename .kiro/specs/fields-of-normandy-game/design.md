# Diseño — Fields of Normandy (el juego)

Cómo se **ensambla el juego jugable** sobre las librerías existentes. No
reescribe el dominio: lo cablea. Este documento es la referencia para retomar el
trabajo tras una pausa.

## Índice

- [Principio rector](#principio-rector)
- [Piezas que faltan (el pegamento)](#piezas-que-faltan-el-pegamento)
- [Esquemas a concretar: objective, setup, briefing](#esquemas-a-concretar-objective-setup-briefing)
- [GameCommands tipados](#gamecommands-tipados)
- [Catálogo ejecutable (adaptador)](#catalogo-ejecutable-adaptador)
- [Colocación inicial](#colocacion-inicial)
- [Orquestador del bucle](#orquestador-del-bucle)
- [Misión de demostración](#mision-de-demostracion)
- [Transcripción de mapas (paso humano)](#transcripcion-de-mapas-paso-humano)
- [Shell web y tutorial](#shell-web-y-tutorial)
- [Ubicación del código nuevo](#ubicacion-del-codigo-nuevo)
- [Orden de implementación y criterios](#orden-de-implementacion-y-criterios)

## Principio rector

Las capas de `src/domain`, `src/application`, `src/adapters`, `src/catalog` son
**librerías dadas y probadas de forma aislada**. El juego se construye
**cableándolas**, sin modificar su comportamiento público. Donde una librería
tiene un tipo opaco pendiente (`objective`, `setup`), se concreta su forma sin
romper lo existente.

Regla de oro: **ningún valor lúdico nuevo vive en la interfaz**. Las reglas
viven en `domain/rules`; el ensamblaje solo las conecta.

## Piezas que faltan (el pegamento)

El motor (`createRulesEngine`) ejecuta un `RulesCatalogView` con reglas que
tienen `matches`/`apply`/`roll`. Hoy nadie lo construye a partir del dominio.
Faltan cuatro piezas, en este orden de dependencia:

1. **Esquemas concretos** de `objective` y `setup` (hoy opacos) + `briefing`.
2. **GameCommands tipados** por acción del flujo.
3. **Adaptador de catálogo ejecutable**: compila las políticas de `domain/rules`
   + los datos canónicos en un `RulesCatalogView` real.
4. **Orquestador del bucle**: encadena turno → activación → órdenes → revelado →
   fase alemana → evaluar desenlace, e invoca `evaluateOutcome`.

## Esquemas a concretar: objective, setup, briefing

Hoy en `src/catalog/schemas/placeholders.ts`:

```ts
export type ObjectiveDefinition = Brand<unknown, "ObjectiveDefinition">;
export type SetupDefinition = Brand<unknown, "SetupDefinition">;
```

`mission-outcome.ts` ya evalúa objetivos tipados internamente
(`eliminate-all-germans`, `eliminate-single-revealed-german`,
`destroy-artillery`, `occupy-church-hex`). El diseño **alinea `ObjectiveDefinition`
con esos tipos** para que dejen de ser opacos:

```ts
type ObjectiveDefinition =
  | { kind: "eliminate-all-germans" }
  | { kind: "eliminate-single-revealed-german" }
  | { kind: "destroy-artillery" }
  | { kind: "occupy-hex"; hexId: HexId };   // generaliza "occupy-church-hex"
```

`SetupDefinition` describe la **colocación inicial** (lo que hoy falta):

```ts
type StartingPlacement = {
  pieceId: PieceId;
  hexId: HexId;
  orientation?: Orientation;
};
type UnknownPlacement = { unknownId: string; hexId: HexId };
type SetupDefinition = {
  britishStart: readonly StartingPlacement[];      // triángulos negros
  fixedGermanStart: readonly StartingPlacement[];  // unidades alemanas fijas
  unknowns: readonly UnknownPlacement[];           // incógnitas iniciales
  entryChoice?: { options: readonly EntryOptionId[] };
};
```

`briefing` es **opcional** y propio (no del PDF):

```ts
type MissionText = { objectiveEs: string; briefingEs?: string };
```

Se añade al esquema de misión sin romper la validación existente (campo
opcional). El briefing ausente no impide jugar (requisito 9b).

## GameCommands tipados

Hoy `GameCommand.payload` es `Record<string, unknown>` opaco. El diseño define
una **unión discriminada de payloads por `type`**, sin cambiar la forma genérica
que consumen las librerías (se mantiene la compatibilidad):

| `type` | payload | política de dominio que ejecuta |
|---|---|---|
| `advance-turn` | `{}` | `turn-order-policy` (fases, Turn Tracker) |
| `activate-unit` | `{ pieceId }` | `turn-order-policy.crossActivationRoll` (2d6) |
| `choose-order` | `{ pieceId, option }` | `turn-order-policy.resolveOrderOption` |
| `order-advance` | `{ pieceId, toHex }` | `order-effects.resolveAdvance` |
| `order-fire` | `{ pieceId, targetHex }` | `combat-resolver.resolveCombat` |
| `order-grenade` | `{ pieceId, targetHex }` | `combat-resolver` (6+, sin mod.) |
| `order-cover` | `{ pieceId }` | `order-effects.applyCoverOrder` |
| `order-rally` | `{ pieceId }` | `morale-policy` (quita moral baja) |
| `order-scout` | `{ pieceId, targetHex }` | `order-effects.resolveScout` |
| `resolve-german-phase` | `{}` | `combat-resolver` + `artillery` + `mines` + `morale-policy` |

Cada payload se valida con un constructor (fail-fast). Las órdenes con dados
(`activate-unit`, `order-fire`, `order-grenade`, revelado) usan la capacidad
`roll` de la regla (contrato de tirada en dos fases ya existente).

## Catálogo ejecutable (adaptador)

Nueva pieza en la capa de aplicación: `buildExecutableCatalog(missionDef,
policies) → RulesCatalogView`. Por cada `type` de comando produce un
`CatalogRuleView`:

- `matches(state, command)`: precondición (p. ej. la unidad existe, es su fase,
  la orden es válida para el tipo de unidad).
- `apply(snapshot, command)`: llama a la **política de dominio** correspondiente
  y construye la `TransitionProposal` (nuevo estado + registros).
- `roll` (cuando hay dados): `requestRoll` declara la `DiceRollRequest` y
  `interpret` traduce las caras llamando a la política (p. ej. `resolveCombat`).

`actions`: por cada `CatalogActionView`, `enabled(state)` indica si la acción se
ofrece (p. ej. Explorar deshabilitado para Equipo MG). Esto alimenta
`availableActions` que la UI ya sabe proyectar.

Clave: **este adaptador es el único sitio que traduce datos↔funciones.** El
dominio sigue puro; la UI sigue sin lógica.

## Colocación inicial

`initial-state-factory.ts` hoy deja `pieces: {}`. El diseño introduce, en la capa
de aplicación, un paso que **rellena el estado inicial desde `SetupDefinition`**:
coloca las fichas británicas y alemanas fijas y las incógnitas en sus hexágonos.
Solo se activa cuando la misión tiene mapa transcrito; si no, la misión queda no
jugable (fail-closed intacto). No se toca la librería: se envuelve.

## Orquestador del bucle

Nueva pieza en `application/`: `PlaySession` (o extensión de `GameSession`) que
implementa el bucle del reglamento:

```
prepararMisión(setup) → colocar piezas
repetir por turno:
  faseBritánica:
    por cada unidad activable:
      activar (2d6) → elegir orden(es) → ejecutar → (revelado si Avanzar/Explorar)
  faseAlemana: resolver-german-phase
  evaluarDesenlace (evaluateOutcome):
    victoria/derrota → fin
    en curso → avanzar Turn Tracker
```

Cada paso pasa por `GameCommandDispatcher.execute` (cola por partida, invariantes,
commit atómico). Tras cada transición relevante, el orquestador **invoca
`evaluateOutcome`** con un adaptador `GameState → OutcomeStateView` (hoy
inexistente) y actualiza `outcome`.

## Misión de demostración

Independiente de las 15 canónicas (requisito 9b/9-demo). Mapa propio pequeño
(p. ej. 5×5 hexágonos) con: bosque, edificio, colina, río; una escuadra
británica y un Equipo MG; incógnitas que revelan LMG/HMG/mina; una unidad de
artillería fija; objetivo `eliminate-all-germans`. Sirve para ejercitar todo el
bucle sin transcribir el PDF. Se marca `demo` y no cuenta como canónica.

## Transcripción de mapas (paso humano)

El PDF es binario/imagen: no legible por texto. Flujo:

1. El usuario aporta la **imagen** de la página de mapa (PNG/JPG) en el chat, o
   la carga en el editor.
2. Se genera un borrador de `HexMapDefinition` + `SetupDefinition` (asistido por
   imagen si se aporta; manual si no).
3. **Editor visual** en la PWA: rejilla hexagonal editable (terreno, aristas,
   entradas, colocación) superponible a la imagen de referencia.
4. **Segunda revisión visual** (DP-001): el usuario aprueba; se marca la misión
   publicable y jugable.

El editor reutiliza `ui/views/map-view` (que ya renderiza esta estructura).

## Shell web y tutorial

- Shell: `index.html` + `main.ts` (Vite ya instalado) que compone `PlaySession`
  con las dependencias reales (IndexedDB, `VersionedRandom`, catálogo ejecutable
  de la misión) y monta las vistas de `ui/` en el DOM.
- PWA: `manifest.webmanifest`, iconos propios, registro del service worker
  existente.
- Tutorial: capa guiada sobre el bucle real (misión de aprendizaje). Textos
  propios `es-ES`. Omitible; no altera reglas.

## Ubicación del código nuevo

- `src/catalog/schemas/` — concretar `objective`, `setup`, añadir `briefing`.
- `src/application/commands/` — hoy vacío (`.gitkeep`): GameCommands tipados y
  sus constructores.
- `src/application/catalog/` (nuevo) — `buildExecutableCatalog` (el adaptador).
- `src/application/play/` (nuevo) — `PlaySession` (orquestador) y el adaptador
  `GameState → OutcomeStateView`.
- `src/catalog/demo/` (nuevo) — misión de demostración.
- `src/web/` — shell, `main.ts`, montaje de vistas, tutorial (Vite root).
- `src/web/public/` — `manifest.webmanifest`, iconos, service worker registrable.

Todo lo nuevo respeta las fronteras: el dominio no importa nada de aplicación/UI.

## Orden de implementación y criterios

1. Esquemas `objective`/`setup`/`briefing` (tarea 15) — desbloquea todo.
2. GameCommands + adaptador de catálogo ejecutable (tarea 16).
3. Orquestador del bucle + colocación (tarea 17), verificado con la misión demo.
4. Transcripción (tarea 18) y contenido de misiones (tarea 19) — paso humano.
5. Shell (tarea 20) + tutorial (tarea 21).
6. Playwright de jugabilidad (tarea 22) — criterio de aceptación.
7. Despliegue + teardown (tarea 23).

**Criterio de aceptación de cada fase del motor:** una prueba que juegue la
misión demo por el bucle real (no reglas de test) y llegue a victoria. Sin eso,
la fase no está hecha, por muchos tests unitarios verdes.
