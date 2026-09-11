# Requisitos — Fields of Normandy (el juego)

Requisitos del **juego jugable**. Asumen las librerías ya construidas
(`src/domain`, `src/application`, `src/adapters`, `src/catalog`,
`infrastructure/`). El criterio de aceptación es la jugabilidad, no las pruebas.

Se usa la convención EARS: LA/EL `<sistema>` DEBERÁ `<respuesta>`; CUANDO
`<evento>`; SI `<condición>` ENTONCES; MIENTRAS `<estado>`.

## Alcance

El juego permite jugar en solitario, en `es-ES`, las misiones de `FON-ML-2022`,
con el flujo completo del reglamento. Una misión solo es jugable cuando su mapa
está transcrito y revisado (DP-001). El juego no copia prosa ni arte del PDF.

## Glosario adicional

- **Comando de juego:** acción tipada que el jugador emite (avanzar turno,
  activar unidad, dar una orden, resolver fase alemana).
- **Catálogo ejecutable:** vista de reglas (`RulesCatalogView`) con funciones
  `matches`/`apply`/`roll` que el motor ejecuta, construida a partir de las
  políticas de dominio y de los datos canónicos.
- **Orquestador de partida:** componente que encadena los pasos del turno e
  invoca la evaluación de desenlace.
- **Turn Tracker:** contador de turnos de la misión; su llenado cierra la partida.
- **Colocación inicial:** situación de las fichas británicas y alemanas fijas en
  sus hexágonos de salida al preparar la misión.
- **Briefing:** texto propio (no del PDF) que ambienta y explica una misión.

## Requisito 1: Catálogo de reglas ejecutable

**Historia:** como jugador, quiero que las reglas del juego se apliquen de
verdad al jugar, para que mis acciones tengan efecto según `FON-ML-2022`.

1. EL juego DEBERÁ construir un catálogo ejecutable (`RulesCatalogView`) a partir
   de las políticas de dominio (`src/domain/rules`) y de los datos canónicos.
2. EL catálogo ejecutable DEBERÁ cubrir las acciones del flujo: avanzar turno,
   activar unidad, Avanzar, Fuego, Granada, Cobertura, Rally, Explorar y resolver
   la fase alemana.
3. CUANDO el motor reciba un comando de juego, EL motor DEBERÁ resolverlo con la
   regla ejecutable correspondiente, sin reglas de prueba.
4. SI una acción requiere una regla no cubierta por el catálogo ejecutable,
   ENTONCES EL juego DEBERÁ rechazarla con un mensaje `es-ES`, sin inventar
   efectos.

## Requisito 2: Comandos de juego tipados

1. EL juego DEBERÁ definir un comando tipado por cada acción del flujo, con su
   `payload` propio (no un registro opaco).
2. CUANDO el jugador interactúe con la interfaz, EL juego DEBERÁ traducir la
   interacción en el comando tipado correspondiente, eliminando la modalidad de
   entrada.
3. SI un comando llega con un `payload` inválido, ENTONCES EL juego DEBERÁ
   rechazarlo sin mutar el estado de partida.

## Requisito 3: Colocación inicial

1. CUANDO el jugador prepare una misión con mapa transcrito, EL juego DEBERÁ
   colocar las fuerzas británicas en los hexágonos de salida definidos por la
   misión.
2. EL juego DEBERÁ colocar las unidades alemanas fijas y las incógnitas según la
   preparación de la misión.
3. SI el mapa de una misión no está transcrito y revisado (DP-001 pendiente),
   ENTONCES EL juego DEBERÁ mantener la misión como no jugable y explicarlo.
4. CUANDO la preparación requiera una elección del jugador (p. ej. borde de
   entrada), EL juego DEBERÁ ofrecer solo las opciones definidas por la misión.

## Requisito 4: Bucle de turno

1. EL juego DEBERÁ ejecutar el turno en el orden del reglamento: fase británica
   antes que la alemana.
2. CUANDO comience la fase británica, EL juego DEBERÁ permitir activar cada
   unidad británica una a una.
