# Estado vivo — Fields of Normandy (el juego)

Registro para pausar y retomar el trabajo sin perder el hilo. Actualizar al
final de cada sesión. Escrito en español directo.

> **Última actualización:** 11 de septiembre de 2026.
> **Fase actual:** implementación del motor de juego. Esquemas concretados.
>
> Hecho: spec completa (README, ESTADO, requirements, design) + **tarea 15
> (esquemas concretados)**. Siguiente: **tarea 16** — GameCommands tipados y el
> adaptador de catálogo ejecutable (`buildExecutableCatalog`).

## Progreso de implementación (tareas)

- [x] 15 — Esquemas `objective`/`setup`/`briefing` concretados. Ver detalle abajo.
- [ ] 16 — GameCommands tipados + adaptador de catálogo ejecutable.
- [ ] 17 — Orquestador del bucle + colocación + `evaluateOutcome`.
- [ ] 18 — Transcripción de mapas (editor + paso humano).
- [ ] 19 — Contenido de las 15 misiones.
- [ ] 20 — Shell web jugable.
- [ ] 21 — Tutorial (misión de aprendizaje).
- [ ] 22 — Playwright de jugabilidad (criterio de aceptación).
- [ ] 23 — Despliegue reproducible + teardown.
- [ ] 24 — Documentación y registro final.

### Tarea 15 — hecho (detalle para no repetir)

En `src/catalog/schemas/placeholders.ts` se concretaron los tipos antes opacos:

- `ObjectiveDefinition`: unión `eliminate-all-germans` |
  `eliminate-single-revealed-german` | `destroy-artillery` |
  `occupy-hex{hexId}`. Espeja `MissionObjective` del dominio y generaliza
  `occupy-church-hex` a `occupy-hex`. La app adapta entre ambas al invocar al
  dominio (el esquema NO importa `domain/rules`).
- `SetupDefinition`: `{ britishStart[], fixedGermanStart[], unknowns[],
  entryChoice? }` con `StartingPlacement{pieceId,definitionId,hexId,orientation?}`
  y `UnknownPlacement{unknownId,hexId}`.
- `catalog.ts`: `MissionDefinition` y el constructor `missionDefinition` ahora
  aceptan `briefingEs?` (opcional, condicional por `exactOptionalPropertyTypes`).
- 5 tests actualizados (stubs `{} as X` → valores mínimos válidos):
  `tests/unit/{catalog-schemas,publication-gate,catalog-compiler,conformance-matrix}.test.ts`
  y `tests/property/publication-gate.property.test.ts`. `stubMap` sigue opaco.
- Verificado: typecheck + lint + 751 tests en verde.

### Nota de proceso

Hook `PostTaskExec` creado (`.kiro/hooks/actualizar-estado-juego.json`) que
obliga a actualizar este ESTADO.md al completar cada tarea. Se activa en la
próxima sesión.

## Decisiones del usuario (firmes)

- Briefing narrativo: OPCIONAL, no bloqueante.
- Misión de demostración: propia e independiente de las 15; ejercita todo el
  juego (visibilidad, movimiento, ataques, opciones alemanas, minas, terreno,
  victoria). Banco de pruebas del bucle.
- Ritmo: sin prisa por "algo que arranque"; prioridad = avanzar bien + estado
  superdocumentado para retomar cuando haya saldo de tokens.

## Decisiones de diseño (de design.md)

- ObjectiveDefinition deja de ser opaco y se alinea con los tipos que
  mission-outcome ya evalúa: eliminate-all-germans, eliminate-single-revealed-
  german, destroy-artillery, occupy-hex{hexId} (generaliza occupy-church-hex).
- SetupDefinition = colocación inicial (britishStart, fixedGermanStart, unknowns,
  entryChoice). Rellena el estado inicial que hoy queda pieces:{}.
- briefing opcional en MissionText { objectiveEs, briefingEs? }.
- GameCommands: unión discriminada por type (advance-turn, activate-unit,
  choose-order, order-advance/fire/grenade/cover/rally/scout, resolve-german-
  phase). Mapa comando→política de dominio en design.md.
- Adaptador buildExecutableCatalog(missionDef, policies) → RulesCatalogView: ÚNICO
  sitio que traduce datos↔funciones. Va en src/application/catalog/ (nuevo).
- Orquestador PlaySession en src/application/play/ (nuevo) + adaptador
  GameState→OutcomeStateView para invocar evaluateOutcome en el bucle.
- Código nuevo: src/application/commands (vacío hoy), src/application/catalog,
  src/application/play, src/catalog/demo, src/web + src/web/public.
