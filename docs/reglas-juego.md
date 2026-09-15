# Fields of Normandy (Mike Lambo, 2022)
## Manual de Reglas Oficiales y Referencia del Sistema

Este documento recopila de forma íntegra y fidedigna las reglas del juego de mesa original en solitario **Fields of Normandy** (diseñado por Mike Lambo, 2022), extraídas directamente del manual original (`docs/1001553900-1727232348850090.pdf`).

Sirve como especificación canónica para contrastar y validar la lógica del motor digital, corrigiendo cualquier desviación o malentendido introducido durante desarrollos previos.

---

## 1. Visión General del Juego

* **Ambientación:** Campaña de Normandía (1944). El jugador comanda fuerzas británicas (elementos del *6th Royal Scots Fusiliers*).
* **Bando enemigo:** Fuerzas alemanas atrincheradas (en el código etiquetadas con prefijo `DE`, de *Deutschland*).
* **Modalidad:** Juego táctico en solitario sobre mapa hexagonal.
* **Objetivo de Misión:** Cada escenario establece una condición de victoria obligatoria (por ejemplo, en la Misión 01: descubrir y eliminar a la fuerza enemiga oculta en el bosque) dentro de un límite estricto de turnos en el *Turn Tracker* (4 turnos en la Misión 01).
* **Condición de victoria:** Se gana inmediatamente en el momento en que se cumple el objetivo de la misión.
* **Condición de derrota:** Se pierde si concluye el último turno del *Turn Tracker* sin haber cumplido el objetivo, o si todas las unidades británicas son eliminadas.

---

## 2. El Proceso del Turno (The Turn Process)

Cada turno sigue estrictamente la siguiente secuencia (Manual, pág. 6 y 14):

### Paso 1: Contador de turnos (Turn Tracker)
El jugador avanza el marcador en el *Turn Tracker*. La partida comienza en el Turno 1 y tiene una duración limitada por escenario (ej. Turnos 1 a 4).

### Paso 2 y 3: Activación Británica (Fase Británica)
Las unidades británicas se activan **una a una** en el orden que el jugador elija.  
Para cada unidad británica:

1. **Tirada de 2 dados (2d6):** El jugador lanza 2 dados de seis caras.
2. **Selección de la Fila de Órdenes (Regla de Oro de Mike Lambo, Pág. 6):**
   * El jugador **elige el resultado de UNO solo de los dos dados** (el otro dado se descarta).
   * La cara del dado elegido selecciona la **Fila correspondiente** en la *Tabla de Órdenes* de esa unidad.
   * **Tirada de Dobles (ej. 3 y 3):** Si los dos dados muestran el mismo número, el jugador tiene dos opciones:
     * Aceptar esa fila correspondiente al número obtenido.
     * O bien **relanzar ambos dados** para intentar obtener órdenes más favorables (puede repetirse indefinidamente mientras sigan saliendo dobles).
3. **Ejecución de las Órdenes de la Fila:**
   * Cada fila contiene dos columnas de órdenes: **Columna 1** y **Columna 2**.
   * **Moral Normal:** La unidad puede realizar:
     * Solo la orden de la Columna 1.
     * Solo la orden de la Columna 2.
     * O **ambas órdenes en orden**: primero la de la Columna 1 y después la de la Columna 2.
     * O no realizar ninguna orden (descartar).
   * **Moral Baja:** La unidad **solo puede realizar la orden de la Columna 1** (o descartar). La Columna 2 queda inhabilitada.
4. **Finalización:** Una vez ejecutadas las órdenes deseadas (o descartadas), la activación de esa escuadra concluye y se pasa a activar a la siguiente escuadra británica.

> [!IMPORTANT]
> ### Diferencia Crítica: Regla Real de Lambo vs. Error de Kiro
> * **Error de Kiro:** Kiro especificó erróneamente en el requisito 34.7 que el Dado 1 correspondía a la Columna 1 y el Dado 2 a la Columna 2 (*"cruzar dados"*). Eso provocaba mezclas imposibles (como que una tirada de 6 y 4 diera Reagrupar o combinaciones absurdas que no existen en el juego).
> * **Regla Real de Mike Lambo:** Se tiran 2 dados para dar flexibilidad táctica al jugador, quien **elige uno de los dos dados**. El dado elegido determina la **fila completa** (sus 2 órdenes en secuencia).