3. CUANDO se active una unidad, EL juego DEBERÁ resolver una tirada de 2d6 y
   presentar las órdenes disponibles según la Tabla de órdenes de esa unidad.
4. DONDE la tirada sea un doble, EL juego DEBERÁ permitir repetir ambos dados si
   el jugador lo desea.
5. CUANDO la unidad tenga moral normal, EL juego DEBERÁ permitir ejecutar la
   primera y la segunda orden, en ese orden.
6. MIENTRAS la unidad tenga moral baja, EL juego DEBERÁ limitar la activación a
   la primera orden.
7. CUANDO concluya la fase británica, EL juego DEBERÁ resolver la fase alemana.
8. CUANDO concluya la fase alemana, EL juego DEBERÁ evaluar el desenlace y, si la
   partida continúa, avanzar el Turn Tracker.

## Requisito 5: Órdenes

1. CUANDO el jugador ordene Avanzar, EL juego DEBERÁ mover la unidad un hexágono
   hacia delante y revelar las unidades alemanas en hexágonos adyacentes.
2. CUANDO el jugador ordene Fuego, EL juego DEBERÁ resolver 2d6 contra el valor
   para impactar del arma, aplicando los modificadores de terreno y situación.
3. CUANDO el jugador ordene Granada, EL juego DEBERÁ exigir 6+ sin modificadores.
4. CUANDO el jugador ordene Cobertura, EL juego DEBERÁ añadir un marcador de
   cobertura a la unidad.
5. CUANDO el jugador ordene Rally, EL juego DEBERÁ retirar el marcador de moral
   baja de la unidad.
6. CUANDO el jugador ordene Explorar con una escuadra, EL juego DEBERÁ revelar
   una posición enemiga a distancia 2.
7. SI la unidad no admite una orden (p. ej. Explorar con Equipo MG/Mortero/PIAT),
   ENTONCES EL juego DEBERÁ no ofrecerla.

## Requisito 6: Revelado del enemigo

1. CUANDO se dispare un revelado, EL juego DEBERÁ tirar en la Tabla de revelado
   de la misión y sustituir la incógnita por su resultado en el mismo hexágono.
2. EL juego DEBERÁ orientar la unidad revelada hacia la unidad que la reveló.
3. CUANDO el revelado produzca una mina, EL juego DEBERÁ resolver su ataque
   inmediato sin bonificaciones de defensa.

## Requisito 7: Fase alemana

1. CUANDO se resuelva la fase alemana, EL juego DEBERÁ hacer que cada unidad
   alemana revelada dispare a las británicas en su zona de fuego.
2. EL juego DEBERÁ aplicar la artillería contra las británicas sin cobertura.
3. EL juego DEBERÁ aplicar los ataques de mina a las unidades dentro del campo.
4. CUANDO una británica sea impactada, EL juego DEBERÁ bajar su moral o, si ya
   estaba baja, eliminarla.
5. EL juego DEBERÁ no aplicar bonificación de flanqueo a las unidades alemanas.

## Requisito 8: Desenlace

1. EL juego DEBERÁ evaluar el objetivo de la misión tras cada fase que pueda
   cumplirlo.
2. CUANDO el objetivo se cumpla, EL juego DEBERÁ declarar la victoria.
3. CUANDO el Turn Tracker se llene sin cumplirse el objetivo, EL juego DEBERÁ
   declarar la derrota.
4. EL juego DEBERÁ aplicar únicamente el objetivo de la misión seleccionada.

## Requisito 9: Contenido de misión

1. CADA misión DEBERÁ tener nombre visible `es-ES`, objetivo y duración
   seleccionable (base−1/base/base+1).
1b. DONDE una misión disponga de briefing propio, EL juego DEBERÁ mostrarlo; el
   briefing es OPCIONAL y su ausencia NO DEBERÁ impedir jugar la misión.
2. CADA misión jugable DEBERÁ tener mapa transcrito y revisado, fuerzas, tabla de
   revelado y colocación inicial.
