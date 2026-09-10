# Implementation Plan: Fields of Normandy PWA

## Overview

Este plan convierte el diseño aprobado en pasos de codificación incrementales en **TypeScript** (el diseño fija TypeScript puro para el dominio, Vitest + fast-check para pruebas, Playwright + axe-core para PWA/accesibilidad y CDK TypeScript para infraestructura). Cada tarea construye sobre las anteriores y termina integrándose; no queda código huérfano. Solo se incluyen tareas de escribir, modificar o probar código, y de infraestructura como código.

Se respetan las fronteras del diseño: el dominio no importa DOM, IndexedDB, red, reloj ni SDK de AWS. El contenido no verificado permanece en Estado no publicable: **no se resuelve DP-001/DP-002/DP-003, no se inventan reglas, no se copia contenido protegido del PDF, no hay campañas ni sincronización, y no se asume cobertura de coste cero no verificada.** Los valores lúdicos concretos que ya están en los requisitos 32-39 se codifican como fixtures/catálogo; cualquier dato visual o de mapa que dependa de DP-001 se deja como fixture bloqueado.

Las 26 propiedades de corrección del diseño se implementan cada una con exactamente una prueba `fast-check` (`numRuns >= 100`) y su etiqueta exacta `// Feature: fields-of-normandy-pwa, Property {n}: {texto}`. Los sub-tareas de prueba marcadas con `*` son opcionales.

## Tasks

- [x] 1. Estructura del proyecto, puertos y tipos base del dominio
  - Crear la estructura `src/{domain,application,adapters,catalog,ui,service-worker}` e `infrastructure/`, `tests/{unit,property,integration,e2e,conformance}` según el diseño
  - Configurar TypeScript estricto, Vitest, fast-check, Playwright y axe-core sin importaciones de DOM/AWS en `domain/`
  - Definir tipos opacos `Brand<T,Name>` e identificadores (`CatalogId`, `MissionId`, `GameId`, `SnapshotId`, `RulesVersion`, `DecisionRef`, `SaveVersion`, `PackageVersion`, `RandomAlgorithmVersion`) y tipos `Readonly`
  - Definir las interfaces de puerto (`RulesEngine`, `VersionedRandom`, `GameRepository`, `GameUnitOfWork`, `BackupCodec`, `MigrationRegistry`, `OfflinePackageCoordinator`, `PublicationGate`, `CatalogCompiler`)
  - _Requirements: 1.1, 6.1, 19.2, 21.1, 28.5_

- [x] 2. Catálogo canónico, esquemas y Publication Gate (fail-closed)
  - [x] 2.1 Definir modelos de catálogo y fuente
    - Implementar `SourceRef`, `PublicationStatus`, `CatalogItem<T>`, `DecisionRecord`, `ConformanceEntry`, `LicenseEntry`, `RulesCatalog`, `MissionDefinition`, `CanonicalRule`, `CanonicalTable<I,O>` como tipos `Readonly` validados por constructores
    - Validar `missionRef` contra `N=01..15` y páginas `16+2(N-1)` / `17+2(N-1)`; conservar título inglés solo en metadatos de mantenimiento
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.5, 4.2, 4.3, 32.3_
  - [x] 2.2 Implementar `CatalogValidator` y `CatalogCompiler` fail-closed
    - Validar identificadores únicos, referencias, cobertura/no solapamiento de tablas, exactamente quince Misiones y relaciones de inventario
    - Emitir catálogo inmutable con `rulesVersion` nuevo; nunca reescribir una versión publicada
    - _Requirements: 1.6, 1.10, 1.11, 2.1, 2.2, 2.7, 2.8, 4.1, 4.7, 4.9, 4.10, 17.7_
  - [x] 2.3 Implementar `PublicationGate` y bloqueo por DP/prueba/licencia
    - Agregar decisiones (DP-001/DP-002/DP-003), segunda revisión visual, licencias y conformidad en `PublicationReport`; producir `PublicationBlocker` estructurado
    - Exigir `DP-001=resolved` + segunda revisión para cada mapa, DP-002 resuelto por situación, recurso propio o DP-003, y prueba aprobada por elemento; entregar al selector solo Misiones `published`
    - _Requirements: 1.8, 2.3, 2.4, 2.5, 3.6, 4.8, 30.4, 30.6, 30.11, 33.8, 40.6, 40.7, 40.13_
  - [x]* 2.4 Escribir prueba de propiedad de autoridad, trazabilidad y publicación cerrada
    - **Property 1: Autoridad, trazabilidad y publicación cerrada**
    - **Validates: Requirements 1.1, 1.2, 1.8, 1.10, 1.11, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 4.2, 4.3, 4.9, 30.4, 30.5, 30.6, 30.7, 30.11, 33.8, 40.6, 40.7, 40.13**
  - [ ]* 2.5 Escribir pruebas unitarias del compilador y esquema
    - Validadores de esquema, políticas de publicación, ausencia explícita de aplicación y colisión de entradas
    - _Requirements: 2.7, 2.8, 4.8, 4.10_

- [x] 3. Fixtures canónicos verificados de las quince Misiones
  - [x] 3.1 Codificar catálogo de Misiones, nombres, duración y objetivos (req. 32)
    - Crear fixtures estructurados con las quince Misiones, nombre visible `es-ES`, título inglés como metadato, turnos base, objetivo y `FON-ML-2022-Mnn`
    - Modelar exactamente tres opciones de duración: base−1, base, base+1
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.8, 32.9, 32.10, 32.11, 32.12_
  - [x] 3.2 Codificar fuerzas británicas, tablas de revelado y unidades fijas (req. 33)
    - Crear fixtures de fuerzas por Misión, filas de Tabla de revelado d6 y unidades fijas adicionales con sus `SourceRef`; registrar ausencia explícita cuando no haya unidad fija
    - Marcar como Estado no publicable toda posición/Orientación visual dependiente de DP-001
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8_
  - [x] 3.3 Codificar tablas de órdenes, valores para impactar y contadores (req. 34, 36, 40)
    - Crear fixtures de las seis filas de la Tabla de órdenes por tipo de unidad, valores base para impactar y el inventario de contadores funcionales de página 47 como Recursos propios
    - _Requirements: 34.18, 36.1, 40.8, 40.9_
  - [ ]* 3.4 Escribir pruebas de ejemplo de las tablas fijas
    - Verificar filas exactas de req. 32-34/36 contra fixtures, conjunto exacto M01..M15 y páginas de referencia
    - _Requirements: 32.1, 33.1, 34.18, 36.1_