---

## 3. Tabla Oficial de Órdenes Británicas (British Orders Chart)

Cada tipo de unidad británica dispone de su propia tabla de 6 filas (Manual, págs. 6, 11-13 y 16-20):

### Escuadras de Fusileros (Rifle Squads)
| d6 | Columna 1 | Columna 2 | Descripción táctica |
|:--:|:---------:|:---------:|:-------------------|
| **1** | **RAL** (Reagrupar) | **GRE** (Granada) | Recuperar moral y/o asaltar con granadas |
| **2** | **ADV** (Avanzar) | **SCO** (Explorar) | Avanzar 1 hexágono y/o revelar posición a distancia 2 |
| **3** | **ADV** (Avanzar) | **COV** (Cobertura) | Avanzar 1 hexágono y ponerse a cubierto (+1 defensa) |
| **4** | **FIRE** (Fuego) | **COV** (Cobertura) | Abrir fuego contra enemigo adyacente y cubrirse |
| **5** | **FIRE** (Fuego) | **ADV** (Avanzar) | Disparar primero y luego avanzar |
| **6** | **ADV** (Avanzar) | **FIRE** (Fuego) | Avanzar primero y luego disparar |

### Equipos de Ametralladora (MG Teams - desde Misión 4)
| d6 | Columna 1 | Columna 2 |
|:--:|:---------:|:---------:|
| **1** | **RAL** (Reagrupar) | **ADV** (Avanzar) |
| **2** | **ADV** (Avanzar) | **COV** (Cobertura) |
| **3** | **ADV** (Avanzar) | **COV** (Cobertura) |
| **4** | **COV** (Cobertura) | **FIRE** (Fuego) |
| **5** | **FIRE** (Fuego) | **COV** (Cobertura) |
| **6** | **FIRE** (Fuego) | **COV** (Cobertura) |

---

## 4. Descripción Detallada de las Órdenes

### Avanzar (ADV - Advance)
* La unidad se desplaza **exactamente 1 hexágono** hacia delante (hacia arriba en el mapa; no se permite retroceder).
* Puede entrar en hexágonos ocupados por otras unidades británicas (sin límite de apilamiento).
* **No puede entrar** en hexágonos ocupados por unidades alemanas activas.
* **Revelado automático:** Si el hexágono al que avanza es adyacente a una incógnita (`?`), dicha incógnita se revela inmediatamente. La nueva unidad enemiga se coloca encarada hacia la escuadra británica que la descubrió.

### Fuego (FIRE - Fire)
* **Alcance:**
  * **Escuadras de Fusileros (Rifle Squads):** Estrictamente **adyacente (distancia = 1 hexágono)** en cualquier dirección.
  * **Ametralladoras (MG Teams):** Distancia 1 o 2 hexágonos.
* **Tirada de impacto:** Se lanzan 2d6. El valor base a igualar o superar con modificadores es:
  * Fusileros: **8+**
  * Ametralladora británica (MG): **7+**
* Un impacto exitoso elimina a la unidad alemana estándar (o reduce su estado según la misión).

### Ataque con Granada (GRE - Grenade Attack)
* **Alcance:** Estrictamente adyacente (distancia = 1 hexágono).
* **Tirada de impacto:** Siempre **6+ en 2d6**.
* **Regla especial:** **NO se aplica ningún modificador** (ni cobertura de bosque, ni edificios, ni colinas, ni flanqueo). Impacto puro a 6+.

### Tomar Cobertura (COV - Take Cover)
* Coloca una marca de cobertura defensiva en la unidad (+1 a su defensa).
* Cualquier ataque enemigo posterior necesitará un resultado +1 más alto para impactar a esta escuadra.

### Reagrupar (RAL - Rally)
* Elimina el marcador de **Moral Baja** de la unidad y restaura su moral a **Normal**.
* Si la unidad ya tiene Moral Normal, la orden no tiene efecto.

