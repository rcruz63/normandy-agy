# Arquitectura

Cómo está organizado el código de Fields of Normandy PWA, capa por capa y
archivo por archivo. Pensada para orientarte antes de tocar nada.

## Índice

- [Principios](#principios)
- [Capas](#capas)
- [Flujo de una jugada](#flujo-de-una-jugada)
- [Tiradas de dados en dos fases](#tiradas-de-dados-en-dos-fases)
- [Catálogo y Publication Gate](#catalogo-y-publication-gate)
- [Mapa de archivos](#mapa-de-archivos)
  - [domain/](#domain)
  - [application/](#application)
  - [adapters/](#adapters)
  - [catalog/](#catalog)
  - [ui/](#ui)
  - [service-worker/](#service-worker)
  - [infrastructure/](#infrastructure)
- [Convenciones](#convenciones)

## Principios

- **Dominio puro.** Todo lo de `src/domain/` es TypeScript puro y determinista:
  solo tipos `Readonly` y funciones sin efectos. No importa DOM, IndexedDB, red,
  reloj (`Date`) ni SDK de AWS, y nunca usa `Math.random`. Cada módulo del
  dominio declara esta frontera en su cabecera.
- **Puertos e implementaciones.** El dominio define contratos (puertos) en
  `src/domain/ports/`. Las capas externas los implementan. El dominio depende de
  los contratos, nunca de las implementaciones.
- **La aplicación conecta puertos con adaptadores.** El reloj y la generación de
  identificadores se inyectan; la aleatoriedad se obtiene por el puerto
  `VersionedRandom`.
- **Cada transición es atómica.** Estado, ambos registros y estado aleatorio se
  confirman juntos en una sola transacción antes de permitir otra acción.
- **Fail-closed.** El contenido no verificado permanece bloqueado extremo a
  extremo; la producción no se despliega sin evidencia de coste cero.

## Capas

```
ui/            Presentación es-ES: vistas, componentes, locale, accesibilidad
  ↓ (intención de interacción normalizada)
application/   Casos de uso, unidad de trabajo, coordinador de tiradas, sesión
  ↓ (puertos)
domain/        Motor de reglas, aleatoriedad, invariantes, persistencia (PURO)
  ↑ (implementan puertos)
adapters/      IndexedDB, Cache API, capacidades, entradas de usuario
catalog/       Datos canónicos FON-ML-2022 + Publication Gate
service-worker/ Sirve el paquete sin conexión
infrastructure/ AWS CDK (fuera de la PWA; la PWA no lo importa)
```

La modalidad de entrada (tacto/ratón/teclado, automático/manual) se elimina en
la capa de aplicación: nunca llega al motor ni al estado de partida.

## Flujo de una jugada

Composition root: `src/application/session/game-session.ts` (`GameSession`).

1. **Crear**: `create-game.ts` construye la instantánea inicial en memoria y
   hace un único `commit` (modo `complete`). Serializado por `gameId`.
2. **Reanudar**: `resume-game.ts` restaura la última instantánea íntegra
   (estado + ambos registros + estado aleatorio con su posición exacta).
3. **Despachar un comando**:
   - La UI produce una intención → `IntentTranslator` la convierte en un
     `GameCommand` sin modalidad.
   - `GameCommandDispatcher.execute` encola por `gameId` (`PerGameQueue`).
   - Control optimista: si `expectedSnapshotId` no es la última confirmada →
     `stale` sin evaluar reglas ni consumir azar.
   - `RulesEngine.decide` decide: `accepted`, `awaiting-roll`, `rejected` o
     `blocked`. En `rejected`/`blocked` el estado aleatorio se conserva exacto.
   - Si `accepted`: se finaliza la instantánea (id + marca de tiempo
     inyectados), se validan invariantes y solo entonces se confirma en una
     transacción única en IndexedDB. Si el commit falla, se revierte todo.
4. **Proyectar**: `GameSession.project` enumera acciones disponibles y traduce
   ambos registros a `es-ES`. La UI no calcula ningún valor lúdico.

## Tiradas de dados en dos fases

Contrato de datos puro en `src/domain/engine/dice-roll.ts`; coordinación en
`src/application/games/dice-roll-coordinator.ts`.

1. **Fase 1 (motor).** `RulesEngine.decide` devuelve `awaiting-roll` con una
   `DiceRollRequest`, sin consumir azar ni mutar nada.
2. **Fase 2 (coordinador).** Reserva un único paso aleatorio por el puerto
   `VersionedRandom`. Automático adopta las caras generadas; Manual valida las
   caras físicas del jugador y reserva el mismo paso. Luego `RulesEngine.resumeRoll`
   interpreta las caras contra las reglas canónicas (uso único, no vuelve a
   consumir azar).
3. **Confirmación.** La decisión aceptada se confirma por el mismo commit único
   que un comando directo (`confirmDecision`). La reserva aleatoria solo se
   persiste a través de ese commit.

Todas las tiradas (activación, órdenes, combate, revelado, minas, artillería)
pasan por este único contrato. Ni la UI ni las reglas generan caras ad hoc.

## Catálogo y Publication Gate

- Los datos canónicos de `FON-ML-2022` viven en `src/catalog/FON-ML-2022/` como
  fixtures puros trazables a página/tabla del libro.
- El compilador (`catalog/compiler/`) valida y emite un catálogo inmutable;
  nunca reescribe una versión ya publicada.
- El **Publication Gate** (`catalog/publication/`) es fail-closed: una misión
  solo llega al selector jugable si su contexto está completo (transcripción
  visual DP-001 + segunda revisión, ambigüedades DP-002 resueltas, licencias
  DP-003, conformidad aprobada). Cualquier estado `unknown`/pendiente la bloquea.

## Mapa de archivos

Cada archivo `index.ts` es un barril que reexporta la superficie pública de su
carpeta. Se omiten de las tablas por brevedad.

### domain/

Núcleo puro. Ver [Principios](#principios).

**`domain/identity/`** — identificadores opacos.

| Archivo | Propósito |
|---|---|
| `brand.ts` | Tipo `Brand<T, Name>` para identificadores opacos. |
| `identifiers.ts` | Identificadores del dominio (`GameId`, `MissionId`, `SnapshotId`, `RulesVersion`, etc.) y sus constructores. |

**`domain/engine/`** — contrato de transición y decisión.

| Archivo | Propósito |
|---|---|
| `state.ts` | `GameState` y `GameSnapshot` y sus constructores. El estado nunca contiene estado de vista. |
| `transition.ts` | `GameCommand`, `TransitionProposal`, `TransitionDecision`, `DomainMessage`; modos `complete` y `stopped-after-consumption`. |
| `rules-engine.ts` | Motor puro: `decide`, `resumeRoll`, `availableActions`. Resuelve precedencia y transporta la decisión. |
| `precedence.ts` | Resolución de precedencia canónica; sin prioridad → `blocked` con `DecisionRef` (DP-002), sin `default`. |
| `catalog-view.ts` | Vista estructural del catálogo que consume el motor (`RulesCatalogView`, `ActionDescriptor`). |
| `dice-roll.ts` | Tipos del contrato de tiradas en dos fases (`DiceRollRequest`, `DiceRollResolution`, `DiceRollInput`, proyecciones). |
| `random-preservation.ts` | Invariante: `rejected`/`blocked` conservan el estado aleatorio. |
| `stopped-after-consumption.ts` | Construcción de propuestas atómicas que conservan un consumo ya efectuado. |

**`domain/rules/`** — políticas de reglas puras.

| Archivo | Propósito |
|---|---|
| `turn-order-policy.ts` | Secuencia de turno, activaciones y Tabla de órdenes. |
| `morale-policy.ts` | Moral normal/baja, impactos, reagrupar y limitación. |
| `order-effects.ts` | Efectos de órdenes (Avanzar, Fuego, Granada, Cobertura, Explorar). |
| `combat-resolver.ts` | Suma algebraica de combate, exclusiones y modificadores de terreno. |
| `halftrack.ts` | Reglas de la Semioruga (solo atacable por PIAT con apoyo). |
| `mines.ts` | Pruebas de mina (2d6 7+), persistencia y adyacencia. |
| `artillery.ts` | Selección y resolución de artillería (10+). |
| `reveal-resolver.ts` | Revelado de incógnitas con la Tabla de la misión y orientación. |
| `mission-setup.ts` | Preparación exacta de la misión (mapa, fuerzas, objetivos, tablas). |
| `mission-outcome.ts` | Duración y desenlace (victoria/derrota) por misión. |

**`domain/geometry/`** — mapa hexagonal y fichas.

| Archivo | Propósito |
|---|---|
| `map.ts` | `HexMapDefinition`, `HexDefinition`, `HexEdge` con aristas canónicas. |
| `piece.ts` | Estado de ficha (`PieceState`). |
| `hex-geometry.ts` | Adyacencia, distancia, ruta y zona de fuego sobre el grafo canónico. |
| `hex-graph-traversal.ts` | Recorrido del grafo hexagonal. |
| `visual-review.ts` | Modelo de la segunda revisión visual. |
| `identifiers.ts` | Identificadores de geometría. |
| `geometry-model-error.ts` | Errores de validación de modelos de geometría. |

**`domain/random/`** — aleatoriedad reproducible.

| Archivo | Propósito |
|---|---|
| `model.ts` | `RandomState`, `RandomStep`, `RandomConsumption` con semilla opaca. |
| `prng.ts` | Generador SplitMix64 puro. |
| `versioned-random.ts` | `VersionedRandom` como máquina de estado pura versionada. |

**`domain/logging/`** — registros y proyección.

| Archivo | Propósito |
|---|---|
| `log-entries.ts` | Entradas de registro simple y detallado con secuencia por partida. |
| `log-projector.ts` | Proyector `es-ES` que traduce claves `messageKey`. |

**`domain/invariants/`** — validación de estado.

| Archivo | Propósito |
|---|---|
| `invariant-validator.ts` | Orquesta `validateSnapshot` y `validateProposal`. |
| `snapshot-checks.ts` | Comprobaciones de una instantánea aislada (referencias, ocupación, secuencias, azar). |
| `proposal-checks.ts` | Comprobaciones de una propuesta contra la anterior (encadenamiento, avance aleatorio, logs). |
| `invariant-violation.ts` | Modelo de `InvariantViolation` con `messageKey`. |

**`domain/persistence/`** — copia, integridad y migración.

| Archivo | Propósito |
|---|---|
| `versioned-envelope.ts` | Sobre versionado con suma de integridad (`sealEnvelope`/`openEnvelope`). |
| `backup-package.ts` | Modelo del paquete de copia de seguridad. |
| `backup-codec.ts` | `CanonicalBackupCodec`: serialización canónica y round-trip. |
| `migration.ts` | Modelo de plan y migradores puros. |
| `migration-registry.ts` | Registro de migraciones con backup y rollback. |
| `recovery-export.ts` | Exportación de recuperación (diagnóstico + instantánea). |

**`domain/access/`** — bloqueo local.

| Archivo | Propósito |
|---|---|
| `local-verifier.ts` | Derivación de material verificador no recuperable. |
| `local-lock.ts` | Máquina de estado del bloqueo local (oculta la interfaz, no cifra datos). |

**`domain/offline/`**

| Archivo | Propósito |
|---|---|
| `offline-package.ts` | `OfflinePackageManifest` (versión, recursos, integridad). |

**`domain/ports/`** — contratos que implementan las capas externas.

| Archivo | Propósito |
|---|---|
| `rules-engine.ts` | Puerto `RulesEngine` y `TransitionDecision`. |
| `versioned-random.ts` | Puerto `VersionedRandom` y `RandomStep`. |
| `game-repository.ts` | Puertos `GameRepository` y `GameUnitOfWork`. |
| `game-persistence.ts` | Modelos reales de persistencia (`Diagnostic`, `CommandOutcome`, `CommitReceipt`, `GameSummary`). |
| `backup-codec.ts` | Puertos `BackupCodec` y `MigrationRegistry`. |
| `offline-package-coordinator.ts` | Puerto `OfflinePackageCoordinator`. |
| `catalog.ts` | Puertos `CatalogCompiler` y `PublicationGate`. |
| `placeholders.ts` | Marcas de tipo de datos que otros módulos refinan. |

### application/

Casos de uso y orquestación. Conecta puertos con adaptadores.

**`application/games/`**

| Archivo | Propósito |
|---|---|
| `game-command-dispatcher.ts` | Implementa `GameUnitOfWork`: cola por `gameId`, decide → invariantes → commit; confirma la fase 2 de tiradas. |
| `dice-roll-coordinator.ts` | Fase 2 de tiradas: reserva `VersionedRandom`, valida manual, delega interpretación en el motor. |
| `create-game.ts` | Crea una partida con instantánea inicial única. |
| `resume-game.ts` | Reanuda una partida restaurando todo. |
| `restart-game.ts` | Reinicio atómico en staging con confirmación cancelable. |
| `initial-state-factory.ts` | Construye la instantánea inicial (reloj e id inyectados). |
| `indexeddb-game-repository.ts` | Implementa `GameRepository` sobre el adaptador IndexedDB. |
| `game-store-model.ts` | Modelo de los object stores de partida. |
| `per-game-queue.ts` | Mutex/cola por `gameId`. |
| `command-outcome-factory.ts` | Constructores de los `CommandOutcome` no confirmados. |
| `import-backup.ts` | Flujo de importación fail-closed con staging. |
| `migrate-storage.ts` | Migración de almacenamiento con rollback. |
| `quota-probe.ts` | Sonda de cuota sin tocar partidas existentes. |
| `corruption-recovery.ts` | Aislamiento y recuperación de sobres corruptos. |
| `quarantine-ledger.ts` | Registro de cuarentena. |
| `pending-diagnostic.ts` | Diagnóstico pendiente en memoria. |
| `recovery-diagnostics.ts` | Diagnósticos de recuperación. |
| `recovery-export.ts` | Coordinación de la exportación de recuperación. |

**`application/offline/`**

| Archivo | Propósito |
|---|---|
| `offline-package-coordinator.ts` | `stage`/`activate`/`rollback`/health check del paquete sin conexión, fail-closed. |

**`application/session/`**

| Archivo | Propósito |
|---|---|
| `game-session.ts` | Composition root: cablea UI ↔ traductor ↔ unidad de trabajo ↔ coordinador ↔ motor ↔ persistencia ↔ proyecciones. |

### adapters/

Implementaciones de navegador de los puertos.

**`adapters/browser/indexeddb/`**

| Archivo | Propósito |
|---|---|
| `indexeddb-store-adapter.ts` | Adaptador de bajo nivel: transacción única de commit. |
| `schema.ts` | Object stores versionados (`games`, `snapshots`, `migrationBackups`, `quarantine`, `settings`, `meta`). |
| `idb-runtime.ts` | Runtime de acceso a IndexedDB. |

**`adapters/browser/cache/`**

| Archivo | Propósito |
|---|---|
| `offline-package-cache.ts` | Cachés `staging`/`current`/`previous`. |
| `offline-resource-fetcher.ts` | Descarga y verificación de recursos del paquete. |

**`adapters/browser/capabilities/`**

| Archivo | Propósito |
|---|---|
| `capability-detector.ts` | Detecta instalación PWA, IndexedDB, service worker, tacto. |
| `storage-estimator.ts` | Estimación de almacenamiento disponible. |

**`adapters/browser/inputs/`**

| Archivo | Propósito |
|---|---|
| `interaction-intent.ts` | Modelo de intención de interacción por dispositivo. |
| `input-adapters.ts` | Adaptadores de tacto/ratón/teclado a intención. |
| `intent-translator.ts` | Traduce intención a `GameCommand` eliminando la modalidad. |
| `alternative-controls.ts` | Alternativas visibles a gesto/hover/secundario/rueda/arrastre. |

**`adapters/browser/access/`**

| Archivo | Propósito |
|---|---|
| `local-verifier-store.ts` | Persistencia del verificador local. |

### catalog/

Datos canónicos y publicación.

**`catalog/FON-ML-2022/`**

| Archivo | Propósito |
|---|---|
| `missions.ts` | Identidad de las 15 misiones (nombre es-ES, turnos base, objetivo, referencias). |
| `forces-reveal.ts` | Fuerzas británicas, tablas de revelado y unidades fijas por misión. |
| `orders-combat-counters.ts` | Tabla de órdenes, valores para impactar e inventario de contadores. |

**`catalog/schemas/`**

| Archivo | Propósito |
|---|---|
| `catalog.ts` | `RulesCatalog`, `MissionDefinition`, `CanonicalRule`, `CanonicalTable`. |
| `source-ref.ts` | Referencias de fuente `FON-ML-2022-Mnn` y cálculo de páginas. |
| `publication.ts` | `DecisionRecord`, `ConformanceEntry`, `LicenseEntry`, `VisualReviewRecord`. |
| `build.ts` | `MaintenanceCatalog`, `CatalogBuildResult`, errores de validación. |
| `placeholders.ts` | Marcas de tipo de esquema. |

**`catalog/compiler/`**

| Archivo | Propósito |
|---|---|
| `catalog-compiler.ts` | Compila y emite catálogo inmutable; no reescribe versiones publicadas. |
| `catalog-validator.ts` | Validación de identificadores, referencias, cobertura y las 15 misiones. |
| `catalog-validation-primitives.ts` | Primitivas de validación reutilizables. |
| `conformance-matrix.ts` | Generación de la matriz de conformidad. |

**`catalog/publication/`**

| Archivo | Propósito |
|---|---|
| `publication-gate.ts` | Publication Gate fail-closed (DP-001/002/003 + conformidad). |
| `publication-gate-types.ts` | Tipos del gate (`PublicationBlocker`, `PublicationReport`). |

### ui/

Presentación en `es-ES`. No calcula valores lúdicos.

**`ui/views/`**

| Archivo | Propósito |
|---|---|
| `map-view.ts` | Renderizado SVG del mapa con capa semántica. |
| `log-view.ts` | Vista de registros simple/detallado. |
| `mission-selector.ts` | Selector de misiones publicables con nombre propio. |
| `action-projection.ts` | Proyección de acciones disponibles. |
| `local-lock-panel.ts` | Panel del bloqueo local. |
| `view-state.ts` | `ViewState` independiente del `GameState` (zoom, paneo, orientación). |

**`ui/components/`**

| Archivo | Propósito |
|---|---|
| `dice-roll-dialog.ts` | Diálogo de tirada accesible (automático/manual, cantidad variable de dados). |
| `dice-roll-dialog-render.ts` | Renderizado del diálogo (animación independiente, `prefers-reduced-motion`). |

**`ui/locale/`**

| Archivo | Propósito |
|---|---|
| `messages-es-ES.ts` | Catálogo de mensajes `es-ES`. |
| `message-resolver.ts` | Resolución de `messageKey` a texto. |
| `intl-formatters.ts` | Formateadores `Intl` con locale `es-ES`. |

**`ui/a11y/`**

| Archivo | Propósito |
|---|---|
| `accessible-encoding.ts` | Codificación por texto/forma/patrón/icono además de color. |
| `touch-target.ts` | Objetivos táctiles 44×44 px CSS. |
| `animation-log-equivalence.ts` | Equivalente persistente de cada animación en el registro simple. |

### service-worker/

| Archivo | Propósito |
|---|---|
| `offline-package-service-worker.ts` | Sirve solo desde la caché `current`, nunca desde `staging`. |

### infrastructure/

AWS CDK. Fuera de la PWA; no contiene secretos. Ver [`despliegue.md`](despliegue.md).

| Archivo | Propósito |
|---|---|
| `app.ts` | Punto de entrada de síntesis: ensambla `App` + `HostingStack`. |
| `stacks/hosting-stack.ts` | S3 privado + OAC + CloudFront + función de acceso + roles mínimos. |
| `stacks/cost-plan.ts` | Plan CloudFront FREE y WAF incluido. |
| `stacks/cost-budget.ts` | Zero spend budget y avisos de franquicia 50/80/100 %. |
| `stacks/cost-exclusions.ts` | Denylist de recursos de pago; verificación de ausencia. |
| `stacks/cost-plan-stack.ts` | Stack que agrega el plan de coste. |
| `stacks/cost-index.ts` | Agregado de coste. |
| `access/verifier-algorithm.ts` | Derivación del digest de acceso (comparación en tiempo constante). |
| `access/access-verifier-renderer.ts` | Genera la CloudFront Function `viewer-request` con material verificador. |
| `preflight/iac-plan.ts` | Modelo del plan de IaC. |
| `preflight/security-checks.ts` | Comprobaciones de seguridad derivadas del plan. |
| `preflight/production-preflight.ts` | Genera la evidencia de producción fail-closed. |
| `evidence/production-evidence.ts` | Tipos y reglas de evidencia (`unknown` = `fail`, coste 0 €). |
| `pipeline/pipeline-phases.ts` | Fases canónicas del pipeline en orden. |
| `pipeline/production-pipeline.ts` | Orquestación; solo `promote` toca producción con evidencia de la misma ejecución. |
| `pipeline/run-context.ts` | Autorización de promoción y verificación de origen de la evidencia. |
| `pipeline/informational-signals.ts` | Señales informativas (no prueban coste). |

## Convenciones

Recogidas en `docs/normas.md`:

- Código en inglés; comentarios, documentación y textos de usuario en español
  de España.
- Ficheros por debajo de ~200–250 líneas (salvo esquemas/fixtures); funciones
  atómicas con cláusulas de guarda y máximo dos niveles de indentación.
- Tipado estricto, sin `any` ni valores mágicos; sin excepciones silenciadas.
- Commits Conventional Commits en español.