- [~] 4. Checkpoint - Catálogo y publicación
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Geometría hexagonal y modelos de mapa/ficha
  - [x] 5.1 Implementar modelos de mapa y ficha
    - Implementar `HexMapDefinition`, `HexDefinition`, `HexEdge`, `VisualReview`, `PieceState` con aristas canónicas almacenadas una sola vez
    - _Requirements: 4.5, 40.1, 40.2, 40.3, 40.13_
  - [x] 5.2 Implementar `HexGeometry` (adyacencia, distancia, ruta, Zona de fuego)
    - Proyectar vecinos simétricos, calcular distancia/ruta/Zona de fuego solo sobre el grafo canónico; recalcular derivados al cambiar posición u Orientación; no deducir conexiones fuera del catálogo
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 14.1, 14.6, 37.5, 40.11_
  - [x]* 5.3 Escribir prueba de propiedad de integridad geométrica
    - **Property 8: Integridad geométrica, adyacencia y derivados**
    - **Validates: Requirements 4.5, 10.1, 10.2, 10.3, 10.5, 10.6, 14.1, 14.6, 35.1, 35.13, 35.14, 36.7, 36.8, 36.9, 37.5, 40.1, 40.2, 40.3, 40.11**

- [x] 6. Aleatoriedad reproducible versionada
  - [x] 6.1 Implementar `VersionedRandom` como máquina de estado pura
    - Implementar `RandomState`, `RandomStep`, `RandomConsumption` con Semilla opaca; registro inmutable de `algorithmVersion`; identificadores únicos por Partida y posiciones consecutivas; nunca `Math.random` en dominio
    - _Requirements: 19.2, 19.3, 19.4, 19.5, 19.11_
  - [ ]* 6.2 Escribir prueba de propiedad de determinismo de la secuencia
    - **Property 14: Determinismo de la secuencia aleatoria**
    - **Validates: Requirements 19.2, 19.3, 19.4, 19.5, 19.11**
  - [ ]* 6.3 Escribir prueba de propiedad de continuidad tras reanudación
    - **Property 16: Continuidad aleatoria tras reanudación**
    - **Validates: Requirements 7.2, 19.7, 19.9**

- [x] 7. Estado de partida, transición y validador de invariantes
  - [x] 7.1 Implementar modelos de estado y transición
    - Implementar `GameState`, `GameSnapshot`, `TransitionProposal`, `GameCommand`, `TransitionDecision` (`accepted`/`rejected`/`blocked`) con modos `complete` y `stopped-after-consumption`; `GameState` nunca contiene estado de vista
    - _Requirements: 5.6, 7.1, 13.7, 17.6, 21.1_
  - [x] 7.2 Implementar `InvariantValidator`
    - Validar referencias, ocupación, estado de fichas, secuencias, registros, aleatoriedad y demás invariantes de la Versión de reglas
    - _Requirements: 21.1, 21.2, 21.4_
  - [x]* 7.3 Escribir pruebas unitarias de invariantes y ramas de error
    - Cubrir `rejected`, `blocked`, `stopped-after-consumption`, `invalid-proposal`
    - _Requirements: 21.2, 21.3, 21.5_

- [x] 8. Motor de reglas: contrato de transición y precedencia canónica
  - [x] 8.1 Implementar `RulesEngine.decide`/`availableActions` y precedencia
    - Resolver reglas por políticas de prioridad del catálogo; regla concreta (req. 32-40) prevalece sobre genérica; ausencia de prioridad produce `blocked` + `DecisionRef`, sin `default`; `decide` no muta argumentos
    - _Requirements: 5.8, 8.8, 8.9, 9.7, 10.9, 11.6, 11.7, 11.8, 11.9, 12.6, 12.7, 13.9, 14.7, 14.8, 15.6, 15.7, 16.7, 17.9, 18.6_
  - [x] 8.2 Implementar conservación ante rechazo/bloqueo previo al azar
    - `rejected` y bloqueos previos a resolución aleatoria devuelven exactamente el Estado aleatorio recibido
    - _Requirements: 8.5, 9.5, 10.3, 11.4, 14.7, 15.4, 16.5, 18.4, 19.8, 21.2_
  - [x] 8.3 Implementar detención `stopped-after-consumption`
    - Conservar Consumo ya efectuado (13.7, 17.6): avanzar exactamente una vez el Estado aleatorio, registrar consumo/diagnóstico, sin aplicar efecto incompleto
    - _Requirements: 13.5, 13.6, 13.7, 13.8, 17.5, 17.6, 17.7_
  - [x]* 8.4 Escribir prueba de propiedad de precedencia canónica
    - **Property 3: Precedencia canónica sin reglas implícitas**
    - **Validates: Requirements 5.8, 8.8, 8.9, 9.7, 10.9, 11.6, 11.7, 11.8, 11.9, 12.6, 12.7, 13.9, 14.7, 14.8, 15.6, 15.7, 16.7, 17.9, 18.6**
  - [x]* 8.5 Escribir prueba de propiedad de conservación ante rechazo/bloqueo
    - **Property 4: Conservación ante rechazo o bloqueo previo al azar**
    - **Validates: Requirements 5.4, 6.7, 7.4, 8.5, 9.5, 10.3, 10.8, 11.4, 11.7, 12.6, 13.6, 14.7, 15.4, 16.5, 18.4, 19.8, 21.2, 21.9, 24.12, 34.19, 35.3**
  - [x]* 8.6 Escribir prueba de propiedad de detención tras consumo
    - **Property 5: Detención posterior a un consumo sin efecto incompleto**
    - **Validates: Requirements 13.5, 13.6, 13.7, 13.8, 17.5, 17.6, 17.7**

