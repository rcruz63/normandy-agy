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

## Estado del proyecto

**Fase actual:** planificación completada; implementación en curso.

Este README se mantiene vivo: refleja por dónde vamos entre sesiones. El
desarrollo no se completará en una sola sesión.

- Especificación: **completa** (requisitos, diseño y plan de tareas aprobados).
- Implementación: **8 de 28 tareas** completadas.

Última actualización: 9 de septiembre de 2026.

### Progreso por tarea

Leyenda: ⬜ pendiente · 🟦 en curso · ✅ completada

| # | Tarea | Estado |
|---|-------|--------|
| 1 | Estructura del proyecto, puertos y tipos base del dominio | ✅ |
| 2 | Catálogo canónico, esquemas y Publication Gate (fail-closed) | ✅ |
| 3 | Fixtures canónicos verificados de las quince misiones | ✅ |
| 4 | Checkpoint - Catálogo y publicación | ✅ |
| 5 | Geometría hexagonal y modelos de mapa/ficha | ✅ |
| 6 | Aleatoriedad reproducible versionada | ✅ |
| 7 | Estado de partida, transición y validador de invariantes | ✅ |
| 8 | Motor de reglas: contrato de transición y precedencia canónica | ✅ |
| 9 | Submódulos de reglas: turno, órdenes y Moral | ⬜ |
| 10 | Submódulos de reglas: combate, cobertura, terreno y especiales | ⬜ |
| 11 | Submódulos de reglas: Revelado, Misión y desenlace | ⬜ |
| 12 | Checkpoint - Motor de reglas completo | ⬜ |
| 13 | Registros estructurados y proyector es-ES | ⬜ |
| 14 | Determinismo del replay del Motor | ⬜ |
| 15 | Persistencia IndexedDB y atomicidad | ⬜ |
| 16 | Exportación, importación y migraciones | ⬜ |
| 17 | Incompatibilidad de versiones y diagnósticos de recuperación | ⬜ |
| 18 | Checkpoint - Persistencia, copia y migración | ⬜ |
| 19 | Paquete sin conexión y actualización segura | ⬜ |
| 20 | Interfaz, entrada normalizada y estado de vista | ⬜ |
| 21 | Accesibilidad y detección de capacidades | ⬜ |
| 22 | Checkpoint - PWA, interfaz y accesibilidad | ⬜ |
| 23 | Control de acceso y Bloqueo local | ⬜ |
| 24 | Infraestructura como código (CDK) y hosting seguro | ⬜ |
| 25 | Bloqueo de producción fail-closed y observabilidad | ⬜ |
| 26 | Matriz de conformidad y segunda revisión visual | ⬜ |
| 27 | Cableado final y verificación de versión candidata | ⬜ |
| 28 | Checkpoint final - Ensure all tests pass | ⬜ |

## Arquitectura (resumen)

- **Dominio TypeScript puro**: motor de reglas determinista y data-driven, sin
  dependencias de DOM, IndexedDB, red, reloj ni SDK de AWS.
- **Aplicación**: casos de uso, exclusión mutua por partida, atomicidad y
  puertos.
- **Adaptadores de navegador**: IndexedDB, Cache API, ficheros, capacidades y
  entradas de usuario.
- **Catálogo canónico**: datos serializables trazables a `FON-ML-2022` con
  bloqueo de publicación fail-closed.
- **Interfaz** adaptable y accesible en `es-ES`, con equivalencia tacto/ratón.
- **Infraestructura como código** (CDK): S3 privado con OAC, CloudFront con
  HTTP Basic vía CloudFront Function, y bloqueo de producción sin evidencia de
  coste cero.

## Stack técnico

- TypeScript (dominio puro)
- Vitest + fast-check (pruebas unitarias y basadas en propiedades)
- Playwright + axe-core (PWA, offline y accesibilidad)
- AWS CDK (TypeScript) para la infraestructura

## Flujo de trabajo con Git

Al completar cada tarea de la especificación se realiza automáticamente un
commit y un push a `origin/main`. La identidad de autoría es la personal
configurada en el repositorio local.

## Documentación de la especificación

La especificación vive en `.kiro/specs/fields-of-normandy-pwa/`
(requisitos, diseño y plan de tareas).

## Licencia

Código bajo licencia [MIT](LICENSE). La licencia MIT cubre el código propio de
este repositorio; **no** cubre el contenido del juego `FON-ML-2022`, que sigue
sujeto a los derechos de su autor.
