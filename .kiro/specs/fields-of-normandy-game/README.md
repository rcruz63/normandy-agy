# Spec: Fields of Normandy — el juego

Esta especificación trata de **construir el juego jugable**, usando como
librerías las capas técnicas ya construidas en `src/` (dominio de reglas,
aleatoriedad, invariantes, persistencia, catálogo) y en `infrastructure/`.

Es una spec distinta de `fields-of-normandy-pwa`, que definió y construyó esas
capas. Aquí el foco no es "código correcto y probado", sino **un producto que se
puede jugar**.

## Documentos

- [`ESTADO.md`](ESTADO.md) — registro vivo para pausar y retomar. **Empezar aquí.**
- [`requirements.md`](requirements.md) — qué debe cumplir el juego jugable.
- [`design.md`](design.md) — cómo se ensambla el juego sobre las librerías.
- [`tasks.md`](tasks.md) — plan de trabajo con pasos humanos y criterio de éxito.

## Criterio de éxito (único)

El juego es un éxito cuando **se puede jugar en un navegador o iPad**:

- Las **15 misiones** son jugables (o marcadas honestamente como pendientes de
  transcripción mientras no lo estén).
- Cada misión tiene **textos** (nombre, objetivo, briefing propio).
- El **flujo completo** funciona: colocación → turnos → activación con órdenes →
  Fuego/Avanzar/Explorar/etc. → revelado del enemigo → fase alemana → victoria o
  derrota.
- La **misión 1 incluye un tutorial** que enseña a jugar.

Las pruebas verdes **no** son el criterio de éxito. Son un medio. El criterio es
la jugabilidad, verificada con pruebas de partida completa (Playwright).

## Por qué esta spec existe

La spec original construyó las piezas del juego como módulos independientes y
verificó que cada una funciona aislada, pero **nunca ensambló el juego**: no hay
comandos de juego, ni un catálogo de reglas ejecutable, ni un bucle de partida,
ni interfaz de arranque, ni mapas. El resultado fue "cubiertos sin comida".

Esta spec corrige el encuadre: el objetivo es la comida (el juego), y los
cubiertos (las librerías) ya están.

## Relación con la fuente y el fail-closed

Se mantiene el respeto a `FON-ML-2022`: no se copia prosa ni arte del PDF; los
textos son propios; los mapas se transcriben con segunda revisión visual
(DP-001) antes de considerarse canónicos. Una misión sin mapa transcrito
permanece bloqueada, pero el juego ofrece contenido jugable (misión demo o
misiones ya transcritas) para no estar vacío.