- [x] 9. Submódulos de reglas: turno, órdenes y Moral
  - [x] 9.1 Implementar `TurnOrderPolicy` (secuencia, activaciones, tablas de órdenes)
    - Fase británica antes que alemana; activación una a una; cruce de d6 con columnas; opciones exactas por Moral/dobles; resolución de órdenes en orden definido
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 34.2, 34.3, 34.6, 34.7, 34.8, 34.9, 34.10, 34.11, 34.12, 34.13, 34.14, 34.15, 34.18, 34.19_
  - [x] 9.2 Implementar `MoralePolicy` (impactos, Reagrupar, limitación)
    - Moral normal→baja al impacto, baja→eliminación; baja limita a primera Orden aunque Reagrupar restaure Moral en esa activación
    - _Requirements: 9.1, 9.2, 9.3, 34.16, 34.17, 35.11, 35.12, 37.1, 37.2_
  - [x] 9.3 Implementar efectos de órdenes (Avanzar, Fuego, Granada, Cobertura, Explorar)
    - Avanzar un Hexágono en Direcciones hacia delante, apilar británicas, revelar Incógnitas adyacentes, retirar Cobertura al avanzar; Explorar a distancia 2 solo escuadras; excluir Explorar para MG/Mortero/PIAT
    - _Requirements: 35.1, 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.9, 35.10, 35.13, 35.14, 35.15_
  - [x]* 9.4 Escribir prueba de propiedad de activación, órdenes y Moral
    - **Property 9: Activación, órdenes y Moral**
    - **Validates: Requirements 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 34.2, 34.3, 34.6, 34.7, 34.8, 34.9, 34.10, 34.11, 34.12, 34.13, 34.14, 34.15, 34.16, 34.17, 34.18, 34.19, 35.9, 35.10, 35.11, 35.12, 37.1, 37.2**

- [x] 10. Submódulos de reglas: combate, cobertura, terreno y especiales
  - [x] 10.1 Implementar `CombatResolver` (suma algebraica, exclusiones, terreno)
    - Valor base + suma algebraica de fuentes compatibles independiente del orden; Granada/Mina excluyen modificadores; modificadores de bosque/edificio/colina/Río; PIAT limita objetivos y omite +2 de edificio
    - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.4, 14.3, 14.4, 15.1, 15.3, 16.4, 35.6, 35.7, 35.8, 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.7, 36.8, 36.9, 36.10, 36.11, 36.12, 36.13, 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.9_
  - [x] 10.2 Implementar Semiorugas, PIAT, Minas y Artillería (req. 39)
    - Semioruga solo atacada por PIAT con Apoyo; pruebas de Mina 2d6 7+ sin modificadores (adyacencia desde M7 y fase alemana), Explorar sin prueba inmediata, Mina persistente; Artillería 10+ contra británicas sin bosque/edificio/Cobertura, sin Flanqueo, eliminable
    - _Requirements: 16.1, 16.2, 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 39.10, 39.11, 39.12, 39.13, 39.14, 39.15, 39.16, 39.17, 39.18_
  - [x]* 10.3 Escribir prueba de propiedad de cálculo algebraico de combate
    - **Property 10: Cálculo algebraico de combate y excepciones**
    - **Validates: Requirements 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 12.5, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 16.4, 35.5, 35.6, 35.7, 35.8, 36.1, 36.2, 36.3, 36.4, 36.5, 36.6, 36.10, 36.11, 36.12, 36.13, 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.8, 38.9, 39.2, 39.3, 39.4, 39.5, 39.6, 39.14, 39.17**
  - [x]* 10.4 Escribir prueba de propiedad de persistencia y pruebas de Minas
    - **Property 12: Persistencia y pruebas de Minas**
    - **Validates: Requirements 16.1, 35.8, 36.11, 37.10, 37.12, 37.13, 39.7, 39.8, 39.9, 39.10, 39.11, 39.12**
  - [x]* 10.5 Escribir prueba de propiedad de selección y resolución de Artillería
    - **Property 13: Selección y resolución de Artillería**
    - **Validates: Requirements 16.2, 39.13, 39.14, 39.15, 39.16, 39.17, 39.18**

- [x] 11. Submódulos de reglas: Revelado, Misión y desenlace
  - [x] 11.1 Implementar `RevealResolver` (Incógnitas, tabla, Orientación, Minas)
    - Ocultar información previa al Revelado; sustituir Incógnita por resultado de la Tabla de la Misión en el mismo Hexágono; orientar hacia la única reveladora o suspender si el desempate está pendiente (DP-002)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 33.2, 35.4, 35.13, 35.14, 37.6, 37.7, 37.8, 37.9, 37.10, 37.11, 37.12, 37.13_
  - [x] 11.2 Implementar `MissionResolver` (preparación, duración, objetivo, desenlace)
    - Preparar exactamente mapa/fuerzas/fijas/objetivos/tablas de la Misión; duración base∓1; victoria solo si el objetivo se cumple hasta el último turno inclusive, derrota en otro caso; aplicar solo el objetivo de la Misión seleccionada
    - _Requirements: 5.1, 5.2, 5.3, 17.2, 17.3, 17.4, 17.5, 18.1, 18.2, 18.3, 32.6, 32.7, 33.1, 33.3, 33.4, 33.5_
  - [x]* 11.3 Escribir prueba de propiedad de ocultación y Revelado canónico
    - **Property 11: Ocultación y Revelado canónico**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 33.2, 35.4, 35.13, 35.14, 37.6, 37.7, 37.8, 37.9, 37.10, 37.11, 37.12**
  - [x]* 11.4 Escribir prueba de propiedad de duración, tablas y desenlace
    - **Property 24: Duración, tablas y desenlace por Misión**
    - **Validates: Requirements 17.2, 17.3, 17.4, 17.5, 18.1, 18.2, 32.4, 32.5, 32.6, 32.7, 32.8, 32.9, 32.10, 32.11, 33.2**
  - [x]* 11.5 Escribir prueba de propiedad de catálogo y preparación exactos
    - **Property 2: Catálogo y preparación exactos por Misión**
    - **Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.6, 8.1, 17.8, 32.1, 32.2, 32.3, 32.4, 32.5, 32.8, 32.9, 32.10, 32.11, 33.1, 33.3, 33.6, 33.7**