### Explorar (SCO - Scout)
* Revela una posición enemiga (`?`) situada a **exactamente 2 hexágonos** de distancia de la unidad exploradora.
* **Ventaja táctica:** El jugador elige libremente hacia dónde mira el enemigo revelado (debe ser una de las 3 direcciones hacia abajo que no salgan del mapa), permitiendo posicionarlo para flanquearlo en turnos posteriores.

---

## 5. Moral y Bajas Británicas

* **Estados de moral:** Normal y Baja. Todas las unidades comienzan con Moral Normal.
* **Primer impacto recibido:** La unidad sufre una pérdida de moral y pasa a **Moral Baja**.
* **Segundo impacto recibido sobre Moral Baja:** La unidad es **eliminada** del campo de batalla.
* **Efecto de Moral Baja:** La unidad solo puede realizar la orden de la **Columna 1** de la fila elegida.

---

## 6. Modificadores de Combate: Terreno, Flanqueo y Apoyo

### Terreno (defensa del objetivo)
* **Bosque (Woods):** Añade **+1** a la tirada requerida para impactar al defensor.
* **Edificio (Building):** Añade **+2** a la tirada requerida para impactar al defensor.
* **Colina (Hill):** Si el atacante dispara desde una colina, resta **-1** a la tirada requerida (más fácil impactar). No aplica a granadas.
* **Río (River):** Bloquea el movimiento salvo por puentes. Se puede disparar a través de él.

### Flanqueo (Flanking)
* Si una unidad británica dispara a un enemigo desde **fuera de la Zona de Fuego** de dicho enemigo, recibe un bonificador de **-1 a la tirada requerida** (ej. fusileros impactan a 7+ en vez de 8+).

### Apoyo Adyacente (Support)
* Por cada **otra unidad británica adyacente al objetivo alemán**, la unidad que dispara recibe un bonificador adicional de **-1 a la tirada requerida**.

---

## 7. Fase Alemana (Enemy Activation)

Una vez que todas las unidades británicas han terminado su activación:

1. **Zonas de Fuego Alemanas (Fire Zone):**
   * Cada unidad alemana tiene encaramiento.
   * Su Zona de Fuego abarca los **3 hexágonos frontales adyacentes** (el hexágono hacia el que mira y los dos hexágonos adyacentes a cada lado).
2. **Ataque Automático:**
   * Cada unidad alemana revelada abre fuego contra **todas y cada una de las unidades británicas** situadas en su Zona de Fuego.
3. **Valores de impacto alemanes (2d6):**
   * **Ametralladora ligera (LMG):** Impacta a **6+**.
   * **Ametralladora pesada (HMG):** Impacta a **5+**.
   * **Fusileros alemanes:** Impacta a **8+**.
   * *(Modificado por la cobertura del hexágono o el marcador de cobertura de la unidad británica).*
4. **Artillería alemana (Misiones avanzadas):** Dispara a **10+** contra toda unidad británica en el mapa que no esté en cobertura.
5. **Minas (Misiones avanzadas):** Atacan a **7+** automático al entrar o descubrir sin explorar.

---

## 8. Verificación de Compatibilidad y Correcciones en el Software

| Elemento | Implementación Kiro previa | Corrección a Regla Oficial Lambo |
|:---|:---|:---|
| **Tirada de activación** | Cruzaba Dado 1 (Col 1) con Dado 2 (Col 2). | Se tiran 2 dados; el jugador elige qué dado/fila activar. |
| **Tirada de Dobles** | Otorga 1 orden aleatoria de la fila sin repetición. | Permite aceptar la fila completa o **relanzar ambos dados**. |
| **Alcance de fusileros** | Comprobaba erróneamente distancia $\le$ 2. | Estrictamente adyacente (**distancia = 1**). |
| **Identificación enemiga** | Fichas etiquetadas como `DE-UNK-1`. | Identificación clara: *Fuerza alemana* / *LMG alemana*. |
| **Fase alemana** | Sin retorno visual / congelada. | Diálogo detallado con tiradas 2d6 y reporte militar. |
| **Fin de activación** | Se quedaban órdenes activas infinitas. | Consumo estricto y transición fluida a la siguiente unidad. |