3. EL juego DEBERÁ presentar el objetivo y el briefing antes de empezar la misión.
4. SI una misión carece de contenido obligatorio, ENTONCES EL juego DEBERÁ
   mostrarla como no jugable con la razón.

## Requisito 9b: Misión de demostración

**Historia:** como desarrollador y como jugador, quiero una misión de
demostración propia e independiente de las 15 misiones de `FON-ML-2022`, para
validar y aprender todos los aspectos del juego sin depender de la transcripción
del PDF.

1. EL juego DEBERÁ incluir una misión de demostración con mapa, fuerzas,
   colocación y objetivo PROPIOS, no derivados de `FON-ML-2022`.
2. LA misión de demostración DEBERÁ ejercitar todos los aspectos del juego:
   colocación, movimiento, revelado/visibilidad, Fuego, Granada, Cobertura,
   Rally, Explorar, fase alemana (incluida artillería y minas) y desenlace.
3. LA misión de demostración DEBERÁ estar claramente marcada como demostración y
   NO DEBERÁ contarse entre las quince misiones canónicas.
4. LA misión de demostración DEBERÁ ser jugable sin ningún paso humano de
   transcripción, para servir de banco de pruebas del bucle completo.

## Requisito 10: Interfaz jugable

1. EL juego DEBERÁ arrancar en un navegador y en un iPad estándar como PWA
   instalable.
2. EL juego DEBERÁ presentar el mapa, las unidades, las órdenes disponibles, el
   diálogo de tirada y los registros.
3. EL juego DEBERÁ permitir jugar por completo con tacto, ratón y teclado de
   forma equivalente.
4. EL juego DEBERÁ conservar la partida y permitir reanudarla.

## Requisito 11: Tutorial de la misión 1

1. CUANDO el jugador inicie por primera vez la misión de aprendizaje (la de
   demostración durante el desarrollo, y la misión 1 cuando esté transcrita),
   EL juego DEBERÁ ofrecer un tutorial guiado.
2. EL tutorial DEBERÁ enseñar, paso a paso, colocación, avance de turno,
   activación, tirada de órdenes, una orden de Fuego, un revelado y la condición
   de victoria.
3. EL tutorial DEBERÁ poder omitirse y no DEBERÁ alterar las reglas de la misión.

## Requisito 12: Transcripción de mapas (paso humano)

1. EL juego DEBERÁ ofrecer una herramienta para transcribir el mapa de una
   misión: hexágonos, terreno, conexiones, entradas y colocación.
2. DONDE el jugador aporte una imagen de la página de mapa, LA herramienta
   DEBERÁ permitir superponerla como referencia.
3. LA herramienta DEBERÁ exigir una segunda revisión visual antes de marcar el
   mapa como revisado (DP-001 resuelto).
4. CUANDO la transcripción se apruebe, EL juego DEBERÁ pasar la misión a jugable.

## Requisito 13: Despliegue reproducible

1. EL despliegue DEBERÁ ser ejecutable por el propietario con instrucciones paso
   a paso, con el perfil AWS `casa`.
2. EL proyecto DEBERÁ ofrecer un procedimiento de borrado (teardown) documentado
   que no afecte a las partidas locales del navegador.
3. EL despliegue y el borrado DEBERÁN poder repetirse sin residuos.

## Requisito 14: Estado y continuidad del desarrollo

1. EL proyecto DEBERÁ mantener un registro de estado vivo (`ESTADO.md`) que
   permita pausar y retomar el desarrollo.
2. CUANDO se complete o pause una fase, EL registro DEBERÁ reflejar qué está
   hecho y dónde continuar.

## Pasos humanos (no automatizables)

- Aportar imágenes de las páginas de mapa del PDF para transcribir.
- Realizar la segunda revisión visual de cada mapa (DP-001).
- Aprobar los textos propios (nombre, objetivo, briefing).
- Ejecutar el despliegue y el borrado para validarlos en persona.