- [x] 12. Checkpoint - Motor de reglas completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Registros estructurados y proyector es-ES
  - [x] 13.1 Implementar entradas de registro y proyector es-ES
    - Implementar `SimpleLogEntry`/`DetailedLogEntry` con secuencia por Partida; detallado con orden de cálculo, operandos, modificadores con signo, fórmula, resultado, `rulesVersion`, `sourceRefs` y Consumos; proyector `es-ES` con claves `messageKey`
    - _Requirements: 8.7, 12.3, 12.5, 14.5, 16.4, 20.1, 20.2, 20.3, 20.4, 20.6, 20.7, 38.8_
  - [x]* 13.2 Escribir prueba de propiedad de registros completos y aislados
    - **Property 17: Registros completos, ordenados y aislados**
    - **Validates: Requirements 8.7, 12.3, 12.5, 14.5, 16.4, 19.4, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 38.8**

- [x] 14. Determinismo del replay del Motor
  - [x]* 14.1 Escribir prueba de propiedad de determinismo del replay
    - **Property 15: Determinismo del replay del Motor**
    - **Validates: Requirements 19.6, 20.1, 20.2, 20.3, 20.4, 21.1**

- [x] 15. Persistencia IndexedDB y atomicidad
  - [x] 15.1 Implementar adaptador IndexedDB con object stores versionados
    - Crear stores `games`, `snapshots`, `migrationBackups`, `quarantine`, `settings`, `meta`; validar versión, integridad del sobre, `gameId` interno y compatibilidad en cada lectura; usar `fake-indexeddb` para pruebas
    - _Requirements: 6.3, 22.1, 28.6_
  - [x] 15.2 Implementar `GameRepository` y `GameUnitOfWork` con cola por gameId
    - Mutex/cola por `gameId`; commit transaccional único de Instantánea + ambos registros + metadatos + `latestSnapshotId`; `expectedSnapshotId` obsoleto rechazado sin reglas ni azar; abort restaura última confirmada
    - _Requirements: 7.1, 7.7, 7.8, 7.9, 21.4, 21.9, 21.10_
  - [x] 15.3 Implementar creación, reanudación y reinicio de Partidas
    - Crear con Instantánea inicial única; reanudar restaurando todo; reinicio atómico en staging con confirmación cancelable; conservar Partidas ante cancelación/fallo; sonda de cuota sin tocar Partidas existentes
    - _Requirements: 5.4, 5.5, 5.7, 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 7.2, 7.3, 7.4, 7.5, 7.6, 19.1, 19.7, 17.8_
  - [x] 15.4 Implementar cuarentena y recuperación de corrupción
    - Aislar sobres corruptos sin borrar bytes, excluir de reanudación, conservar demás Partidas; indicar fecha/id de Instantánea restaurada tras cierre inesperado; `PendingDiagnostic` en memoria
    - _Requirements: 19.9, 19.10, 21.5, 21.6, 21.7, 21.8_
  - [x]* 15.5 Escribir prueba de propiedad de commit atómico o identidad
    - **Property 6: Commit atómico o identidad**
    - **Validates: Requirements 5.4, 5.7, 7.1, 7.5, 7.6, 7.7, 7.8, 21.4, 21.9, 21.10, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 23.11**
  - [x]* 15.6 Escribir prueba de propiedad de aislamiento entre Partidas
    - **Property 7: Aislamiento entre Partidas**
    - **Validates: Requirements 6.1, 6.3, 6.5, 6.7, 7.5, 7.6, 18.3, 20.5, 21.6**
  - [x]* 15.7 Escribir pruebas de integración de persistencia y recuperación
    - Confirmar/abortar en cada punto de fallo, reabrir contexto, crear/reanudar al menos veinte Partidas por Entorno probado, corromper agregado, cuota insuficiente y eliminación externa
    - _Requirements: 6.2, 7.7, 21.6, 23.11, 31.7_