- CRITERIO DE ACEPTACIÓN del motor: prueba que juega la misión demo por el bucle
  REAL hasta victoria. Tests unitarios verdes NO bastan.

## En una frase

Las capas técnicas están construidas y verdes como **librerías**, pero **el
juego no está ensamblado**: falta el pegamento que convierte las reglas en un
motor jugable, el contenido de misiones (mapas), y la interfaz de arranque.
Objetivo: **un juego jugable con las 15 misiones y tutorial en la misión 1.**

## Qué existe y funciona (librerías dadas)

- Dominio de reglas puro y probado de forma aislada: combate, órdenes, moral,
  revelado, minas, artillería, semioruga, preparación y desenlace de misión.
- Aleatoriedad reproducible (`VersionedRandom`), invariantes, registros es-ES.
- Persistencia IndexedDB transaccional, copia/importación, migraciones.
- Catálogo canónico (datos) y Publication Gate fail-closed.
- Fuerzas británicas y tablas de revelado verificadas de las 15 misiones.
- Infraestructura como código (CDK) declarativa (no desplegada).
- Motor de reglas (`createRulesEngine`): sabe operar, pero necesita que le den
  un catálogo ejecutable con reglas reales.
- 751 pruebas unitarias/propiedad/integración en verde.
- Vite instalado y configurado (bundler del futuro shell web).

## Qué falta (por eso no es jugable)

Diagnóstico verificado contra el código:

1. **No hay catálogo ejecutable.** El motor consume un `RulesCatalogView` con
   reglas que tienen `matches`/`apply`/`roll`. Ese adaptador que compila las
   políticas de `domain/rules` en reglas ejecutables **no existe**. Solo se
   construye a mano en los tests.
2. **No hay GameCommands del juego.** No existen comandos tipados para avanzar
   turno, activar unidad, Avanzar, Fuego, Granada, Cobertura, Rally, Explorar ni
   fase alemana. El `payload` del comando es opaco (`Record<string,unknown>`).
3. **No hay orquestador del bucle.** Nada encadena turno → activación → órdenes
   → revelado → fase alemana → evaluar victoria. `evaluateOutcome` existe pero
   nadie lo llama.
4. **No hay colocación de piezas.** El estado inicial arranca con `pieces: {}` y
   `unknowns: {}` por DP-001 (mapas sin transcribir).
5. **No hay mapas.** Ninguna misión tiene `HexMapDefinition` real. Bloqueado por
   DP-001 (transcripción visual + segunda revisión). El PDF es binario/imagen:
   no legible por texto; requiere que el usuario aporte imágenes.
6. **Esquemas opacos.** `objective` y `setup` son marcas `Brand<unknown>`: hay
   que darles forma real y evaluable. No hay campo de lore/briefing.
7. **No hay shell web.** No hay `index.html`, `main.ts`, manifiesto PWA ni
   registro del service worker. La UI son módulos puros sin montar en el DOM.
8. **No desplegado.** El stack no existe en AWS; `cdk synth` no arranca por la
   config actual.

## Pasos humanos requeridos (no automatizables)

- **Aportar imágenes** de las páginas de mapa del PDF (PNG/JPG) para transcribir
  cada misión. Sin ellas, la transcripción es 100% manual en el editor.
- **Segunda revisión visual** (DP-001): validar cada mapa transcrito contra su
  página antes de marcarlo publicable. Es responsabilidad del usuario.
- **Aprobar textos/lore** propios (no se copia prosa del PDF).
- **Ejecutar el despliegue y el borrado** en persona para validarlos.

## Plan por fases (orden recomendado)

Ver `tasks.md`. Resumen del orden:

1. Spec del juego: requisitos y diseño (esta fase).
2. Esquemas `objective`/`setup`/lore.
3. Capa de ensamblaje: GameCommands + catálogo ejecutable + orquestador del bucle.
4. Contenido: transcripción de mapas (paso humano) + MissionDefinition completa.
5. Shell web jugable + tutorial M1.
6. Pruebas Playwright de jugabilidad (criterio de aceptación).
7. Despliegue reproducible + teardown.
8. Documentación y registro de estado.

## Dónde retomar

**Próxima tarea concreta:** terminar la spec del juego (requisitos + diseño) y
empezar por los esquemas `objective`/`setup` (tarea 15), porque desbloquean el
ensamblaje del bucle.

## Presupuesto

El trabajo puede pausarse por presupuesto de tokens. Este archivo y `tasks.md`
son la fuente de verdad para retomar. Mantenerlos actualizados es prioritario
antes de cerrar cada sesión.
