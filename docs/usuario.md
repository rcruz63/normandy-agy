# Guía de usuario

Cómo se juega a Fields of Normandy. Pensada para leerse antes de la primera
partida: explica el objetivo, las piezas, las mecánicas y las quince misiones.

> El juego reproduce las reglas verificadas de la edición de Mike Lambo de 2022
> «The Fields of Normandy: A Solitaire Wargame» (`FON-ML-2022`). Aquí se resumen
> las mecánicas para poder jugar; no se copia el texto del libro.

## Índice

- [Objetivo del juego](#objetivo-del-juego)
- [Cómo se juega](#como-se-juega)
- [El mapa y las piezas](#el-mapa-y-las-piezas)
- [Unidades](#unidades)
- [El turno](#el-turno)
- [Órdenes](#ordenes)
- [Moral](#moral)
- [Combate](#combate)
- [Terreno](#terreno)
- [Revelado del enemigo](#revelado-del-enemigo)
- [Minas y artillería](#minas-y-artilleria)
- [Tiradas de dados: automático o manual](#tiradas-de-dados-automatico-o-manual)
- [Registros](#registros)
- [Las quince misiones](#las-quince-misiones)
- [Guardar, reanudar y trasladar partidas](#guardar-reanudar-y-trasladar-partidas)

## Objetivo del juego

Es un juego **en solitario**. Controlas un pequeño grupo de fuerzas británicas
y te enfrentas a unidades alemanas que empiezan **ocultas** sobre el mapa. Cada
misión tiene su propio objetivo y un número limitado de turnos.

Ganas si cumples el objetivo de la misión **y lo mantienes hasta el último turno
inclusive**. Si al terminar los turnos no se cumple, es derrota. Los objetivos
concretos varían por misión (eliminar al enemigo, ocupar un hexágono, destruir
la artillería): ver [Las quince misiones](#las-quince-misiones).

## Cómo se juega

1. **Elige una misión** en el selector. Solo aparecen las misiones publicables.
2. **Elige la duración**: cada misión ofrece tres opciones (turnos base menos
   uno, base, o base más uno). Menos turnos es más difícil.
3. **Juega por turnos**: activa tus unidades, da órdenes, resuelve combates y
   revela al enemigo, hasta cumplir el objetivo o agotar los turnos.
4. Cada acción con dados abre un diálogo de tirada; cada resultado queda en el
   registro.

Toda acción que consume aleatoriedad o aplica un cambio no cancelable es
**irreversible**: se confirma explícitamente antes de aplicarse.

## El mapa y las piezas

El tablero es un **mapa hexagonal**. Cada hexágono es una casilla con un tipo de
terreno. Las fichas tienen una **orientación** (hacia dónde miran), lo que
define sus «direcciones hacia delante» (los tres hexágonos frontales).

La información de estado (unidad, bando, orientación, terreno, selección,
resultados) se representa con texto, forma, patrón e icono además de color, para
que sea legible sin depender del color.

## Unidades

### Británicas (las tuyas)

| Unidad | Notas |
|---|---|
| Escuadra de fusileros | Identificada por letra (A a C según la misión). La unidad versátil. |
| Equipo MG | Ametralladora. Valor base de Fuego 6+. No tiene la orden Explorar. |
| Mortero | Arma de apoyo. |
| PIAT | Arma anticarro. Única capaz de atacar a la Semioruga (con apoyo). |

### Alemanas (el enemigo)

| Unidad | Notas |
|---|---|
| Fusileros | Infantería básica. |
| LMG | Ametralladora ligera. Ataque 6+. |
| HMG | Ametralladora pesada. Ataque 5+. |
| Artillería | Objetivo de la misión 11. Puede batir a distancia. |
| Semioruga | Vehículo. Solo la ataca el PIAT con apoyo. |

## El turno

Dentro de cada turno se resuelve **primero la fase británica y luego la
alemana**. Las unidades se activan **una a una**. Al activar una unidad tiras en
la Tabla de órdenes para saber qué órdenes puede ejecutar.

## Órdenes

La **Tabla de órdenes** tiene seis filas (una por cada cara de un d6) para cada
tipo de unidad británica. El resultado da una **primera** y una **segunda**
orden. Las órdenes básicas incluyen:

- **Avanzar**: mover un hexágono en las direcciones hacia delante. Las británicas
  pueden apilarse; avanzar retira la cobertura y revela incógnitas adyacentes.
- **Fuego**: atacar a un enemigo dentro de la zona de fuego.
- **Granada**: ataque a corta distancia; excluye modificadores.
- **Cobertura**: mejora la defensa mientras la unidad no se mueva.
- **Explorar**: inspeccionar a distancia 2. Solo las escuadras de fusileros;
  el Equipo MG, el Mortero y el PIAT no pueden Explorar.

## Moral

Cada unidad británica tiene moral **normal** o **baja**:

- **Normal**: puede resolver las dos órdenes obtenidas si eliges ambas.
- **Baja**: se limita a la primera orden obtenida en esa activación. Un impacto
  adicional la elimina.

Un impacto baja la moral de normal a baja; otro impacto sobre moral baja elimina
la unidad. Reagrupar puede restaurar la moral, pero aun así la activación en
curso queda limitada a la primera orden.

## Combate

El combate se resuelve con **2d6**. Sumas el valor de la tirada más los
modificadores permitidos y comparas contra el **valor para impactar** del
atacante (por ejemplo, HMG 5+, LMG 6+, Equipo MG en Fuego 6+).

- Los modificadores se suman algebraicamente y el resultado no depende del orden
  en que se apliquen.
- **Granada** y **Mina** excluyen modificadores.
- El **PIAT** limita sus objetivos y no recibe el +2 por edificio.

## Terreno

El terreno modifica las resoluciones. Influyen el **bosque**, el **edificio**,
la **colina** y el **río** (con su condición de cruce). La cobertura por terreno
o posición ajusta la defensa.

## Revelado del enemigo

El enemigo empieza como **incógnitas** (`?`). Cuando se produce un revelado, la
incógnita se sustituye en el mismo hexágono por el resultado de la **Tabla de
revelado** de la misión (una unidad alemana o una mina), tirando un d6. La
unidad revelada se orienta según la regla de la misión.

Antes del revelado, su contenido permanece oculto: no puedes ver qué hay hasta
revelarlo (avanzando junto a ella, explorando, etc.).

## Minas y artillería

- **Minas**: se prueban con **2d6, 7+** sin modificadores. La mina es
  persistente; explorar no dispara la prueba de inmediato.
- **Artillería**: bate a las británicas con **10+**, salvo que estén en bosque,
  edificio o cobertura, y sin flanqueo. Puede eliminarse (es el objetivo de la
  misión 11).

## Tiradas de dados: automático o manual

Cada tirada te deja elegir el modo en el momento:

- **Automático**: la aplicación genera las caras con su generador aleatorio
  reproducible.
- **Manual**: tiras tus **dados físicos** e introduces las caras en orden. La
  aplicación reserva exactamente el mismo paso aleatorio, así que el registro y
  la continuidad de la partida quedan intactos.

En ambos casos el diálogo muestra el cálculo (tabla aplicada, o objetivo, bases,
modificadores, fórmula y comparación) y el efecto obtenido. Puedes elegir modo
en cada tirada; se recuerda tu última preferencia localmente.

## Registros

Cada partida mantiene dos historiales:

- **Registro simple**: resumen en español de acciones y resultados relevantes.
- **Registro detallado**: traza de depuración con tiradas, objetivos,
  modificadores, fórmulas, resultados y trazabilidad aleatoria.

Puedes alternar entre ambos sin perder la posición de lectura.

## Las quince misiones

Cada misión indica sus turnos base; la duración jugable es base−1, base o base+1.

| # | Nombre | Turnos base | Objetivo |
|---|--------|:-----------:|----------|
| 1 | Control del bosque I | 4 | Eliminar la única unidad alemana revelada |
| 2 | Control del bosque II | 5 | Revelar y eliminar todas las unidades alemanas |
| 3 | Control del edificio | 6 | Revelar y eliminar todas las unidades alemanas |
| 4 | Control de la colina | 6 | Revelar y eliminar todas las unidades alemanas |
| 5 | Control de la zona I | 6 | Revelar y eliminar todas las unidades alemanas |
| 6 | Control de la zona II | 6 | Revelar y eliminar todas las unidades alemanas |
| 7 | Control de la aldea I | 7 | Revelar y eliminar todas las unidades alemanas |
| 8 | Entrada en la iglesia | 8 | Ocupar el hexágono de la iglesia con cualquier unidad británica |
| 9 | Control de la aldea II | 8 | Revelar y eliminar todas las unidades alemanas |
| 10 | Control del bosque III | 8 | Revelar y eliminar todas las unidades alemanas |
| 11 | Neutralizar la artillería alemana | 8 | Destruir la artillería alemana |
| 12 | Control de la aldea III | 8 | Revelar y eliminar todas las unidades alemanas |
| 13 | Jornada adversa | 8 | Revelar y eliminar todas las unidades alemanas |
| 14 | Periferia de Caen | 8 | Ocupar el hexágono de la iglesia con cualquier unidad británica |
| 15 | Control de la ciudad de Caen | 8 | Revelar y eliminar todas las unidades alemanas |

## Guardar, reanudar y trasladar partidas

- Cada partida se guarda **localmente** en tu dispositivo, de forma
  independiente. Puedes tener varias a la vez.
- Puedes **reanudar** una partida exactamente donde la dejaste, con su estado
  aleatorio incluido.
- No hay sincronización entre dispositivos. Para llevar una partida a otro
  dispositivo, **expórtala** e **impórtala** manualmente. La exportación lleva
  una suma de integridad para detectar alteraciones accidentales.

> Nota: instalar y jugar sin conexión requiere el empaquetado web de la PWA, que
> todavía está pendiente. Ver [`estado.md`](estado.md).