- [x] 16. Exportación, importación y migraciones
  - [x] 16.1 Implementar `BackupCodec` con serialización canónica versionada
    - Definir `BackupPackage`, `IntegrityDescriptor`, canonicalización UTF-8/orden estable; `encode`/`validate`; round-trip por equivalencia estructural; suma como detección de alteración accidental, no firma/cifrado
    - _Requirements: 22.2, 22.3, 22.11_
  - [x] 16.2 Implementar flujo de importación fail-closed
    - Leer sin escribir; validar envoltorio/versión/canonicalización/suma/ids/Instantáneas/registros/aleatorio/invariantes; staging completo; colisión de `gameId` bloquea con cancelar o reemplazar explícito; confirmar en una sola transacción y luego cambiar generación activa
    - _Requirements: 22.4, 22.5, 22.11_
  - [x] 16.3 Implementar `MigrationRegistry` con backup y rollback
    - Copiar generación activa como `migrationBackup`; cadena de migradores puros sobre staging; verificar conservación de todos los campos/registros/aleatorio; cambiar `activeGenerationId` solo si todo válido; conservar copia anterior; sin llamadas a servidor
    - _Requirements: 22.6, 22.7, 22.8, 22.9, 22.10_
  - [x]* 16.4 Escribir prueba de propiedad de round-trip de exportación/importación
    - **Property 18: Round-trip de exportación e importación**
    - **Validates: Requirements 22.2, 22.3, 22.4, 22.5, 22.11**
  - [x]* 16.5 Escribir prueba de propiedad de migración conservadora y recuperable
    - **Property 19: Migración conservadora y recuperable**
    - **Validates: Requirements 22.6, 22.7, 22.8, 22.9**
  - [x]* 16.6 Escribir pruebas de integración de exportar/importar/migrar
    - Exportar en un contexto e importar explícitamente en otro sin canal de sincronización; migración con fallo intermedio y rollback
    - _Requirements: 22.10, 22.11_

- [ ] 17. Incompatibilidad de versiones y diagnósticos de recuperación
  - [~] 17.1 Implementar detección de versiones incompatibles y diagnóstico exportable
    - Impedir reanudar/importar con reglas/algoritmo/guardado no soportado sin sustituir versión compatible; permitir exportar Instantánea/diagnóstico; incluir diagnóstico pendiente en exportación de recuperación cuando IndexedDB no acepte escritura
    - _Requirements: 19.9, 19.10, 21.10, 23.10_

- [x] 18. Checkpoint - Persistencia, copia y migración
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Paquete sin conexión y actualización segura
  - [x] 19.1 Implementar `OfflinePackageManifest` y service worker con cachés staging/current/previous
    - Enumerar versión, recursos, longitud e integridad; cachés `fon-staging/current/previous`; `staging` nunca sirve a clientes
    - _Requirements: 23.1, 23.2, 28.8_
  - [x] 19.2 Implementar `OfflinePackageCoordinator` (stage/activate/rollback/health check)
    - `stage` descarga y verifica todo antes de completitud; `activate` cambia puntero con confirmación si hay Partida abierta; health check de shell/catálogo/migradores/compatibilidad; ante fallo restaurar `previous` sin borrar; limpieza solo tras arranque confirmado, nunca borra Partidas
    - _Requirements: 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.11, 28.7_
  - [ ]* 19.3 Escribir prueba de propiedad de equivalencia offline y rollback
    - **Property 20: Equivalencia offline y rollback del paquete**
    - **Validates: Requirements 22.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.11, 28.5, 28.6, 28.7, 28.8**
  - [ ]* 19.4 Escribir pruebas Playwright de PWA, offline y actualización
    - Descarga completa e instalable; ciclo completo con red bloqueada; ausencia de requests de juego; reconexión sin mutar Partidas; fallo por recurso/fase; confirmación con Partida abierta; rollback y limpieza tras health check
    - _Requirements: 23.1, 23.3, 23.5, 23.6, 23.8, 23.9_

- [x] 20. Interfaz, tiradas visuales, entrada normalizada y estado de vista
  - [x] 20.1 Implementar contrato de tirada en dos fases y `DiceRollCoordinator`
    - Añadir `DiceRollRequest`, `DiceRollResolution`, `DiceOutcomeProjection` y la rama `awaiting-roll` sin mutación; reanudar el Motor solo con una resolución de uso único ligada a solicitud, Partida, Instantánea y contexto
    - Resolver Automático mediante `VersionedRandom.next`; en Manual validar cada cara ordenada, reservar exactamente el mismo paso, descartar las caras programáticas y persistir `source="manual"`, caras efectivas y resultado interpretado con el mismo siguiente Estado aleatorio
    - Canalizar por el contrato único todas las tiradas actuales y futuras con `RandomDomain.kind === "dice"`, incluidas activación/órdenes, combate, Revelado, Minas y Artillería, sin generación ad hoc en UI o submódulos
    - _Requirements: 19.3, 19.4, 19.5, 19.6, 19.8, 19.12, 19.13, 19.14, 20.2, 41.1, 41.2, 41.3, 41.4, 41.8, 41.9, 41.10, 41.11, 41.12, 41.13, 41.14, 41.15, 41.23, 41.24, 41.31, 41.33, 41.34_
  - [x] 20.2 Implementar adaptadores de entrada e `IntentTranslator`
    - Producir `InteractionIntent` idéntico por dispositivo; eliminar `source` antes de `GameCommand`; alternativa visible a gesto/hover/secundario/rueda/arrastre; Acción irreversible con `selected`→`confirmed`
    - _Requirements: 24.1, 24.2, 24.3, 24.5, 24.10, 24.11, 24.12_
  - [x] 20.3 Implementar `ViewState` independiente y renderizado SVG del mapa
    - Zoom/paneo/orientación/tamaño/lectura como `ViewState` sin tocar `GameState`; mapa SVG responsive con capa semántica sincronizada; conservar selección y estado ante adaptación/orientación
    - _Requirements: 20.8, 24.6, 24.7, 24.8, 24.9, 30.8, 40.10, 40.11_
  - [x] 20.4 Implementar `DiceRollDialog` visual y accesible
    - Renderizar cantidad variable de dados en orden, selector Automático/Manual en cada aparición y última preferencia local fuera de `GameState`; recoger una cara entera por dado en Manual
    - Mostrar `DiceOutcomeProjection` con tabla canónica y fila/columna/intervalo destacados o, sin tabla, objetivo/bases/modificadores/fórmula/comparación, y el efecto obtenido
    - Representar dados propios con rotación hasta cada cara efectiva; hacer commit independiente de `animationend`, soportar `prefers-reduced-motion`, texto/`aria-live`, tacto/ratón/teclado, 44×44, 200 %, vertical/horizontal y funcionamiento offline
    - Cerrar antes de resolver cancela la solicitud sin commit/consumo; cerrar después solo oculta el diálogo sin deshacer el efecto
    - _Requirements: 20.10, 20.11, 20.12, 24.1, 24.2, 24.3, 24.4, 24.5, 24.7, 24.8, 24.12, 25.3, 25.4, 25.5, 25.6, 41.5, 41.6, 41.7, 41.9, 41.10, 41.16, 41.17, 41.18, 41.19, 41.20, 41.21, 41.22, 41.25, 41.26, 41.27, 41.28, 41.29, 41.30, 41.31, 41.32_
  - [x] 20.5 Implementar proyecciones de acciones, registros y selectores es-ES
    - Selector de Misiones solo `published` con nombre propio; alternar registros conservando estado y posición de lectura; expandir/contraer entradas detalladas; `Intl` con locale `es-ES`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 20.9, 32.2, 32.12_
  - [ ]* 20.6 Escribir prueba de propiedad de continuidad y resolución íntegra de tiradas
    - **Property 26: Continuidad y resolución íntegra de tiradas automáticas y manuales**
    - Añadir la etiqueta exacta `// Feature: fields-of-normandy-pwa, Property 26: Continuidad y resolución íntegra de tiradas automáticas y manuales`
    - **Validates: Requirements 19.3, 19.4, 19.5, 19.6, 19.8, 19.12, 19.13, 19.14, 20.2, 20.10, 20.11, 20.12, 24.11, 24.12, 25.6, 41.1, 41.2, 41.3, 41.4, 41.8, 41.9, 41.10, 41.11, 41.12, 41.13, 41.14, 41.15, 41.16, 41.17, 41.19, 41.20, 41.21, 41.22, 41.23, 41.24, 41.25, 41.28, 41.29, 41.31, 41.32, 41.33, 41.34**
  - [ ]* 20.7 Escribir pruebas unitarias, de integración, componente y Playwright de tiradas
    - Inventariar activación 2d6, combate, Revelado 1d6, Minas y Artillería; fallar si cualquier productor evita `DiceRollRequest`
    - Cubrir Automático/Manual, orden y cantidad variable de caras, reserva manual, replay, entrada inválida, reuso/cruce, cierre antes/después, tabla y no-tabla, persistencia de modo/origen y ausencia de bypass
    - Cubrir animación independiente, reducción de movimiento, tacto/ratón/teclado, `aria-live`, 44×44, 200 %, vertical/horizontal, offline y ausencia de solicitudes de red
    - _Requirements: 19.12, 19.13, 19.14, 20.2, 20.10, 20.11, 20.12, 24.1, 24.2, 24.4, 24.7, 24.8, 25.3, 25.4, 25.6, 33.2, 34.6, 35.6, 39.7, 39.8, 39.9, 39.10, 39.15, 39.17, 41.1, 41.4, 41.5, 41.8, 41.9, 41.10, 41.11, 41.12, 41.13, 41.14, 41.15, 41.16, 41.17, 41.18, 41.19, 41.20, 41.21, 41.22, 41.23, 41.24, 41.25, 41.26, 41.27, 41.28, 41.29, 41.30, 41.31, 41.32, 41.33, 41.34_
  - [ ]* 20.8 Escribir prueba de propiedad de equivalencia tacto/ratón
    - **Property 21: Equivalencia entre tacto y ratón**
    - **Validates: Requirements 24.1, 24.2, 24.3, 24.5, 24.11, 24.12**
  - [ ]* 20.9 Escribir prueba de propiedad de estado de vista independiente
    - **Property 22: Estado de vista independiente del dominio**
    - **Validates: Requirements 20.8, 24.6, 24.7, 24.8, 24.9**
  - [ ]* 20.10 Escribir prueba de propiedad de proyección íntegra en es-ES
    - **Property 23: Proyección íntegra en español de España**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.6, 21.3, 25.4, 25.7, 32.2, 32.3, 32.12**

- [~] 21. Accesibilidad y detección de capacidades
  - [x] 21.1 Implementar codificación accesible y `CapabilityDetector`
    - Estado/bando/Orientación/terreno/selección/resultados mediante texto/forma/patrón/icono además de color; objetivos táctiles 44×44 px CSS; nombres accesibles es-ES; instrucciones textuales; comprobar instalación/IndexedDB/SW/tacto y bloquear inicio ante carencia obligatoria conservando exportación
    - _Requirements: 10.7, 24.4, 25.1, 25.4, 25.5, 25.7, 31.3, 31.4, 31.7_
  - [~] 21.2 Implementar animaciones con equivalente persistente en Registro simple
    - Cada animación de cambio de estado tiene entrada persistente y ordenada en Registro simple
    - _Requirements: 25.6_
  - [ ]* 21.3 Escribir pruebas de accesibilidad (axe-core, contraste, 200%)
    - Contraste 4,5:1 / 3:1, foco, nombres accesibles, reflow a 200% sin pérdida, objetivos 44×44, snapshots visuales propios en orientaciones sin capturas del PDF
    - _Requirements: 24.7, 24.8, 25.2, 25.3_

- [~] 22. Checkpoint - PWA, interfaz y accesibilidad
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Control de acceso y Bloqueo local
  - [~] 23.1 Implementar `AccessVerifierRenderer` y CloudFront Function viewer-request
    - Generar función con material verificador versionado inyectado en despliegue (compatible runtime 2.0); exigir HTTP Basic; devolver 401 + `WWW-Authenticate` + `Cache-Control: no-store` sin origen; eliminar cabecera sensible; sin logs ni secretos en repo/S3/bundle
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9_
  - [~] 23.2 Implementar `LocalLock` con verificador local independiente
    - Verificador local con `algorithmVersion`/parámetros/sal/material sin guardar clave recuperable; bloquear al iniciar offline ocultando reglas/Partidas; informar que no cifra IndexedDB/Cache ni revoca copias descargadas
    - _Requirements: 26.10, 26.11, 26.12, 26.13, 26.14_
  - [ ]* 23.3 Escribir pruebas de acceso y ausencia de secretos
    - Auth válida entrega recurso, ausente/incorrecta devuelve 401 sin origen; escaneo de artefactos confirma ausencia de credenciales/cabecera
    - _Requirements: 26.4, 26.6, 26.7_

- [ ] 24. Infraestructura como código (CDK) y hosting seguro
  - [~] 24.1 Implementar stack CDK de S3 privado, OAC y CloudFront
    - Bucket S3 Standard con bloqueo público, propiedad sin ACL, política limitada a distribución/OAC; distribución solo HTTPS con dominio `*.cloudfront.net`; función asociada a `viewer-request`; roles separados síntesis/despliegue vs lectura de origen con permisos mínimos
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.12_
  - [~] 24.2 Implementar plan FREE, presupuesto y exclusiones de coste
    - Declarar suscripción `PricingPlanManager` `CloudFront/FREE` y WAF incluido; Zero spend budget por correo y Avisos de franquicia 50/80/100%; excluir pay-as-you-go, dominio registrado, Lambda@Edge, KMS, DNSSEC, logs facturables, Firehose y canales de pago
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.16, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8_
  - [ ]* 24.3 Escribir pruebas de IaC deterministas (sin desplegar)
    - Snapshot semántico de recursos permitidos, bucket sin acceso público/ACL, OAC y policy limitada, viewer HTTPS sin alias propio, mínimo privilegio y denylist de servicios excluidos, rollback conserva versión válida anterior
    - _Requirements: 27.3, 27.5, 27.7, 27.12, 28.3_

- [ ] 25. Bloqueo de producción fail-closed y observabilidad
  - [~] 25.1 Implementar `ProductionEvidence` y preflight fail-closed
    - Derivar del plan de IaC todas las categorías de operación S3 (admin y lecturas de origen); exigir evidencia vigente de coste 0 € por categoría y 100% del almacenamiento; verificar elegibilidad FREE, sin pay-as-you-go/migración, volumen S3 en crédito, HTTPS, dominio, bloqueo público, OAC, permisos mínimos, recursos excluidos y auth sin exponer secretos; `unknown`=`fail`; regenerar por cambio de IaC/cuenta/precio/condiciones
    - _Requirements: 27.9, 27.10, 27.11, 28.9, 28.10, 28.11, 28.12, 28.13, 28.14, 28.15, 29.9, 29.10, 29.11, 29.12_
  - [~] 25.2 Implementar pipeline por fases y promoción condicionada
    - Fases `build-content`/`test`/`synth`/`preflight`/`deploy-staging`/`verify-staging`/`promote`; solo `promote` crea/actualiza producción con `ProductionEvidence=allow` de la misma ejecución; alertas/franquicia/budget nunca cambian `deny` a `allow`
    - _Requirements: 27.9, 28.12, 28.13, 29.11_
  - [ ]* 25.3 Escribir prueba de propiedad del gate de producción fail-closed
    - **Property 25: Gate de producción fail-closed**
    - **Validates: Requirements 27.9, 27.10, 27.11, 28.3, 28.4, 28.9, 28.10, 28.11, 28.12, 28.13, 28.14, 28.15, 28.16, 29.7, 29.8, 29.11**
  - [ ]* 25.4 Escribir pruebas de mutación del gate y alertas informativas
    - Cada categoría S3 sin evidencia, cobertura parcial, coste positivo, recurso prohibido, permiso excesivo, HTTP o `unknown` produce `deny`; franquicia y budget probados como información, no como prueba de coste
    - _Requirements: 29.9, 29.10, 29.11, 29.12_

- [ ] 26. Matriz de conformidad y segunda revisión visual
  - [~] 26.1 Implementar generación de Matriz de conformidad y gate de aceptación
    - `CatalogCompiler` genera la Matriz y falla ante elementos huérfanos/faltantes/fallidos/no verificados; registrar segunda revisión visual (revisor, fecha, resultado, Referencia de misión) sin guardar páginas/capturas del PDF; asociar cada partida de aceptación con Versión de reglas, Semilla y Versión de guardado
    - _Requirements: 2.1, 2.3, 2.6, 30.9, 30.10, 31.8, 40.4, 40.5_
  - [ ]* 26.2 Escribir pruebas de conformidad y matriz de Entorno probado
    - Cada dato canónico con pruebas contra fixtures aprobados; ocho categorías por Entorno probado (instalación, inicio, sin conexión, tacto, vertical, horizontal, guardado, reanudación) registradas con dispositivo/SO/navegador reales
    - _Requirements: 31.2, 31.5, 31.6, 31.9_

- [ ] 27. Cableado final y verificación de versión candidata
  - [~] 27.1 Integrar UI, aplicación, dominio, persistencia, offline y acceso
    - Conectar `GameCommandDispatcher` → `GameUnitOfWork` → Motor → Invariantes → IndexedDB y proyecciones a UI; verificar que ningún valor lúdico vive en UI ni ramas ad hoc; contenido no publicable permanece bloqueado extremo a extremo
    - _Requirements: 5.1, 20.1, 24.11, 30.1, 30.3, 30.12, 40.12_
  - [ ]* 27.2 Escribir pruebas E2E/contract de flujo completo
    - Contract tests tacto=ratón mismo `GameCommand`; E2E de todas las acciones con un puntero táctil y solo ratón; verificar ausencia de contenido del PDF en el paquete
    - _Requirements: 24.1, 24.2, 24.11, 30.12, 40.12_

- [~] 28. Checkpoint final - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 29. Refactor de conformidad con las normas de desarrollo
  - Aplicar las normas de desarrollo (`docs/normas.md`) al código ya escrito en Tareas 1-8 como refactor no funcional que preserva el comportamiento público
  - Revisar los ficheros más extensos y dividirlos SOLO cuando mezclen más de una abstracción o su tamaño perjudique la comprensión/mantenibilidad; la referencia de ~200-250 líneas es orientativa, no un límite rígido, y un fichero de dominio claro y contenido puede superarla sin dividirse (candidatos a revisar: `src/domain/invariants/invariant-validator.ts`, `src/catalog/compiler/catalog-validator.ts`, `src/catalog/publication/publication-gate.ts`, `src/domain/geometry/map.ts`, `src/domain/geometry/hex-geometry.ts`, `src/domain/engine/rules-engine.ts`), respetando la excepción de ficheros de esquemas/tipos y fixtures de datos (p. ej. `src/catalog/FON-ML-2022/*.ts`, `src/catalog/schemas/catalog.ts`, `src/catalog/schemas/publication.ts`), que no se dividen solo por longitud
  - Mantener las funciones atómicas con cláusulas de guarda y un máximo de 2 niveles de indentación (la guía de ~25-30 líneas es orientativa, no rígida); auditar y refactorizar las que perjudiquen la comprensión
  - Sustituir los alias provisionales `TODO(n.x)` en `src/domain/engine/state.ts` y `src/domain/engine/transition.ts` por los tipos reales donde ya existan (Tareas 5/6/13) o, si aún no hay tipo real, convertir el `TODO` en una nota rastreable conforme a las normas; eliminar cualquier stub/`TODO` fantasma no solicitado
  - Verificar la ausencia de `any`/tipos comodín, de valores mágicos (usar constantes con nombre en inglés) y de errores silenciados
  - Confirmar que es un refactor no funcional: no cambia comportamiento, mantiene verdes `typecheck`, `typecheck:domain` y las pruebas existentes
  - [~] 29.1 Refactor de conformidad del dominio
    - Revisar `src/domain/invariants/invariant-validator.ts`, `src/domain/geometry/map.ts`, `src/domain/geometry/hex-geometry.ts`, `src/domain/engine/rules-engine.ts` y dividirlos SOLO cuando mezclen más de una abstracción o su tamaño perjudique la comprensión/mantenibilidad; limpiar los alias `TODO` de `src/domain/engine/state.ts` y `src/domain/engine/transition.ts`
    - _Requirements: N/A (conformidad con docs/normas.md)_
  - [~] 29.2 Refactor de conformidad del catálogo
    - Revisar `src/catalog/compiler/catalog-validator.ts` y `src/catalog/publication/publication-gate.ts` y dividirlos SOLO cuando mezclen más de una abstracción o su tamaño perjudique la comprensión/mantenibilidad, preservando la excepción de esquemas/tipos y fixtures
    - _Requirements: N/A (conformidad con docs/normas.md)_
  - _Requirements: N/A (conformidad con docs/normas.md)_

## Notes

- Tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido; las tareas de implementación nunca son opcionales.
- Lenguaje de implementación: **TypeScript** (dominio puro, Vitest + fast-check, Playwright + axe-core, CDK TypeScript), según el diseño.
- Cada propiedad se implementa con exactamente una prueba `fast-check`, `numRuns >= 100`, con etiqueta `// Feature: fields-of-normandy-pwa, Property {n}: {texto}`.
- No se resuelven DP-001/DP-002/DP-003 ni se inventan reglas; el contenido dependiente permanece en Estado no publicable mediante el Publication Gate.
- No se copia contenido del PDF, no hay campañas ni sincronización, y no se asume cobertura de coste cero: el `ProductionGate` es fail-closed.
- Los checkpoints permiten validación incremental antes de continuar.
- La Tarea 29 aplica las normas de desarrollo (`docs/normas.md`) al código ya escrito como refactor no funcional: divide ficheros y funciones que superan los límites, limpia alias `TODO` provisionales y verifica ausencia de `any`/valores mágicos/errores silenciados sin cambiar el comportamiento ni romper las pruebas existentes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "3.2", "3.3"] },
    { "id": 1, "tasks": ["2.2", "2.5", "3.4", "5.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "5.2", "6.2", "6.3", "7.2", "7.3"] },
    { "id": 3, "tasks": ["5.3", "8.1", "8.2", "8.3"] },
    { "id": 4, "tasks": ["8.4", "8.5", "8.6", "9.1", "9.2", "9.3", "10.1", "10.2"] },
    { "id": 5, "tasks": ["9.4", "10.3", "10.4", "10.5", "11.1", "11.2"] },
    { "id": 6, "tasks": ["11.3", "11.4", "11.5", "13.1"] },
    { "id": 7, "tasks": ["13.2", "14.1", "15.1"] },
    { "id": 8, "tasks": ["15.2", "16.1"] },
    { "id": 9, "tasks": ["15.3", "15.4", "16.2", "16.3"] },
    { "id": 10, "tasks": ["15.5", "15.6", "15.7", "16.4", "16.5", "16.6", "17.1"] },
    { "id": 11, "tasks": ["19.1", "23.1", "24.1"] },
    { "id": 12, "tasks": ["19.2", "23.2", "24.2"] },
    { "id": 13, "tasks": ["19.3", "19.4", "20.1", "20.2", "20.3", "23.3", "24.3", "25.1"] },
    { "id": 14, "tasks": ["20.4", "20.5", "21.1", "21.2", "25.2"] },
    { "id": 15, "tasks": ["20.6", "20.7", "20.8", "20.9", "20.10", "21.3", "25.3", "25.4", "26.1"] },
    { "id": 16, "tasks": ["26.2", "27.1"] },
    { "id": 17, "tasks": ["27.2"] },
    { "id": 18, "tasks": ["29.1", "29.2"] }
  ]
}
```
