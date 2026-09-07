# Requirements Document

## Introduction

**fields-of-normandy-pwa** será una aplicación web progresiva (PWA) de uso personal para jugar en solitario, en español de España, las quince misiones verificadas en la edición de Mike Lambo de 2022 titulada «The Fields of Normandy: A Solitaire Wargame». La Aplicación se alojará mediante Amazon S3 y Amazon CloudFront, funcionará en un iPad estándar mediante compatibilidad adaptable y en navegadores de escritorio, conservará varias Partidas individuales independientes y permitirá auditar cada decisión aleatoria y cada cálculo de reglas.

El alcance base incluye exclusivamente Partidas de Misiones individuales independientes. Cada Partida tendrá Estado de partida, Instantáneas, registros y Estado aleatorio propios. El Propietario podrá conservar varias Partidas guardadas y trasladarlas manualmente mediante exportación e importación.

La edición de Mike Lambo de 2022 se considera la única Fuente lúdica autorizada para reglas, secuencias, cifras, tablas, mapas, fichas, Misiones y condiciones de victoria. La Aplicación no sustituirá una laguna de la Fuente lúdica por una regla inventada y no incorporará fe de erratas, aclaraciones ni reglas externas.

La Aplicación no reproducirá prosa, ilustraciones, mapas ni contadores del libro. Los hechos, mecánicas y valores verificados se representarán como Datos canónicos trazables. Los textos y recursos visuales distribuidos serán propios o dispondrán de una licencia documentada, y conservarán de forma funcionalmente equivalente la unidad, el estado, el bando, la Orientación, el terreno, la topología, la posición y la legibilidad necesarios para jugar.

## Estado de la fuente y alcance de esta versión

La Fuente lúdica registrada es **Mike Lambo, «The Fields of Normandy: A Solitaire Wargame», edición de 2022**, con identificador de Versión de fuente `FON-ML-2022`. Las referencias normativas se distribuyen de la forma siguiente:

- Reglas generales: páginas 5 a 14.
- Índice de Misiones: página 15.
- Terreno: página 5.
- Turnos y activación: páginas 6 y 7.
- Órdenes: páginas 7 y 8.
- Moral y Revelado: páginas 9 y 10.
- Flanqueo y Mortero: páginas 11 y 12.
- Semioruga, PIAT y Minas: páginas 12 y 13.
- Artillería, Ríos y dificultad: página 13.
- Resumen de reglas: página 14.
- Para una Misión de número `N`, reglas y Tabla de revelado: página `16 + 2 × (N - 1)`; Mapa hexagonal: página `17 + 2 × (N - 1)`.
- Mapas de las quince Misiones: páginas impares 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43 y 45.
- Inventario funcional de contadores: página 47.

Cada dato verificado deberá conservar una Referencia de fuente con `FON-ML-2022` y la página, sección, tabla, Misión o elemento identificable correspondiente. Las redes de Hexágonos de las páginas de Mapa contienen detalles visuales que no pueden deducirse de un resumen textual. Las coordenadas, conexiones, terrenos, entradas, Incógnitas y orientaciones fijas se incorporarán únicamente después de una transcripción por Misión y una segunda revisión visual contra la página de Mapa correspondiente.

## Convención EARS utilizada

Los criterios de aceptación usan traducciones directas de los patrones EARS:

- **Ubicuo:** LA/EL `<sistema>` DEBERÁ `<respuesta>`.
- **Dirigido por evento:** CUANDO `<evento>`, LA/EL `<sistema>` DEBERÁ `<respuesta>`.
- **Dirigido por estado:** MIENTRAS `<estado>`, LA/EL `<sistema>` DEBERÁ `<respuesta>`.
- **Evento no deseado:** SI `<condición>`, ENTONCES LA/EL `<sistema>` DEBERÁ `<respuesta>`.
- **Característica opcional:** DONDE `<opción>`, LA/EL `<sistema>` DEBERÁ `<respuesta>`.
- **Complejo:** DONDE `<opción>`, MIENTRAS `<estado>`, CUANDO/SI `<condición>`, LA/EL `<sistema>` DEBERÁ `<respuesta>`.

## Glossary

- **Aplicación:** Producto PWA completo objeto de esta especificación.
- **PWA:** Aplicación web progresiva instalable que dispone de manifiesto, recursos almacenados para uso sin conexión y comportamiento adaptable.
- **HTTPS:** Protocolo cifrado empleado para transportar recursos web entre Amazon CloudFront y el navegador.
- **Recurso estático:** Archivo entregado sin ejecutar lógica de juego en la Plataforma AWS.
- **Caché:** Copia reutilizable de un Recurso estático que evita una nueva transferencia desde el Origen privado mientras la versión continúe vigente.
- **Píxel CSS:** Unidad de longitud independiente de la densidad física usada por el navegador para dimensionar controles.
- **Navegador compatible:** Navegador incluido en la Matriz de conformidad de una versión publicada.
- **Entorno probado:** Combinación registrada de dispositivo, versión de sistema operativo y versión de Navegador compatible en la que se ejecutan pruebas de aceptación.
- **iPad estándar:** Modelo de la línea iPad de consumo general utilizado realmente para probar una versión, sin fijar por adelantado generación ni versión de iPadOS.
- **Compatibilidad adaptable:** Capacidad de ajustar presentación e interacción a las dimensiones, Orientación de pantalla y capacidades detectadas sin depender de una generación concreta de dispositivo.
- **Detección de capacidades:** Comprobación ejecutada en el dispositivo para identificar soporte de instalación PWA, almacenamiento, Modo sin conexión, tacto y demás funciones obligatorias.
- **Suma de integridad:** Valor calculado sobre datos exportados que permite detectar alteraciones accidentales.
- **Invariante funcional:** Condición que todo Estado de partida válido debe cumplir según los Datos canónicos.
- **Versión del algoritmo aleatorio:** Identificador inmutable del procedimiento usado para generar la secuencia de Consumos aleatorios.
- **Acción irreversible:** Acción que consume aleatoriedad o aplica un cambio que los Datos canónicos no permiten cancelar.
- **Propietario:** Única persona autorizada para usar la Aplicación y administrar el despliegue personal.
- **Jugador:** Propietario mientras participa en una Misión.
- **Mantenedor:** Propietario mientras verifica, configura o actualiza contenido y despliegues.
- **Fuente lúdica:** Única obra autorizada para definir las reglas y el contenido funcional del juego; corresponde exclusivamente a `FON-ML-2022`.
- **PDF fuente:** Copia legítima de la Fuente lúdica, leída visualmente como imágenes y utilizada únicamente como referencia funcional.
- **Versión de fuente:** Identificador verificable `FON-ML-2022` asignado a la Fuente lúdica.
- **Página de reglas de Misión:** Página par calculada como `16 + 2 × (N - 1)` para la Misión `N`, que contiene reglas, fuerzas, tabla y objetivo de la Misión.
- **Página de Mapa:** Página impar calculada como `17 + 2 × (N - 1)` para la Misión `N`, que contiene el Mapa hexagonal y la preparación visual de la Misión.
- **Referencia de misión:** Identificador `FON-ML-2022-Mnn`, donde `nn` es el número de Misión entre 01 y 15, asociado con la Página de reglas de Misión y la Página de Mapa correspondientes.
- **Unidad británica:** Ficha controlada por el Jugador, de tipo Escuadra de fusileros, Equipo MG, Mortero o PIAT según las fuerzas de la Misión.
- **Unidad alemana:** Ficha enemiga de tipo Fusileros, LMG, HMG, Artillería o Semioruga.
- **Escuadra de fusileros:** Unidad británica de fusileros identificada por una letra de A a C según la Misión.
- **Equipo MG:** Unidad británica de ametralladora con valor base de Fuego 6+ y sin Orden Explorar.
- **LMG:** Unidad alemana de ametralladora ligera con valor base de ataque 6+.
- **HMG:** Unidad alemana de ametralladora pesada con valor base de ataque 5+.
- **Valor para impactar:** Umbral mínimo que debe igualar o superar el total de una tirada de 2d6 después de aplicar los modificadores permitidos.
- **d6:** Dado de seis caras con resultados enteros de 1 a 6.
- **2d6:** Suma de los resultados de dos dados d6 lanzados en una misma tirada.
- **Moral normal:** Estado de una Unidad británica que permite resolver las dos órdenes válidas obtenidas, cuando el Jugador elige ambas.
- **Moral baja:** Estado de una Unidad británica que limita la activación a la primera Orden obtenida y causa la eliminación al recibir otro impacto.
- **Direcciones hacia delante:** Los tres Hexágonos adyacentes situados delante de la Orientación de una Ficha.
- **Direcciones inferiores:** Las tres orientaciones representadas hacia la parte inferior del Mapa hexagonal de una Página de Mapa.
- **Tabla de órdenes:** Tabla de seis filas que transforma el resultado de cada d6 en una primera y una segunda Orden para un tipo de Unidad británica.
- **Tabla de revelado:** Tabla de una Misión que transforma un resultado de d6 en una Unidad alemana o una Mina.
- **Incógnita:** Marcador `?` cuyo contenido se determina al producirse un Revelado.
- **Datos canónicos:** Representación estructurada y revisada de una regla, tabla, Misión, mapa o ficha, acompañada por la correspondiente Referencia de fuente.
- **Referencia de fuente:** Identificador de Versión de fuente y localización precisa mediante página, sección, tabla, figura o elemento equivalente.
- **Catálogo funcional:** Componente que conserva los Datos canónicos y la trazabilidad con el PDF fuente.
- **Registro de decisiones:** Relación de ambigüedades residuales, conflictos y resoluciones aplicados al interpretar el PDF fuente.
- **Estado no publicable:** Estado asignado a contenido que carece de datos suficientes, trazabilidad, revisión o permiso necesario y que impide incluir el contenido en una versión jugable.
- **Matriz de conformidad:** Relación entre cada elemento de los Datos canónicos y sus pruebas de aceptación.
- **Diagnóstico identificable:** Registro de un fallo asociado con un identificador único, la Partida u operación afectada, la fase fallida y la última Instantánea confirmada aplicable, sin incluir credenciales.
- **Segunda revisión visual:** Comprobación independiente posterior a la transcripción que compara cada Hexágono, conexión, terreno, entrada, Incógnita, unidad fija y Orientación con la Página de Mapa correspondiente.
- **Motor de reglas:** Componente que valida acciones y calcula transiciones del Estado de partida según los Datos canónicos.
- **Estado de partida:** Conjunto completo de datos necesarios para continuar una Partida sin pérdida de información, incluidos mapa, fichas, turnos, órdenes, moral, objetivos, efectos, registros y Estado aleatorio.
- **Gestor de partidas:** Componente que crea, guarda, reanuda, reinicia, exporta e importa Partidas.
- **Partida:** Ejecución independiente de una única Misión con Estado de partida propio.
- **Misión:** Escenario jugable identificado en el PDF fuente, con preparación, mapa, componentes, reglas, tablas y desenlace propios.
- **Mapa hexagonal:** Tablero compuesto por Hexágonos cuya geometría, coordenadas, terreno, conexiones y elementos proceden de los Datos canónicos.
- **Hexágono:** Celda individual de un Mapa hexagonal.
- **Ficha:** Unidad, marcador, objetivo u otro componente de juego representado sobre el Mapa hexagonal o en un área de estado.
- **Orientación:** Dirección de una Ficha respecto de los lados o vértices de un Hexágono, conforme al PDF fuente.
- **Orden:** Instrucción de juego disponible para una unidad según el PDF fuente.
- **Moral:** Valor y estado que condicionan unidades o grupos según el PDF fuente.
- **Zona de fuego:** Conjunto de Hexágonos afectados por fuego conforme a los Datos canónicos.
- **Cobertura:** Efecto del terreno, posición u otra condición que modifica una resolución según el PDF fuente.
- **Exploración:** Procedimiento de inspección de una zona o elemento oculto conforme al PDF fuente.
- **Revelado:** Procedimiento que convierte información enemiga oculta en información disponible conforme al PDF fuente.
- **Flanqueo:** Condición posicional definida por el PDF fuente que afecta a una resolución.
- **Apoyo:** Efecto de una unidad, arma o condición que asiste a otra resolución según el PDF fuente.
- **Mortero:** Arma o unidad de mortero regulada por el PDF fuente.
- **Semioruga:** Vehículo semioruga regulado por el PDF fuente.
- **PIAT:** Arma anticarro regulada por el PDF fuente.
- **Mina:** Elemento o efecto de mina regulado por el PDF fuente.
- **Artillería:** Efecto o apoyo de artillería regulado por el PDF fuente.
- **Río:** Terreno y condición de cruce de río regulados por el PDF fuente.
- **Nivel de dificultad:** Configuración de dificultad definida en el PDF fuente.
- **Gestor de aleatoriedad:** Componente que genera, conserva y reproduce resultados pseudoaleatorios auditables.
- **Semilla:** Valor inicial que determina una secuencia reproducible de resultados pseudoaleatorios.
- **Estado aleatorio:** Semilla, posición de secuencia, versión del algoritmo y demás datos necesarios para continuar la misma secuencia.
- **Consumo aleatorio:** Solicitud individual de un resultado al Gestor de aleatoriedad.
- **Registro simple:** Historial en español que resume acciones y resultados relevantes para el Jugador.
- **Registro detallado:** Historial de depuración que conserva entradas, tiradas, objetivos, modificadores, fórmulas, resultados y trazabilidad aleatoria.
- **Instantánea:** Representación persistente, íntegra y versionada de un Estado de partida.
- **Almacenamiento local:** Persistencia dentro del dispositivo y del perfil de navegador autorizado, sin depender de un servicio remoto.
- **Paquete de copia de seguridad:** Archivo portable y versionado que contiene Partidas exportadas manualmente por el Propietario.
- **Modo sin conexión:** Estado en el que la Aplicación no dispone de acceso de red.
- **Paquete sin conexión:** Conjunto íntegro de recursos propios, Datos canónicos y código necesarios para ejecutar las funciones autorizadas en Modo sin conexión.
- **Interfaz:** Componente visible y operable mediante tacto, ratón y tecnologías de asistencia compatibles.
- **Control de acceso:** Componente que autentica al Propietario para solicitudes en línea mediante HTTP Basic.
- **HTTP Basic:** Esquema de autenticación HTTP que presenta el diálogo nativo del navegador y transporta la credencial dentro de la conexión HTTPS.
- **CloudFront Function de acceso:** Función asociada a la solicitud del visor que valida HTTP Basic antes de entregar Recursos estáticos.
- **Credencial de alta entropía:** Combinación de usuario configurable y clave única generada mediante una fuente criptográfica, sin datos personales ni elección manual predecible.
- **Bloqueo local:** Estado que oculta datos y exige verificar localmente el mismo usuario y clave después de descargar válidamente el Paquete sin conexión.
- **Verificador local:** Material derivado de la credencial que permite comprobarla sin permitir recuperar la clave original.
- **Datos descargados:** Recursos y datos almacenados en un dispositivo que una autenticación en línea posterior no puede volver inaccesibles frente a quien controla el dispositivo.
- **Plataforma AWS:** Recursos aprobados de Amazon CloudFront, AWS WAF, protección DDoS, TLS, DNS incluido, CloudFront Functions y Amazon S3 privado utilizados por la Aplicación.
- **Plan Gratuito CloudFront:** Nivel Free del plan flat-rate de Amazon CloudFront con precio mensual de 0 USD, sin cargos por exceso de franquicia y con las prestaciones incluidas documentadas por AWS.
- **Franquicia del plan:** Volumen mensual de solicitudes y transferencia previsto por el Plan Gratuito CloudFront; la Franquicia del plan no constituye un límite duro.
- **Crédito S3 Standard:** Crédito mensual del Plan Gratuito CloudFront que compensa hasta 5 GB de almacenamiento S3 Standard, sujeto a las condiciones vigentes del plan.
- **Cobertura gratuita verificada:** Evidencia previa al despliegue de que el 100 % del almacenamiento S3 Standard previsto y cada Categoría de operación S3 prevista producirán un coste de 0 € bajo las condiciones vigentes de la cuenta.
- **Categoría de operación S3:** Grupo identificable de solicitudes administrativas, solicitudes de origen u otras operaciones S3 previstas que comparte la misma condición de cobertura gratuita.
- **Bloqueo de producción:** Control que impide publicar o mantener una versión de producción cuando falta una condición obligatoria de seguridad, coste o verificabilidad.
- **Origen privado:** Repositorio de Amazon S3 con acceso público bloqueado que acepta lectura mediante Origin Access Control desde la distribución autorizada y acceso administrativo del Propietario.
- **Origin Access Control:** Control de acceso de origen de CloudFront, abreviado OAC, que permite mantener privado el bucket de Amazon S3.
- **Dominio CloudFront:** Nombre de dominio asignado por AWS con formato `*.cloudfront.net`.
- **Coste autorizado:** Importe mensual máximo de 0 € para la Plataforma AWS.
- **Aviso de franquicia:** Notificación incluida en el Plan Gratuito CloudFront al alcanzar el 50 %, 80 % o 100 % de la Franquicia del plan.
- **Zero spend budget:** Plantilla de AWS Budgets que envía una notificación por correo electrónico cuando el gasto supera los límites gratuitos aplicables.
- **Recurso protegido:** Texto, traducción, ilustración, mapa, ficha, icono, tipografía, marca u otro material sujeto a derechos de autor, marca o licencia.
- **Recurso propio:** Material creado específicamente para la Aplicación sin copiar la expresión protegida del PDF fuente.
- **Inventario de licencias:** Relación de recursos distribuidos, autoría, procedencia, licencia y permiso de uso.
- **Versión de reglas:** Identificador inmutable de los Datos canónicos usados por una Partida.
- **Versión de guardado:** Identificador del formato de una Instantánea o Paquete de copia de seguridad.
- **Mejora futura fuera de alcance:** Idea registrada que no impone comportamiento a la versión base ni forma parte de sus criterios de aceptación.

## Decisiones cerradas y pendientes reales

### Decisiones cerradas

- **DC-001 — Fuente lúdica única:** `FON-ML-2022` es la única Fuente lúdica; no se incorporarán erratas, aclaraciones ni reglas externas.
- **DC-002 — Localizaciones de fuente:** reglas p.5-14, índice p.15, reglas y tabla de Misión `N` en p.`16 + 2 × (N - 1)`, Mapa de Misión `N` en p.`17 + 2 × (N - 1)` y contadores p.47.
- **DC-003 — Alcance de juego:** la versión base contiene únicamente Partidas de Misiones individuales independientes y permite conservar varias Partidas guardadas.
- **DC-004 — Campañas:** Campañas, progresión, arrastre y repetición dentro de secuencias quedan fuera de alcance; una Campaña configurable solo se registra como posible mejora futura propia de la Aplicación.
- **DC-005 — Persistencia:** cada dispositivo usa Almacenamiento local y transferencia manual mediante exportación e importación; no existe sincronización entre dispositivos.
- **DC-006 — iPad objetivo:** el objetivo es un iPad estándar con Compatibilidad adaptable; cada versión registra el modelo, iPadOS y Safari realmente probados sin prometer una generación mínima fija.
- **DC-007 — Autenticación:** un único usuario configurable y una clave de alta entropía se validan mediante HTTP Basic en una CloudFront Function de acceso; el cambio o recuperación exige redespliegue.
- **DC-008 — Bloqueo local:** el mismo usuario y clave activan el Bloqueo local; el Verificador local no permite recuperar la clave y el Bloqueo local protege la Interfaz, no los Datos descargados frente a quien controla el dispositivo.
- **DC-009 — Coste:** el Coste autorizado es 0 € y el único plan permitido es el Plan Gratuito CloudFront; la producción permanece bloqueada sin Cobertura gratuita verificada para almacenamiento y operaciones S3.
- **DC-010 — Monitorización:** solo se utilizarán Avisos de franquicia incluidos y un Zero spend budget por correo electrónico; las alertas son informativas y no sustituyen el Bloqueo de producción.

### Decisiones pendientes reales

- **DP-001 — Transcripción visual exacta:** transcribir para cada Referencia de misión las coordenadas, adyacencias, bordes, entradas, terrenos, puentes, Incógnitas, unidades fijas y orientaciones visibles; una segunda revisión visual deberá comparar el catálogo completo con la Página de Mapa antes de publicarlo.
- **DP-002 — Ambigüedades residuales:** identificar contradicciones, símbolos sin definición, empates, límites, prioridades y situaciones no cubiertas por la Fuente lúdica; cada caso deberá resolverse explícitamente sin introducir reglas externas y mantendrá el contenido afectado en Estado no publicable hasta su resolución.
- **DP-003 — Permisos concretos:** documentar cualquier licencia concreta que permita usar un Recurso protegido; cuando no exista permiso, se utilizará una representación propia funcionalmente equivalente.

### Supuestos verificables iniciales

- **SV-001:** el PDF fuente aportado por el Propietario es una copia obtenida legítimamente para uso personal.
- **SV-002:** cada dispositivo conserva Partidas en Almacenamiento local y solo las transfiere mediante exportación e importación manual.
- **SV-003:** el Motor de reglas se ejecuta en el dispositivo y una Partida no necesita servicios dinámicos de cómputo o base de datos en AWS.
- **SV-004:** los mapas, fichas, ilustraciones y textos visibles serán Recursos propios o recursos con licencia compatible registrada.
- **SV-005:** las cifras y relaciones funcionales verificadas en el PDF fuente pueden modelarse como Datos canónicos, pero la expresión textual y visual se redactará o diseñará de nuevo.

## Límites explícitos de refinamiento

Para conservar requisitos verificables y libres de reglas o soluciones inventadas, esta especificación rechaza expresamente cualquier propuesta que introduzca sin una Referencia de fuente o evidencia técnica aplicable:

- un máximo de Partidas; el único umbral fijado es la capacidad mínima de veinte Partidas simultáneas y la capacidad observable del dispositivo puede impedir crear más Partidas sin reducir ese mínimo;
- un máximo de pruebas, repeticiones o intentos, o un número obligatorio de vectores de prueba; las ocho comprobaciones por Entorno probado del requisito 31 son categorías de aceptación obligatorias y no constituyen un máximo de ejecuciones;
- un formato, longitud o rango para la Semilla, o un algoritmo criptográfico concreto para credenciales, Verificadores locales o cualquier otro componente;
- un plazo de ejecución, conservación, recuperación, actualización o soporte que no conste en una fuente aplicable;
- una generación mínima de iPad, una versión mínima de iPadOS o un Entorno probado no registrado mediante pruebas reales;
- un desempate de Orientación, una regla lúdica, un valor, una prioridad o una excepción ausente de `FON-ML-2022`;
- un servicio AWS distinto de los recursos aprobados, una cobertura AWS no demostrada o una garantía de coste de 0 € basada en alertas, franquicias o supuestos no verificados.

Las propuestas afectadas se mantendrán fuera de los Datos canónicos y, cuando sean necesarias para publicar contenido, conservarán el elemento correspondiente en Estado no publicable hasta disponer de evidencia admisible.

## Requirements

### Requisito 1: Autoridad de la fuente y trazabilidad

**Historia de usuario:** Como Mantenedor, quiero vincular cada dato de juego con la Fuente lúdica única, para demostrar fidelidad sin completar lagunas mediante reglas inventadas.

#### Criterios de aceptación

1. EL Catálogo funcional DEBERÁ asociar cada regla, tabla, Misión, Mapa hexagonal y tipo de Ficha exclusivamente con `FON-ML-2022`.
2. EL Catálogo funcional DEBERÁ asociar cada Dato canónico con al menos una Referencia de fuente que identifique la página y el elemento concreto dentro de la página.
3. EL Catálogo funcional DEBERÁ registrar las páginas 5 a 14 como referencias de las reglas generales y la página 15 como referencia del índice de Misiones.
4. EL Catálogo funcional DEBERÁ registrar para la Misión `N` la Página de reglas de Misión `16 + 2 × (N - 1)` y la Página de Mapa `17 + 2 × (N - 1)`.
5. EL Catálogo funcional DEBERÁ registrar la página 47 como referencia del inventario funcional de contadores.
6. EL Catálogo funcional DEBERÁ conservar el significado funcional verificado de cada elemento del PDF fuente como Datos canónicos.
7. CUANDO el Mantenedor documente dos interpretaciones incompatibles de una regla, EL Catálogo funcional DEBERÁ crear una entrada en el Registro de decisiones con las alternativas y cada Referencia de fuente aplicable.
8. SI un elemento necesario carece de una Referencia de fuente precisa o de una resolución aprobada, ENTONCES EL Catálogo funcional DEBERÁ asignar el Estado no publicable al elemento.
9. CUANDO el Propietario apruebe una resolución de DP-002, EL Catálogo funcional DEBERÁ registrar la decisión, la fecha, la justificación y las Referencias de fuente afectadas.
10. CUANDO cambie una resolución o un Dato canónico publicado, EL Catálogo funcional DEBERÁ crear una nueva Versión de reglas sin alterar versiones anteriores.
11. SI una regla propuesta procede de una fuente distinta de `FON-ML-2022`, ENTONCES EL Catálogo funcional DEBERÁ excluir la regla de los Datos canónicos.

### Requisito 2: Validación de fidelidad funcional

**Historia de usuario:** Como Propietario, quiero comprobar la cobertura del PDF fuente, para saber qué contenido está verificado antes de jugar.

#### Criterios de aceptación

1. LA Matriz de conformidad DEBERÁ incluir una entrada única para cada elemento inventariado del PDF fuente.
2. LA Matriz de conformidad DEBERÁ vincular cada entrada con un único elemento inventariado mediante el mismo identificador de catálogo.
3. LA Matriz de conformidad DEBERÁ relacionar cada entrada con al menos una prueba que compare el comportamiento de la Aplicación con los Datos canónicos.
4. CUANDO una entrada no disponga de prueba aprobada, LA Matriz de conformidad DEBERÁ marcar la entrada como no verificada.
5. SI una Versión de reglas contiene una entrada no verificada necesaria para una Misión, ENTONCES LA Aplicación DEBERÁ mantener la Misión en Estado no publicable.
6. CUANDO una prueba detecte una diferencia respecto de los Datos canónicos, LA Matriz de conformidad DEBERÁ registrar el resultado esperado, el resultado obtenido y cada Referencia de fuente aplicable.
7. SI un elemento inventariado no tiene una entrada correspondiente, ENTONCES LA Matriz de conformidad DEBERÁ marcar la Versión de reglas como no publicable.
8. SI una entrada no identifica un elemento inventariado, ENTONCES LA Matriz de conformidad DEBERÁ marcar la Versión de reglas como no publicable.

### Requisito 3: Español de España

**Historia de usuario:** Como Jugador, quiero usar toda la Aplicación en español de España, para jugar sin depender del texto inglés del documento fuente.

#### Criterios de aceptación

1. LA Interfaz DEBERÁ mostrar en español de España todos los menús, controles, ayudas, mensajes, estados, reglas resumidas y avisos.
2. EL Registro simple DEBERÁ redactar todas las entradas generadas en español de España.
3. EL Registro detallado DEBERÁ redactar todas las etiquetas, explicaciones y resultados generados en español de España.
4. LA Aplicación DEBERÁ representar fechas, horas y números con formatos coherentes con la configuración regional `es-ES`.
5. SI un término original en inglés resulta necesario para la trazabilidad, ENTONCES EL Catálogo funcional DEBERÁ conservar el término dentro de metadatos de mantenimiento no presentados como instrucción de juego.
6. CUANDO un texto visible no disponga de redacción original aprobada, LA Aplicación DEBERÁ marcar el contenido asociado como no publicable.

### Requisito 4: Inventario de misiones, mapas, tablas y fichas

**Historia de usuario:** Como Mantenedor, quiero inventariar cada componente del PDF fuente, para evitar omisiones en la reproducción funcional de los escenarios.

#### Criterios de aceptación

1. EL Catálogo funcional DEBERÁ contener una entrada única para cada una de las quince Misiones identificadas en la página 15.
2. EL Catálogo funcional DEBERÁ asignar a cada elemento inventariado un identificador único dentro de `FON-ML-2022`.
3. EL Catálogo funcional DEBERÁ vincular cada identificador de inventario con un único elemento del PDF fuente y su localización precisa.
4. EL Catálogo funcional DEBERÁ registrar para cada Misión la preparación, las fuerzas, los objetivos, la duración, los eventos, las reglas especiales, las tablas aplicables y los desenlaces indicados en la Página de reglas de Misión.
5. EL Catálogo funcional DEBERÁ representar para cada Mapa hexagonal la disposición de Hexágonos, coordenadas, terrenos, conexiones, elementos impresos y zonas indicadas en la Página de Mapa.
6. EL Catálogo funcional DEBERÁ registrar para cada tipo de Ficha los valores, estados, caras, Orientación y restricciones indicados en las páginas 5 a 14 y en el inventario funcional de contadores de la página 47.
7. EL Catálogo funcional DEBERÁ registrar cada fila, columna, intervalo, resultado, nota y condición de aplicación de cada tabla identificada.
8. CUANDO un elemento del inventario no sea aplicable a una Misión, EL Catálogo funcional DEBERÁ registrar explícitamente la ausencia de aplicación.
9. SI el inventario no cubre todos los elementos identificados en `FON-ML-2022`, ENTONCES EL Catálogo funcional DEBERÁ mantener la Versión de reglas en Estado no publicable.
10. SI dos entradas representan el mismo elemento y la misma Referencia de fuente sin una relación de versión documentada, ENTONCES EL Catálogo funcional DEBERÁ mantener ambas entradas en Estado no publicable.

### Requisito 5: Preparación fiel de cada misión

**Historia de usuario:** Como Jugador, quiero iniciar cualquier escenario con la preparación correcta, para reproducir el punto de partida del PDF fuente.

#### Criterios de aceptación

1. CUANDO el Jugador seleccione una Misión publicada, EL Motor de reglas DEBERÁ preparar exactamente el Mapa hexagonal, las Fichas, los valores, los marcadores, las tablas y los objetivos definidos por los Datos canónicos de la Misión.
2. CUANDO la preparación incluya elecciones del Jugador, LA Interfaz DEBERÁ presentar únicamente las opciones y restricciones definidas por los Datos canónicos.
3. CUANDO la preparación requiera aleatoriedad, EL Motor de reglas DEBERÁ solicitar cada resultado al Gestor de aleatoriedad en el orden definido por los Datos canónicos.
4. SI falta un dato obligatorio de preparación, ENTONCES EL Gestor de partidas DEBERÁ cancelar la creación sin conservar un Estado de partida parcial ni consumir aleatoriedad.
5. CUANDO el Gestor de partidas cancele una creación por falta de datos, EL Gestor de partidas DEBERÁ mostrar la Referencia de fuente o la entrada de DP-001 o DP-002 afectada.
6. CUANDO finalice correctamente la preparación, EL Gestor de partidas DEBERÁ confirmar una única Instantánea inicial completa que incluya mapa, Fichas, valores, marcadores, tablas, objetivos, turno, fase, Moral, Versión de reglas, ambos registros y Estado aleatorio.
7. SI falla la confirmación de la Instantánea inicial, ENTONCES EL Gestor de partidas DEBERÁ cancelar de forma atómica la creación de la Partida sin conservar datos parciales.
8. CUANDO exista una regla concreta aplicable de los requisitos 32 a 40, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de un criterio genérico incompatible de los requisitos 5 y 8 a 18.

### Requisito 6: Varias partidas individuales independientes

**Historia de usuario:** Como Jugador, quiero conservar varias Partidas de Misiones individuales, para jugar escenarios distintos sin mezclar estados.

#### Criterios de aceptación

1. CUANDO el Jugador cree una Partida, EL Gestor de partidas DEBERÁ asignar un identificador único a la nueva Partida.
2. EL Gestor de partidas DEBERÁ permitir al Propietario conservar como mínimo veinte Partidas simultáneas en un dispositivo.
3. EL Gestor de partidas DEBERÁ mantener de forma independiente el Estado de partida, las Instantáneas, el Registro simple, el Registro detallado y el Estado aleatorio de cada Partida.
4. CUANDO el Jugador seleccione una Partida existente, EL Gestor de partidas DEBERÁ mostrar la Misión y la fecha de la última Instantánea antes de reanudar.
5. SI el espacio disponible resulta insuficiente para crear una Partida, ENTONCES EL Gestor de partidas DEBERÁ conservar sin modificación todas las Partidas existentes.
6. CUANDO el espacio resulte insuficiente para crear una Partida, EL Gestor de partidas DEBERÁ explicar la capacidad requerida y la capacidad disponible observada.
7. SI una operación identifica otra Partida o ningún identificador de Partida, ENTONCES EL Gestor de partidas DEBERÁ rechazar la operación sin modificar ningún Estado de partida.

### Requisito 7: Guardado, reanudación y reinicio

**Historia de usuario:** Como Jugador, quiero guardar, reanudar y reiniciar Partidas, para interrumpir el juego sin perder el estado y repetir una Misión cuando lo decida.

#### Criterios de aceptación

1. CUANDO el Motor de reglas acepte una acción que cambie el Estado de partida, EL Gestor de partidas DEBERÁ confirmar una Instantánea íntegra antes de habilitar la siguiente acción que cambie el Estado de partida.
2. CUANDO el Jugador reanude una Partida, EL Gestor de partidas DEBERÁ restaurar el mapa, las Fichas, los turnos, las órdenes, la Moral, los efectos, los objetivos, ambos registros y el Estado aleatorio de la última Instantánea confirmada de la Partida identificada.
3. CUANDO el Jugador solicite reiniciar una Partida, EL Gestor de partidas DEBERÁ presentar una confirmación cancelable que identifique la Partida y la última Instantánea válida afectada.
4. CUANDO el Jugador cancele el reinicio, EL Gestor de partidas DEBERÁ conservar sin modificación todas las Partidas.
5. CUANDO el Jugador confirme el reinicio, EL Gestor de partidas DEBERÁ sustituir de forma atómica únicamente la Partida identificada por una preparación inicial nueva de la misma Misión.
6. SI falla un reinicio confirmado, ENTONCES EL Gestor de partidas DEBERÁ restaurar la última Instantánea válida de la Partida identificada sin modificar otras Partidas.
7. SI una operación de guardado falla, ENTONCES EL Gestor de partidas DEBERÁ mantener íntegra y operativa la última Instantánea confirmada, incluidos ambos registros y la posición de secuencia del Estado aleatorio.
8. MIENTRAS una operación de guardado permanezca sin confirmar, EL Gestor de partidas DEBERÁ bloquear nuevas acciones que cambien el Estado de partida.
9. MIENTRAS las acciones que cambian el Estado de partida permanezcan bloqueadas por un fallo de guardado, EL Gestor de partidas DEBERÁ permitir al Jugador reintentar el guardado o exportar una copia de seguridad.

### Requisito 8: Secuencia de turnos y órdenes

**Historia de usuario:** Como Jugador, quiero que los turnos y las órdenes sigan la secuencia publicada, para ejecutar cada fase en el momento permitido.

#### Criterios de aceptación

1. CUANDO comience una Misión, EL Motor de reglas DEBERÁ establecer el turno, la fase y el estado de órdenes definidos por los Datos canónicos de las páginas 6 a 8 y de la Misión.
2. CUANDO avance una fase o un turno, EL Motor de reglas DEBERÁ aplicar la secuencia, los desencadenantes y los efectos de inicio o fin definidos por los Datos canónicos.
3. MIENTRAS una Orden no cumpla sus condiciones de disponibilidad, EL Motor de reglas DEBERÁ excluir la Orden de las acciones aceptables.
4. CUANDO el Jugador emita una Orden válida, EL Motor de reglas DEBERÁ aplicar los costes, objetivos, límites y efectos definidos por los Datos canónicos.
5. SI el Jugador intenta emitir una Orden fuera de secuencia, ENTONCES EL Motor de reglas DEBERÁ conservar el Estado de partida y la posición de secuencia aleatoria anteriores a la solicitud.
6. CUANDO el Motor de reglas rechace una Orden fuera de secuencia, EL Motor de reglas DEBERÁ explicar en español la condición incumplida.
7. CUANDO una Orden quede resuelta, EL Registro detallado DEBERÁ registrar fase, unidad, Orden, entradas, efectos y Referencias de fuente aplicables.
8. SI los Datos canónicos no definen la siguiente fase, el siguiente turno o la precedencia entre dos desencadenantes aplicables, ENTONCES EL Motor de reglas DEBERÁ bloquear el avance sin cambiar el Estado de partida ni consumir aleatoriedad.
9. CUANDO una regla concreta de los requisitos 32 a 40 sea aplicable a una activación, Orden o secuencia, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 8.

### Requisito 9: Moral

**Historia de usuario:** Como Jugador, quiero que la Moral se calcule y produzca los efectos publicados, para conservar las restricciones y consecuencias del juego.

#### Criterios de aceptación

1. CUANDO un evento modifique la Moral, EL Motor de reglas DEBERÁ calcular el nuevo valor o estado según los Datos canónicos de las páginas 9 y 10.
2. MIENTRAS una unidad se encuentre en un estado de Moral con restricciones, EL Motor de reglas DEBERÁ limitar las acciones de la unidad a las permitidas por los Datos canónicos.
3. CUANDO corresponda una comprobación de Moral, EL Motor de reglas DEBERÁ aplicar el valor objetivo, los modificadores, la tirada y las consecuencias definidos por los Datos canónicos.
4. SI una comprobación de Moral produce un caso de empate o límite, ENTONCES EL Motor de reglas DEBERÁ usar la resolución documentada en los Datos canónicos.
5. SI la resolución de un caso de Moral permanece pendiente en DP-002, ENTONCES EL Motor de reglas DEBERÁ bloquear la acción afectada sin cambiar el Estado de partida ni consumir aleatoriedad.
6. CUANDO el Motor de reglas bloquee un caso de Moral pendiente, EL Motor de reglas DEBERÁ mostrar la entrada correspondiente del Registro de decisiones.
7. CUANDO una regla concreta de los requisitos 34, 35 o 37 defina un efecto de Moral, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 9.

### Requisito 10: Movimiento y orientación sobre hexágonos

**Historia de usuario:** Como Jugador, quiero mover y orientar fichas según el mapa y el terreno, para reproducir el posicionamiento táctico del PDF fuente.

#### Criterios de aceptación

1. CUANDO el Jugador seleccione una Ficha que pueda moverse, EL Motor de reglas DEBERÁ calcular los Hexágonos de destino alcanzables según costes, terreno, ocupación, efectos, límites y excepciones de los Datos canónicos.
2. CUANDO el Jugador confirme un movimiento válido, EL Motor de reglas DEBERÁ aplicar la ruta, los costes, los desencadenantes y la posición final definidos por los Datos canónicos.
3. SI una ruta atraviesa un Hexágono o lado no permitido, ENTONCES EL Motor de reglas DEBERÁ conservar la posición, el Estado de partida y la posición de secuencia aleatoria anteriores a la solicitud.
4. CUANDO el Motor de reglas rechace una ruta, EL Motor de reglas DEBERÁ explicar la restricción aplicable.
5. CUANDO una acción permita cambiar la Orientación, LA Interfaz DEBERÁ ofrecer únicamente las orientaciones permitidas por los Datos canónicos.
6. CUANDO cambie la Orientación de una Ficha, EL Motor de reglas DEBERÁ recalcular los arcos, relaciones posicionales y efectos que dependan de la Orientación.
7. LA Interfaz DEBERÁ distinguir visualmente la Orientación de cada Ficha mediante forma o indicador además del color.
8. SI faltan los Datos canónicos necesarios para decidir una ruta u Orientación, ENTONCES EL Motor de reglas DEBERÁ bloquear la acción sin cambiar el Estado de partida ni consumir aleatoriedad.
9. CUANDO una regla concreta de los requisitos 35, 36, 37, 39 o 40 defina movimiento, terreno u Orientación, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 10.

### Requisito 11: Combate y granadas

**Historia de usuario:** Como Jugador, quiero resolver ataques y granadas con todos los valores y modificadores aplicables, para obtener los resultados previstos por las reglas.

#### Criterios de aceptación

1. CUANDO el Jugador seleccione una acción de combate, EL Motor de reglas DEBERÁ determinar atacantes, objetivos, alcance, línea aplicable, elegibilidad y restricciones según los Datos canónicos.
2. CUANDO se resuelva un combate, EL Motor de reglas DEBERÁ aplicar en el orden canónico valores base, tiradas, Cobertura, modificadores, comparaciones, tablas y consecuencias.
3. CUANDO se resuelva una Granada, EL Motor de reglas DEBERÁ aplicar disponibilidad, alcance, objetivo, consumo, modificadores y efectos definidos por los Datos canónicos.
4. SI un objetivo no resulta elegible, ENTONCES EL Motor de reglas DEBERÁ conservar el Estado de partida y la posición de secuencia aleatoria anteriores a la solicitud.
5. CUANDO el Motor de reglas rechace un objetivo, EL Motor de reglas DEBERÁ explicar cada condición de elegibilidad incumplida.
6. CUANDO un combate produzca bajas, cambios de Moral, movimiento u otros efectos encadenados, EL Motor de reglas DEBERÁ resolver cada efecto en la prioridad definida por los Datos canónicos.
7. SI la prioridad entre efectos encadenados no consta en los Datos canónicos, ENTONCES EL Motor de reglas DEBERÁ bloquear la resolución antes de aplicar efectos o consumir aleatoriedad.
8. CUANDO el Motor de reglas bloquee un combate por una prioridad ausente, EL Catálogo funcional DEBERÁ crear una entrada no resuelta en el Registro de decisiones.
9. CUANDO una regla concreta de los requisitos 35 a 39 defina un ataque, una Granada, un objetivo, un modificador o una consecuencia, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 11.

### Requisito 12: Cobertura

**Historia de usuario:** Como Jugador, quiero que la Cobertura refleje terreno y posición, para aplicar correctamente la protección durante las resoluciones.

#### Criterios de aceptación

1. CUANDO una resolución pueda recibir Cobertura, EL Motor de reglas DEBERÁ identificar todas las fuentes de Cobertura aplicables según los Datos canónicos.
2. CUANDO varias fuentes de Cobertura coincidan, EL Motor de reglas DEBERÁ combinar o priorizar las fuentes según los Datos canónicos.
3. CUANDO la Cobertura modifique una resolución, EL Registro detallado DEBERÁ registrar cada fuente, valor, regla de combinación y resultado aplicado.
4. SI una fuente de Cobertura no cumple sus condiciones, ENTONCES EL Motor de reglas DEBERÁ excluir la fuente sin cambiar las demás entradas de la resolución.
5. CUANDO el Motor de reglas excluya una fuente de Cobertura, EL Registro detallado DEBERÁ conservar una explicación consultable.
6. SI los Datos canónicos no definen cómo combinar dos fuentes de Cobertura aplicables, ENTONCES EL Motor de reglas DEBERÁ bloquear la resolución antes de aplicar efectos o consumir aleatoriedad.
7. CUANDO una regla concreta de los requisitos 35, 36 o 39 defina la inclusión o exclusión de Cobertura, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 12.

### Requisito 13: Exploración y revelado de enemigos

**Historia de usuario:** Como Jugador, quiero explorar y revelar enemigos según las reglas, para mantener la información oculta y sus desencadenantes.

#### Criterios de aceptación

1. MIENTRAS un enemigo permanezca oculto, LA Interfaz DEBERÁ mostrar únicamente la información permitida por los Datos canónicos.
2. CUANDO el Jugador realice una Exploración válida, EL Motor de reglas DEBERÁ aplicar costes, alcance, condiciones, tiradas y resultados definidos por los Datos canónicos de las páginas 9 y 10.
3. CUANDO se cumpla un desencadenante de Revelado, EL Motor de reglas DEBERÁ seleccionar y revelar el contenido según la tabla, prioridad y secuencia definidas por los Datos canónicos.
4. CUANDO el Revelado requiera aleatoriedad, EL Motor de reglas DEBERÁ consumir los resultados mediante el Gestor de aleatoriedad.
5. SI se agota o contradice una fuente de enemigos, ENTONCES EL Motor de reglas DEBERÁ aplicar únicamente la resolución documentada en los Datos canónicos.
6. SI no existe una resolución documentada para una fuente agotada o contradictoria, ENTONCES EL Motor de reglas DEBERÁ detener el Revelado sin aplicar un contenido revelado al Estado de partida.
7. CUANDO el Motor de reglas detenga un Revelado después de un Consumo aleatorio ya efectuado, EL Registro detallado DEBERÁ conservar el Consumo aleatorio y la causa de la detención.
8. CUANDO el Motor de reglas detenga un Revelado por falta de resolución, EL Catálogo funcional DEBERÁ registrar una decisión pendiente de DP-002 con la Referencia de fuente afectada.
9. CUANDO una regla concreta de los requisitos 33, 35, 37 o 39 defina una Exploración o un Revelado, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 13.

### Requisito 14: Zonas de fuego, flanqueo y apoyo

**Historia de usuario:** Como Jugador, quiero visualizar y aplicar relaciones tácticas de fuego, Flanqueo y Apoyo, para resolver correctamente la posición de las unidades.

#### Criterios de aceptación

1. CUANDO cambie una posición, Orientación, estado o terreno relevante, EL Motor de reglas DEBERÁ recalcular las Zonas de fuego afectadas según los Datos canónicos.
2. CUANDO el Jugador consulte una Ficha, LA Interfaz DEBERÁ poder mostrar la Zona de fuego vigente sin alterar el Estado de partida.
3. CUANDO una resolución pueda recibir Flanqueo, EL Motor de reglas DEBERÁ evaluar posiciones, orientaciones, unidades y excepciones según los Datos canónicos de las páginas 11 y 12.
4. CUANDO una resolución pueda recibir Apoyo, EL Motor de reglas DEBERÁ evaluar elegibilidad, alcance, límites, costes y efectos según los Datos canónicos.
5. CUANDO se aplique Flanqueo o Apoyo, EL Registro detallado DEBERÁ identificar las Fichas implicadas, las condiciones satisfechas y el efecto calculado.
6. SI una relación táctica deja de cumplir sus condiciones antes de resolverse, ENTONCES EL Motor de reglas DEBERÁ recalcular la resolución con el Estado de partida vigente antes de efectuar un Consumo aleatorio.
7. SI los Datos canónicos no permiten determinar una Zona de fuego, un Flanqueo o un Apoyo aplicable, ENTONCES EL Motor de reglas DEBERÁ bloquear la resolución sin cambiar el Estado de partida ni consumir aleatoriedad.
8. CUANDO una regla concreta de los requisitos 37 a 39 defina una Zona de fuego, un Flanqueo, un Apoyo o un Mortero, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 14.

### Requisito 15: Morteros, semiorugas y PIAT

**Historia de usuario:** Como Jugador, quiero usar y enfrentar armas y vehículos especiales conforme al PDF fuente, para conservar sus diferencias tácticas.

#### Criterios de aceptación

1. CUANDO se seleccione una acción de Mortero, EL Motor de reglas DEBERÁ aplicar preparación, alcance, selección de objetivo, tiradas, modificadores, efectos y restricciones definidos por los Datos canónicos de las páginas 11 y 12.
2. CUANDO una Semioruga se mueva, ataque, reciba un ataque o cambie de estado, EL Motor de reglas DEBERÁ aplicar las reglas específicas de Semioruga definidas por los Datos canónicos de las páginas 12 y 13.
3. CUANDO se seleccione una acción de PIAT, EL Motor de reglas DEBERÁ aplicar disponibilidad, alcance, objetivo, tiradas, modificadores, consumo y efectos definidos por los Datos canónicos de las páginas 12 y 13.
4. SI un Mortero, una Semioruga o un PIAT carece de datos canónicos completos para la situación solicitada, ENTONCES EL Motor de reglas DEBERÁ bloquear la acción sin cambiar el Estado de partida ni consumir aleatoriedad.
5. CUANDO el Motor de reglas bloquee una acción especial, EL Motor de reglas DEBERÁ señalar la entrada de DP-002 correspondiente.
6. CUANDO una regla general y una regla especial entren en conflicto, EL Motor de reglas DEBERÁ aplicar la precedencia registrada en los Datos canónicos.
7. CUANDO una regla concreta de los requisitos 36, 38 o 39 defina el Mortero, la Semioruga o el PIAT, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 15.

### Requisito 16: Minas, artillería y ríos

**Historia de usuario:** Como Jugador, quiero que Minas, Artillería y Ríos produzcan los efectos publicados, para reproducir peligros, apoyo y restricciones del terreno.

#### Criterios de aceptación

1. CUANDO una Ficha entre, salga o actúe en una ubicación afectada por una Mina, EL Motor de reglas DEBERÁ aplicar detección, desencadenamiento, tiradas, efectos y persistencia definidos por los Datos canónicos de las páginas 12 y 13.
2. CUANDO se resuelva Artillería, EL Motor de reglas DEBERÁ aplicar disponibilidad, objetivo, secuencia, tiradas, modificadores y efectos definidos por los Datos canónicos de la página 13.
3. CUANDO una ruta o acción interactúe con un Río, EL Motor de reglas DEBERÁ aplicar restricciones de entrada, salida, cruce, Orientación, coste y efectos definidos por los Datos canónicos de la página 13.
4. CUANDO una Mina, Artillería o Río modifique otra regla, EL Registro detallado DEBERÁ registrar la regla modificada, el valor anterior, el modificador y el valor resultante.
5. SI falta una resolución canónica para una interacción especial, ENTONCES EL Motor de reglas DEBERÁ conservar el Estado de partida y la posición de secuencia aleatoria anteriores a la solicitud.
6. CUANDO falte una resolución canónica para una interacción especial, EL Catálogo funcional DEBERÁ registrar la interacción y la Referencia de fuente afectada en el Registro de decisiones.
7. CUANDO una regla concreta de los requisitos 36, 37 o 39 defina una Mina, Artillería o Río, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 16.

### Requisito 17: Dificultad y tablas por misión

**Historia de usuario:** Como Jugador, quiero elegir la dificultad permitida y usar las tablas correctas de cada Misión, para reproducir sus variantes y resultados.

#### Criterios de aceptación

1. CUANDO una Misión admita Niveles de dificultad, LA Interfaz DEBERÁ presentar exactamente los niveles definidos por los Datos canónicos de la página 13 y de la Página de reglas de Misión.
2. CUANDO el Jugador elija un Nivel de dificultad, EL Motor de reglas DEBERÁ aplicar únicamente los cambios asociados con ese nivel en los Datos canónicos.
3. CUANDO una resolución consulte una tabla de Misión, EL Motor de reglas DEBERÁ seleccionar la tabla, fila, columna, intervalo y resultado según las entradas y prioridades canónicas.
4. CUANDO una tabla produzca efectos adicionales, EL Motor de reglas DEBERÁ resolver los efectos en el orden definido por los Datos canónicos.
5. SI una tirada queda fuera de los intervalos registrados de una tabla, ENTONCES EL Motor de reglas DEBERÁ detener la resolución sin aplicar el resultado al Estado de partida.
6. CUANDO una tirada fuera de intervalo ya haya consumido aleatoriedad, EL Registro detallado DEBERÁ conservar el Consumo aleatorio y el intervalo ausente.
7. CUANDO una tabla contenga un intervalo ausente, solapado o contradictorio, EL Catálogo funcional DEBERÁ marcar la tabla como no publicable.
8. CUANDO se cree una Partida, EL Gestor de partidas DEBERÁ guardar el Nivel de dificultad dentro de la Instantánea inicial.
9. CUANDO una regla concreta de los requisitos 32, 33 o 36 a 39 defina una duración, una tabla o una variante, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 17.

### Requisito 18: Victoria y derrota de una partida

**Historia de usuario:** Como Jugador, quiero que cada Partida concluya según las condiciones de la Misión, para obtener un desenlace fiel e independiente.

#### Criterios de aceptación

1. CUANDO cambie un valor relacionado con un objetivo, EL Motor de reglas DEBERÁ evaluar las condiciones de victoria, derrota y finalización definidas por los Datos canónicos.
2. CUANDO se cumpla una condición de finalización, EL Motor de reglas DEBERÁ resolver precedencias, empates y resultados según los Datos canónicos.
3. CUANDO termine una Partida, EL Gestor de partidas DEBERÁ conservar el resultado y una Instantánea final sin modificar otras Partidas.
4. SI varias condiciones finales se cumplen simultáneamente y la precedencia no está resuelta, ENTONCES EL Motor de reglas DEBERÁ suspender el cierre sin modificar el resultado de la Partida ni consumir aleatoriedad.
5. CUANDO el Motor de reglas suspenda un cierre por falta de precedencia, EL Catálogo funcional DEBERÁ registrar una entrada de DP-002 con las condiciones y Referencias de fuente afectadas.
6. CUANDO una regla concreta del requisito 32 defina el objetivo, la duración o el momento de victoria o derrota de una Misión, EL Motor de reglas DEBERÁ aplicar la regla concreta en lugar de una regla genérica incompatible del requisito 18.

### Requisito 19: Aleatoriedad reproducible y auditable

**Historia de usuario:** Como Mantenedor, quiero reproducir cada resultado aleatorio, para depurar una Partida y demostrar cómo se obtuvo cada desenlace.

#### Criterios de aceptación

1. CUANDO se cree una Partida, EL Gestor de aleatoriedad DEBERÁ aceptar una Semilla introducida por el Propietario o generar una Semilla que pueda copiarse antes de la primera Acción irreversible.
2. EL Gestor de aleatoriedad DEBERÁ incluir en el Estado aleatorio la Semilla, la posición de secuencia y la Versión del algoritmo aleatorio.
3. CUANDO el Motor de reglas necesite aleatoriedad para una resolución aceptada, EL Gestor de aleatoriedad DEBERÁ producir un Consumo aleatorio con un identificador único dentro de la Partida y la siguiente posición consecutiva de secuencia.
4. CUANDO se registre un Consumo aleatorio, EL Registro detallado DEBERÁ conservar el identificador de Partida, la posición de secuencia, el contexto, el intervalo o tabla, el resultado bruto y el resultado interpretado.
5. CUANDO dos Partidas usen la misma Versión de reglas, Versión del algoritmo aleatorio, Semilla, estado inicial y secuencia de acciones aceptadas, EL Gestor de aleatoriedad DEBERÁ producir la misma secuencia de consumos.
6. CUANDO dos Partidas usen la misma Versión de reglas, estado inicial, secuencia de acciones aceptadas y secuencia de Consumos aleatorios, EL Motor de reglas DEBERÁ producir el mismo Estado de partida final.
7. CUANDO se reanude una Instantánea, EL Gestor de aleatoriedad DEBERÁ continuar desde la posición de secuencia guardada sin repetir ni omitir consumos.
8. SI una acción se cancela o se rechaza antes de requerir una resolución aleatoria, ENTONCES EL Gestor de aleatoriedad DEBERÁ conservar la posición de secuencia anterior.
9. SI una Instantánea contiene un Estado aleatorio incompatible, ENTONCES EL Gestor de partidas DEBERÁ impedir la reanudación sin sustituir la última Instantánea compatible.
10. CUANDO una Instantánea contenga un Estado aleatorio incompatible, EL Gestor de partidas DEBERÁ permitir exportar la Instantánea para diagnóstico.
11. EL Gestor de aleatoriedad DEBERÁ mantener inmutable la correspondencia entre cada Versión del algoritmo aleatorio y el procedimiento que genera la secuencia.

### Requisito 20: Registro simple y registro detallado

**Historia de usuario:** Como Jugador y Mantenedor, quiero un historial legible y otro de cálculo, para seguir la Partida o depurar las reglas con distinto nivel de detalle.

#### Criterios de aceptación

1. CUANDO se resuelva una acción o evento relevante, EL Registro simple DEBERÁ añadir una entrada con el identificador de Partida, un número de secuencia consecutivo, el turno, la fase, el actor, la acción y el resultado.
2. CUANDO se resuelva una tirada o consulta de tabla, EL Registro detallado DEBERÁ añadir una entrada con el identificador de Partida, un número de secuencia consecutivo, el valor bruto, el valor objetivo, los valores base, cada modificador con nombre y signo, la fórmula, la comparación y el resultado final.
3. CUANDO una resolución no requiera tirada, EL Registro detallado DEBERÁ añadir las entradas, reglas, prioridades y cálculos deterministas usados.
4. CUANDO una resolución use Datos canónicos, EL Registro detallado DEBERÁ incluir la Versión de reglas y las Referencias de fuente aplicables.
5. EL Gestor de partidas DEBERÁ guardar ambos registros dentro de cada Instantánea sin mezclar entradas de identificadores de Partida distintos.
6. EL Registro simple DEBERÁ ordenar sus entradas por el número de secuencia dentro de la Partida.
7. EL Registro detallado DEBERÁ ordenar sus entradas por el número de secuencia dentro de la Partida y por el orden de cálculo dentro de cada resolución.
8. CUANDO el Jugador cambie entre ambos registros, LA Interfaz DEBERÁ conservar el Estado de partida y la posición de lectura de cada registro.
9. SI una entrada detallada supera el espacio visible, ENTONCES LA Interfaz DEBERÁ permitir expandir y contraer la entrada sin eliminar contenido.

### Requisito 21: Integridad, errores y acciones no válidas

**Historia de usuario:** Como Jugador, quiero que un error no corrompa la Partida, para conservar un estado recuperable y comprender el problema.

#### Criterios de aceptación

1. EL Motor de reglas DEBERÁ aceptar únicamente acciones que mantengan las Invariantes funcionales definidas por los Datos canónicos.
2. SI una acción solicitada no es válida, ENTONCES EL Motor de reglas DEBERÁ conservar íntegros el Estado de partida y la posición de secuencia aleatoria anteriores a la solicitud.
3. CUANDO el Motor de reglas rechace una acción no válida, EL Motor de reglas DEBERÁ devolver una explicación en español.
4. SI una resolución produce un estado imposible según los Datos canónicos, ENTONCES EL Gestor de partidas DEBERÁ restaurar de forma atómica la última Instantánea confirmada completa de la Partida afectada, incluidos ambos registros y el Estado aleatorio.
5. CUANDO el Gestor de partidas restaure un estado imposible, EL Registro detallado DEBERÁ crear un Diagnóstico identificable que incluya la causa y el identificador de la Instantánea restaurada.
6. SI la Aplicación detecta datos persistentes corruptos, ENTONCES EL Gestor de partidas DEBERÁ aislar los datos afectados y conservar íntegramente las demás Partidas.
7. CUANDO la Aplicación recupere una Partida tras un cierre inesperado, EL Gestor de partidas DEBERÁ indicar la fecha y el identificador de la Instantánea restaurada.
8. SI un error corresponde a una ambigüedad de reglas, ENTONCES EL Catálogo funcional DEBERÁ vincular el Diagnóstico identificable con una entrada de DP-002 en el Registro de decisiones.
9. SI una operación falla antes de confirmar atómicamente una transición, ENTONCES EL Gestor de partidas DEBERÁ descartar los cambios parciales y conservar íntegros el Estado de partida y la posición de secuencia aleatoria de la última Instantánea confirmada.
10. CUANDO la Aplicación detecte un fallo de operación, EL Registro detallado DEBERÁ crear un Diagnóstico identificable antes de habilitar un reintento que pueda cambiar el Estado de partida.

### Requisito 22: Persistencia local, copias y migraciones manuales

**Historia de usuario:** Como Propietario, quiero conservar y trasladar manualmente mis Partidas, para mantener control local sin sincronización ni coste remoto.

#### Criterios de aceptación

1. EL Gestor de partidas DEBERÁ guardar Partidas, registros y preferencias en Almacenamiento local sin requerir conexión a AWS después de cargar el Paquete sin conexión.
2. CUANDO el Propietario solicite una exportación, EL Gestor de partidas DEBERÁ generar un Paquete de copia de seguridad con Versión de guardado, Suma de integridad, identificadores, Partidas seleccionadas, ambos registros y Estados aleatorios.
3. CUANDO el Propietario importe un Paquete de copia de seguridad, EL Gestor de partidas DEBERÁ validar íntegramente la Versión de guardado, la Suma de integridad, los identificadores, los Estados de partida, ambos registros y los Estados aleatorios antes de modificar el Almacenamiento local.
4. CUANDO finalice la validación de un Paquete de copia de seguridad válido, EL Gestor de partidas DEBERÁ recrear de forma atómica Estados de partida equivalentes, incluidos ambos registros y los Estados aleatorios.
5. SI un Paquete de copia de seguridad falla la comprobación de integridad o compatibilidad, ENTONCES EL Gestor de partidas DEBERÁ rechazar la importación y conservar íntegros los datos existentes.
6. CUANDO una nueva Versión de guardado requiera migración, EL Gestor de partidas DEBERÁ validar la compatibilidad y la conservación de todos los campos, incluidos ambos registros y el Estado aleatorio, antes de modificar el Almacenamiento local.
7. CUANDO una migración validada esté preparada para comenzar, EL Gestor de partidas DEBERÁ crear una copia recuperable de los datos anteriores antes de modificar el Almacenamiento local.
8. CUANDO una migración conserve todos los campos y supere la comprobación de integridad, EL Gestor de partidas DEBERÁ confirmar de forma atómica la nueva Versión de guardado.
9. SI una migración falla o no puede conservar un campo del Estado de partida, ENTONCES EL Gestor de partidas DEBERÁ cancelar todos los cambios de la migración y mantener la versión anterior recuperable.
10. LA Aplicación DEBERÁ excluir servicios y procesos de sincronización automática o manual mediante un servidor remoto.
11. CUANDO el Propietario traslade una Partida entre dispositivos, EL Gestor de partidas DEBERÁ exigir una exportación en el dispositivo de origen y una importación explícita en el dispositivo de destino.

### Requisito 23: Instalación PWA y funcionamiento sin conexión

**Historia de usuario:** Como Jugador, quiero instalar y usar la Aplicación sin conexión, para jugar en iPad o escritorio aunque la red no esté disponible.

#### Criterios de aceptación

1. LA PWA DEBERÁ cumplir los criterios de instalación del Navegador compatible mediante nombre, iconos propios, inicio independiente y manifiesto válido.
2. CUANDO finalice la descarga del Paquete sin conexión, LA PWA DEBERÁ informar qué Versión de reglas y Misiones están disponibles sin red.
3. MIENTRAS la Aplicación permanezca en Modo sin conexión, LA PWA DEBERÁ permitir iniciar, jugar, guardar, reanudar, reiniciar, exportar, importar y consultar reglas de todas las Misiones incluidas en el Paquete sin conexión.
4. MIENTRAS la Aplicación permanezca en Modo sin conexión, EL Gestor de partidas DEBERÁ persistir cada cambio aceptado en Almacenamiento local.
5. CUANDO se recupere la conexión, LA PWA DEBERÁ conservar el Estado de partida local antes de comprobar actualizaciones.
6. CUANDO exista una actualización, LA PWA DEBERÁ mostrar la versión nueva y solicitar confirmación antes de activarla durante una Partida abierta.
7. CUANDO el Propietario confirme una actualización, LA PWA DEBERÁ descargar y validar íntegramente el nuevo Paquete sin conexión antes de sustituir el paquete anterior.
8. SI la descarga, validación o activación de una actualización falla, ENTONCES LA PWA DEBERÁ conservar operativo el Paquete sin conexión completo anterior.
9. CUANDO una actualización falle, LA PWA DEBERÁ identificar la fase fallida y los recursos pendientes sin eliminar el paquete anterior.
10. SI el navegador elimina el Almacenamiento local, ENTONCES LA PWA DEBERÁ explicar que la recuperación requiere un Paquete de copia de seguridad previamente exportado.
11. SI un guardado en Modo sin conexión falla, ENTONCES EL Gestor de partidas DEBERÁ conservar íntegra la última Instantánea confirmada, incluida la posición de secuencia del Estado aleatorio, y mantener operativo el Paquete sin conexión vigente.

### Requisito 24: Interacción táctil, ratón y presentación del mapa

**Historia de usuario:** Como Jugador, quiero controlar el tablero mediante tacto en iPad y ratón en escritorio, para usar las mismas funciones en ambos dispositivos.

#### Criterios de aceptación

1. LA Interfaz DEBERÁ permitir ejecutar todas las acciones de juego mediante interacción táctil de un solo puntero.
2. LA Interfaz DEBERÁ permitir ejecutar todas las acciones de juego mediante clic, movimiento y arrastre de ratón sin exigir una pantalla táctil.
3. LA Interfaz DEBERÁ proporcionar controles visibles alternativos para cualquier función asociada con gesto, desplazamiento del puntero, botón secundario o rueda del ratón.
4. LA Interfaz DEBERÁ presentar objetivos táctiles con una dimensión mínima de 44 por 44 Píxeles CSS y una separación que evite solapamientos.
5. CUANDO el Jugador seleccione un Hexágono, Ficha o control, LA Interfaz DEBERÁ mostrar una confirmación visual antes de resolver una Acción irreversible.
6. CUANDO el Jugador amplíe, reduzca o desplace el Mapa hexagonal, LA Interfaz DEBERÁ conservar la selección y el Estado de partida.
7. CUANDO el iPad use orientación vertical, LA Interfaz DEBERÁ mantener accesibles el mapa, las acciones, los objetivos y ambos registros sin pérdida de estado.
8. CUANDO el iPad use orientación horizontal, LA Interfaz DEBERÁ mantener accesibles el mapa, las acciones, los objetivos y ambos registros sin pérdida de estado.
9. CUANDO cambie el tamaño de la ventana, LA Interfaz DEBERÁ adaptar la presentación sin pérdida de Estado de partida.
10. SI dos Fichas o marcadores comparten una ubicación permitida, ENTONCES LA Interfaz DEBERÁ ofrecer un método táctil y de ratón para inspeccionar cada elemento por separado.
11. CUANDO una misma acción válida se ejecute mediante tacto o mediante ratón desde el mismo Estado de partida, EL Motor de reglas DEBERÁ producir el mismo Estado de partida resultante y los mismos Consumos aleatorios.
12. SI una interacción no completa la confirmación exigida para una Acción irreversible, ENTONCES LA Interfaz DEBERÁ conservar el Estado de partida y la posición de secuencia aleatoria anteriores.

### Requisito 25: Accesibilidad perceptiva y operable

**Historia de usuario:** Como Jugador, quiero percibir y operar los elementos esenciales sin depender de color, precisión extrema o texto pequeño, para jugar de forma cómoda en una pantalla táctil.

#### Criterios de aceptación

1. LA Interfaz DEBERÁ identificar estados, bandos, selección, Orientación, terreno y resultados mediante texto, forma, patrón o icono además del color.
2. LA Interfaz DEBERÁ mantener una relación de contraste mínima de 4,5:1 para texto normal y de 3:1 para texto grande y controles esenciales.
3. CUANDO el navegador aplique una ampliación de texto del 200 %, LA Interfaz DEBERÁ conservar legibles los textos y accesibles los controles sin pérdida de contenido.
4. LA Interfaz DEBERÁ asociar un nombre accesible en español con cada control interactivo y cada Ficha seleccionable.
5. CUANDO una acción requiera elegir origen, destino, Orientación u objetivo, LA Interfaz DEBERÁ presentar instrucciones y estado de selección en texto.
6. SI una animación comunica un cambio de Estado de partida, ENTONCES LA Interfaz DEBERÁ presentar el mismo cambio mediante una entrada persistente y ordenada en el Registro simple.
7. CUANDO la Interfaz muestre un error, una decisión pendiente o un rechazo de acción, LA Interfaz DEBERÁ identificar en texto el control, la Ficha o la resolución afectada.

### Requisito 26: Acceso restringido a un único usuario

**Historia de usuario:** Como Propietario, quiero restringir la Aplicación a un usuario configurable, para impedir la entrega en línea a personas no autorizadas y disuadir el acceso local casual.

#### Criterios de aceptación

1. EL Control de acceso DEBERÁ reconocer exactamente un nombre de usuario configurable mediante el proceso administrativo de despliegue.
2. EL Control de acceso DEBERÁ exigir una clave de alta entropía asociada únicamente con el nombre de usuario configurado.
3. CUANDO una persona solicite en línea cualquier Recurso estático, LA CloudFront Function de acceso DEBERÁ validar la cabecera HTTP Basic antes de permitir la entrega.
4. SI una solicitud en línea no contiene exactamente la combinación configurada de nombre de usuario y clave, ENTONCES EL Control de acceso DEBERÁ responder con el desafío HTTP Basic que activa el diálogo nativo del navegador sin entregar el recurso solicitado.
5. EL Control de acceso DEBERÁ validar la autenticación en la solicitud del visor antes de acceder al Origen privado.
6. EL Control de acceso DEBERÁ mantener la clave fuera de la PWA, del Paquete sin conexión y de Amazon S3.
7. EL Control de acceso DEBERÁ mantener la credencial y el material de validación fuera de los registros técnicos.
8. CUANDO el Propietario cambie o recupere el nombre de usuario o la clave, LA Plataforma AWS DEBERÁ exigir un redespliegue administrativo de la CloudFront Function de acceso.
9. LA Aplicación DEBERÁ excluir funciones de recuperación o revelado de la clave desde la Interfaz.
10. CUANDO el Propietario complete una descarga válida del Paquete sin conexión, EL Bloqueo local DEBERÁ permitir inicializar un Verificador local mediante el mismo usuario y clave del Control de acceso.
11. MIENTRAS el dispositivo opere en Modo sin conexión, EL Bloqueo local DEBERÁ ocultar Partidas y reglas dentro de la Interfaz hasta validar el mismo usuario y clave.
12. EL Verificador local DEBERÁ comprobar la credencial sin almacenar una representación que permita recuperar la clave original.
13. LA Aplicación DEBERÁ informar que el Bloqueo local protege únicamente la Interfaz y no proporciona confidencialidad frente a quien controla el dispositivo.
14. LA Aplicación DEBERÁ informar que la autenticación en línea no puede revocar el acceso a Datos descargados ya almacenados en un dispositivo.

### Requisito 27: Alojamiento seguro en Amazon S3 y CloudFront

**Historia de usuario:** Como Propietario, quiero alojar la PWA con un origen privado y transporte cifrado, para reducir la superficie de acceso no autorizado.

#### Criterios de aceptación

1. LA Plataforma AWS DEBERÁ servir la Aplicación al navegador exclusivamente mediante HTTPS desde Amazon CloudFront.
2. LA Plataforma AWS DEBERÁ usar exclusivamente el Dominio CloudFront asignado con formato `*.cloudfront.net`.
3. LA Plataforma AWS DEBERÁ almacenar los Recursos estáticos en un Origen privado de Amazon S3 con el acceso público bloqueado.
4. CUANDO Amazon CloudFront solicite un recurso al Origen privado, LA Plataforma AWS DEBERÁ autorizar la lectura mediante Origin Access Control para la distribución aprobada.
5. SI una solicitud intenta acceder directamente al Origen privado sin autorización, ENTONCES LA Plataforma AWS DEBERÁ rechazar la solicitud.
6. LA Plataforma AWS DEBERÁ separar los permisos de despliegue de los permisos de lectura usados por la distribución.
7. LA Plataforma AWS DEBERÁ conceder a cada identidad o servicio únicamente las acciones y recursos necesarios para la función documentada.
8. CUANDO se despliegue una nueva versión, LA Plataforma AWS DEBERÁ conservar identificadores de versión de recursos que permitan retirar una versión defectuosa sin modificar Partidas locales.
9. SI una comprobación previa detecta acceso público al Origen privado, ENTONCES EL Bloqueo de producción DEBERÁ impedir el despliegue.
10. SI una comprobación previa detecta transporte en línea distinto de HTTPS, ENTONCES EL Bloqueo de producción DEBERÁ impedir el despliegue.
11. SI una comprobación previa detecta permisos superiores a los necesarios, ENTONCES EL Bloqueo de producción DEBERÁ impedir el despliegue.
12. SI falla la publicación de una nueva versión, ENTONCES LA Plataforma AWS DEBERÁ conservar disponible la última versión publicada válida sin modificar Partidas locales.

### Requisito 28: Arquitectura obligatoria de coste cero

**Historia de usuario:** Como Propietario, quiero un Coste autorizado de 0 €, para impedir que la Aplicación genere cargos previstos o variables.

#### Criterios de aceptación

1. LA Plataforma AWS DEBERÁ asociar la distribución exclusivamente con el Plan Gratuito CloudFront de 0 USD mensuales.
2. LA Plataforma AWS DEBERÁ limitar la entrega a una distribución estándar, AWS WAF incluido, protección DDoS incluida, TLS incluido, DNS incluido por el Dominio CloudFront, CloudFront Functions incluidas y un Origen privado S3 Standard.
3. LA Plataforma AWS DEBERÁ excluir CloudFront pay-as-you-go, dominios registrados, Lambda@Edge, AWS KMS, DNSSEC, logs de CloudFront Functions, métricas adicionales de CloudWatch, almacenamiento o consultas de CloudWatch no incluidos, Amazon Data Firehose y funciones no incluidas en el Plan Gratuito CloudFront.
4. LA Plataforma AWS DEBERÁ excluir cualquier recurso o característica que pueda generar un precio mensual superior al Coste autorizado.
5. LA Aplicación DEBERÁ ejecutar el Motor de reglas, el Gestor de aleatoriedad, ambos registros y el Gestor de partidas en el dispositivo del Propietario.
6. EL Gestor de partidas DEBERÁ ejecutar la persistencia de Partidas en el Almacenamiento local del dispositivo del Propietario.
7. MIENTRAS el Paquete sin conexión válido esté disponible, LA Aplicación DEBERÁ ejecutar el juego sin solicitudes a la Plataforma AWS.
8. LA Plataforma AWS DEBERÁ permitir la reutilización de Recursos estáticos desde Caché mediante identificadores de versión inmutables.
9. EL Bloqueo de producción DEBERÁ comprobar que la cuenta y la distribución cumplen los requisitos de elegibilidad vigentes del Plan Gratuito CloudFront.
10. EL Bloqueo de producción DEBERÁ comprobar que el almacenamiento S3 Standard previsto no supera el Crédito S3 Standard disponible de 5 GB.
11. EL Bloqueo de producción DEBERÁ exigir Cobertura gratuita verificada para el 100 % del almacenamiento S3 Standard previsto y para cada Categoría de operación S3 prevista, incluidas las solicitudes administrativas y las solicitudes de origen.
12. SI falta Cobertura gratuita verificada para cualquier parte del almacenamiento o cualquier Categoría de operación S3 prevista, ENTONCES EL Bloqueo de producción DEBERÁ impedir el despliegue de producción.
13. SI una comprobación estima un cargo superior a 0 €, ENTONCES EL Bloqueo de producción DEBERÁ impedir el despliegue de producción.
14. SI cambian el precio, las prestaciones incluidas o las condiciones de elegibilidad del Plan Gratuito CloudFront, ENTONCES EL Bloqueo de producción DEBERÁ exigir una nueva verificación antes del siguiente despliegue.
15. LA Aplicación DEBERÁ informar que S3 y CloudFront no pueden garantizar honestamente un coste de 0 € sin verificar por separado la cobertura gratuita del almacenamiento y de las operaciones S3 previstas.
16. LA Plataforma AWS DEBERÁ excluir una migración automática a una modalidad pay-as-you-go.

### Requisito 29: Monitorización gratuita y alertas informativas

**Historia de usuario:** Como Propietario, quiero recibir alertas gratuitas de consumo y gasto, para investigar desviaciones sin convertir una alerta en una garantía de corte.

#### Criterios de aceptación

1. LA Plataforma AWS DEBERÁ configurar un correo electrónico verificable para los Avisos de franquicia incluidos en el Plan Gratuito CloudFront.
2. CUANDO el consumo alcance el 50 % de la Franquicia del plan, LA Plataforma AWS DEBERÁ enviar el Aviso de franquicia incluido correspondiente.
3. CUANDO el consumo alcance el 80 % de la Franquicia del plan, LA Plataforma AWS DEBERÁ enviar el Aviso de franquicia incluido correspondiente.
4. CUANDO el consumo alcance el 100 % de la Franquicia del plan, LA Plataforma AWS DEBERÁ enviar el Aviso de franquicia incluido correspondiente.
5. LA Plataforma AWS DEBERÁ configurar un Zero spend budget con un destinatario de correo electrónico verificable.
6. CUANDO el Zero spend budget detecte gasto por encima de los límites gratuitos aplicables, LA Plataforma AWS DEBERÁ enviar la notificación por correo electrónico configurada.
7. LA Plataforma AWS DEBERÁ limitar la monitorización a capacidades incluidas sin coste adicional.
8. LA Plataforma AWS DEBERÁ excluir métricas adicionales, consultas, almacenamiento de registros y canales de entrega que no estén incluidos sin coste.
9. CUANDO se emita un Aviso de franquicia, LA Aplicación DEBERÁ identificar la notificación como informativa y no como un límite duro.
10. CUANDO se emita una alerta de AWS Budgets, LA Aplicación DEBERÁ identificar la notificación como informativa y no como un corte automático de cargos.
11. LA Plataforma AWS DEBERÁ mantener el Bloqueo de producción como control independiente de los Avisos de franquicia y del Zero spend budget.
12. CUANDO una alerta indique gasto o uso no previsto, LA Plataforma AWS DEBERÁ presentar al Propietario el procedimiento documentado para detener nuevas publicaciones y deshabilitar manualmente la entrega.

### Requisito 30: Protección y equivalencia funcional de recursos

**Historia de usuario:** Como Propietario, quiero usar recursos propios o autorizados que representen toda la información funcional, para respetar derechos sin perder fidelidad de juego.

#### Criterios de aceptación

1. LA Aplicación DEBERÁ utilizar Recursos propios para mapas, fichas, ilustraciones, iconos, maquetación y textos explicativos.
2. DONDE el Inventario de licencias documente un permiso verificable y compatible, LA Aplicación DEBERÁ utilizar el recurso autorizado únicamente dentro del alcance del permiso.
3. LA Aplicación DEBERÁ expresar las reglas visibles mediante redacción original en español de España que conserve el significado funcional sin reproducir la prosa del PDF fuente.
4. LA Plataforma AWS DEBERÁ limitar el paquete desplegado a Recursos propios y recursos autorizados en el Inventario de licencias.
5. EL Inventario de licencias DEBERÁ registrar autor, procedencia verificable, licencia, atribución requerida, alcance de uso y evidencia del permiso de cada recurso no propio.
6. SI un recurso carece de autoría propia o licencia documentada, ENTONCES LA Plataforma AWS DEBERÁ bloquear la incorporación del recurso al despliegue.
7. CUANDO una mecánica requiera cifras o relaciones del PDF fuente, EL Catálogo funcional DEBERÁ conservar los hechos necesarios con Referencia de fuente.
8. LA Interfaz DEBERÁ conservar de forma funcionalmente equivalente la identidad de unidad, el estado, el bando, la Orientación, el terreno, la topología, la posición y la legibilidad indicados por los Datos canónicos.
9. CUANDO la Interfaz represente un Mapa hexagonal propio, LA Matriz de conformidad DEBERÁ verificar la equivalencia de topología, terreno, posición y Orientación respecto de los Datos canónicos de la Página de Mapa.
10. CUANDO la Interfaz represente un contador propio, LA Matriz de conformidad DEBERÁ verificar la equivalencia de unidad, estado, bando y Orientación respecto del inventario funcional de la página 47.
11. SI una representación propia pierde información funcional exigida, ENTONCES EL Catálogo funcional DEBERÁ mantener el elemento en Estado no publicable.
12. LA Aplicación DEBERÁ excluir funciones de publicación, compartición pública o redistribución del contenido del PDF fuente.

### Requisito 31: Compatibilidad adaptable y aceptación en iPad

**Historia de usuario:** Como Propietario, quiero probar cada versión en un iPad estándar real y detectar capacidades, para conocer la compatibilidad efectiva sin prometer generaciones no verificadas.

#### Criterios de aceptación

1. LA Aplicación DEBERÁ declarar como objetivo un iPad estándar con Compatibilidad adaptable sin fijar una generación ni una versión mínima de iPadOS.
2. CUANDO se pruebe una versión, LA Matriz de conformidad DEBERÁ registrar el modelo de iPad estándar, la versión de iPadOS y la versión de Safari utilizados realmente.
3. CUANDO se inicie la Aplicación, LA Detección de capacidades DEBERÁ comprobar instalación PWA, Almacenamiento local, Modo sin conexión e interacción táctil de un solo puntero.
4. SI falta una capacidad obligatoria, ENTONCES LA Interfaz DEBERÁ identificar la capacidad ausente antes de iniciar una Partida.
5. CUANDO se prepare una versión publicable, LA Matriz de conformidad DEBERÁ registrar exactamente ocho comprobaciones para cada Entorno probado: instalación, inicio, Modo sin conexión, tacto, orientación vertical, orientación horizontal, guardado y reanudación.
6. SI falla una función obligatoria en un Entorno probado, ENTONCES LA Aplicación DEBERÁ mantener la versión en Estado no publicable para ese Entorno probado.
7. SI un Navegador compatible puede leer el Almacenamiento local pero no puede ejecutar una capacidad obligatoria, ENTONCES EL Gestor de partidas DEBERÁ permitir exportar los datos almacenados.
8. CUANDO una prueba complete una Misión, LA Matriz de conformidad DEBERÁ asociar el resultado con la Versión de reglas, la Semilla y la Versión de guardado utilizadas.
9. LA Interfaz DEBERÁ adaptar el mapa, los controles, los objetivos y los registros a las dimensiones detectadas del iPad estándar.

### Requisito 32: Catálogo verificado de las quince misiones

**Historia de usuario:** Como Jugador, quiero seleccionar una de las quince Misiones verificadas con un nombre propio en español, para jugar el objetivo y la duración correspondientes sin exponer texto inglés como contenido de juego.

#### Datos de aceptación verificados

| Misión | Nombre visible propio en español | Título inglés conservado solo como metadato | Turnos base | Objetivo de victoria | Referencia |
|---:|---|---|---:|---|---|
| 1 | Control del bosque I | Secure the Woods (1) | 4 | Eliminar la única Unidad alemana revelada | `FON-ML-2022-M01` |
| 2 | Control del bosque II | Secure the Woods (2) | 5 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M02` |
| 3 | Control del edificio | Secure the Building | 6 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M03` |
| 4 | Control de la colina | Secure the Hill | 6 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M04` |
| 5 | Control de la zona I | Secure the Area (1) | 6 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M05` |
| 6 | Control de la zona II | Secure the Area (2) | 6 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M06` |
| 7 | Control de la aldea I | Secure the Village (1) | 7 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M07` |
| 8 | Entrada en la iglesia | Enter the Church | 8 | Ocupar el Hexágono de la iglesia con cualquier Unidad británica, sin exigir eliminar las demás Unidades alemanas | `FON-ML-2022-M08` |
| 9 | Control de la aldea II | Secure the Village (2) | 8 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M09` |
| 10 | Control del bosque III | Secure the Woods (3) | 8 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M10` |
| 11 | Neutralizar la artillería alemana | Destroy the German Artillery | 8 | Destruir la Artillería alemana | `FON-ML-2022-M11` |
| 12 | Control de la aldea III | Secure the Village (3) | 8 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M12` |
| 13 | Jornada adversa | Unlucky for Some | 8 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M13` |
| 14 | Periferia de Caen | On the Outskirts of the City of Caen | 8 | Ocupar el Hexágono de la iglesia con cualquier Unidad británica | `FON-ML-2022-M14` |
| 15 | Control de la ciudad de Caen | Secure the City of Caen | 8 | Revelar y eliminar todas las Unidades alemanas | `FON-ML-2022-M15` |

Cada Referencia de misión `FON-ML-2022-Mnn` comprende la Página de reglas de Misión `16 + 2 × (N - 1)` y la Página de Mapa `17 + 2 × (N - 1)`.

#### Criterios de aceptación

1. EL Catálogo funcional DEBERÁ contener exactamente las quince Misiones de la tabla de datos de aceptación del requisito 32.
2. LA Interfaz DEBERÁ mostrar para cada Misión el nombre propio en español indicado en la tabla de datos de aceptación del requisito 32.
3. EL Catálogo funcional DEBERÁ conservar cada título inglés de la tabla de datos de aceptación del requisito 32 únicamente como metadato de trazabilidad.
4. CUANDO el Jugador inicie una Misión con duración base, EL Motor de reglas DEBERÁ asignar el número de turnos base indicado para la Misión.
5. LA Interfaz DEBERÁ ofrecer exactamente tres opciones de duración: duración base, un turno menos y un turno más.
6. CUANDO el Jugador cumpla el objetivo de la Misión hasta la conclusión del último turno disponible inclusive, EL Motor de reglas DEBERÁ declarar la victoria.
7. CUANDO concluya el último turno disponible sin que el objetivo se haya cumplido, EL Motor de reglas DEBERÁ declarar la derrota.
8. CUANDO el Jugador elija la variante de un turno menos, EL Motor de reglas DEBERÁ reducir en uno la duración base de la Misión.
9. CUANDO el Jugador elija la variante de un turno más, EL Motor de reglas DEBERÁ aumentar en uno la duración base de la Misión.
10. CUANDO el Jugador elija la duración base, EL Motor de reglas DEBERÁ conservar la duración indicada en la tabla.
11. CUANDO el Motor de reglas evalúe la victoria, EL Motor de reglas DEBERÁ aplicar únicamente el objetivo asociado con la Misión seleccionada.
12. MIENTRAS la Interfaz presente contenido de juego, LA Interfaz DEBERÁ utilizar exclusivamente el nombre propio en español de la Misión y mantener el título inglés fuera del contenido visible.

### Requisito 33: Fuerzas y tablas de revelado por misión

**Historia de usuario:** Como Jugador, quiero que cada Misión use las fuerzas, la Tabla de revelado y las unidades fijas verificadas, para reproducir su preparación sin añadir componentes inventados.

#### Fuerzas británicas verificadas

| Misiones | Fuerzas británicas |
|---|---|
| 1-2 | Escuadras de fusileros A y B |
| 3-4 | Escuadras de fusileros A, B y C |
| 5 | Escuadras de fusileros A y B, y Equipo MG |
| 6 | Escuadras de fusileros A, B y C, y Equipo MG |
| 7 | Escuadras de fusileros A, B y C, Mortero y PIAT |
| 8 | Escuadras de fusileros A y B, Equipo MG y Mortero |
| 9 | Escuadras de fusileros A y B, Equipo MG, Mortero y PIAT |
| 10 | Escuadras de fusileros A y B, Equipo MG y PIAT |
| 11 | Escuadras de fusileros A, B y C, y Equipo MG |
| 12 | Escuadras de fusileros A, B y C, Mortero y PIAT |
| 13 | Escuadras de fusileros A, B y C, Equipo MG y Mortero |
| 14-15 | Escuadras de fusileros A, B y C, Equipo MG y PIAT |

#### Tablas de revelado y unidades fijas verificadas

| Misiones | Resultado de d6 en cada Tabla de revelado | Unidades alemanas fijas adicionales |
|---|---|---|
| 1-2 | 1-2: HMG; 3-6: LMG | Ninguna indicada |
| 3-6 | 1-2: HMG; 3-4: LMG; 5-6: Fusileros | Ninguna indicada |
| 7 | 1: HMG; 2-3: LMG; 4-5: Fusileros; 6: Mina | Semioruga |
| 8 | 1: HMG; 2-4: LMG; 5: Fusileros; 6: Mina | LMG |
| 9 y 12 | 1-2: HMG; 3: LMG; 4-5: Fusileros; 6: Mina | Semioruga |
| 10 | 1-2: HMG; 3-4: LMG; 5-6: Fusileros | Semioruga y Artillería |
| 11 | 1: HMG; 2-3: LMG; 4-5: Fusileros; 6: Mina | Artillería y LMG |
| 13 | 1: HMG; 2-4: LMG; 5-6: Fusileros | Artillería y HMG |
| 14 | 1: HMG; 2-4: LMG; 5: Fusileros; 6: Mina | Semioruga, Artillería y HMG |
| 15 | 1: HMG; 2-4: LMG; 5: Fusileros; 6: Mina | Artillería y LMG |

Las Referencias de fuente son las Páginas de reglas de Misión pares 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42 y 44.

#### Criterios de aceptación

1. CUANDO se prepare una Misión, EL Motor de reglas DEBERÁ incluir exactamente las Fuerzas británicas asociadas con la Misión en la tabla de fuerzas del requisito 33.
2. CUANDO una Incógnita produzca un Revelado, EL Motor de reglas DEBERÁ transformar el resultado de d6 mediante la fila de la Misión en la tabla de revelado del requisito 33.
3. CUANDO se prepare una Misión con Unidades alemanas fijas adicionales, EL Motor de reglas DEBERÁ incluir revelada cada unidad fija indicada en la fila de la Misión.
4. CUANDO se prepare la Misión 8, EL Motor de reglas DEBERÁ incluir una LMG alemana fija y revelada en el Hexágono de la iglesia.
5. CUANDO se prepare la Misión 11, EL Motor de reglas DEBERÁ incluir reveladas una Artillería alemana fija y una LMG alemana fija.
6. CUANDO una fila indique que no existe una unidad fija adicional, EL Catálogo funcional DEBERÁ registrar la ausencia explícita.
7. EL Catálogo funcional DEBERÁ asociar cada fila de fuerzas y revelado con las Referencias de misión correspondientes.
8. SI la posición u Orientación visual de una unidad fija no ha superado DP-001, ENTONCES EL Catálogo funcional DEBERÁ mantener la preparación afectada en Estado no publicable.

### Requisito 34: Activación y tablas de órdenes británicas

**Historia de usuario:** Como Jugador, quiero activar las unidades en la secuencia verificada y convertir cada tirada en órdenes exactas, para resolver los turnos de forma reproducible.

#### Tablas de órdenes verificadas

| d6 | Escuadra de fusileros | Equipo MG | Mortero | PIAT |
|---:|---|---|---|---|
| 1 | Reagrupar / Granada (`RAL/GRE`) | Reagrupar / Avanzar (`RAL/ADV`) | Reagrupar / Avanzar (`RAL/ADV`) | Reagrupar / Avanzar (`RAL/ADV`) |
| 2 | Avanzar / Explorar (`ADV/SCO`) | Avanzar / Cobertura (`ADV/COV`) | Reagrupar / Avanzar (`RAL/ADV`) | Avanzar / Cobertura (`ADV/COV`) |
| 3 | Avanzar / Cobertura (`ADV/COV`) | Avanzar / Cobertura (`ADV/COV`) | Reagrupar / Avanzar (`RAL/ADV`) | Avanzar / Cobertura (`ADV/COV`) |
| 4 | Fuego / Cobertura (`FIRE/COV`) | Cobertura / Fuego (`COV/FIRE`) | Avanzar / Cobertura (`ADV/COV`) | Cobertura / Fuego (`COV/FIRE`) |
| 5 | Fuego / Avanzar (`FIRE/ADV`) | Fuego / Cobertura (`FIRE/COV`) | Avanzar / Cobertura (`ADV/COV`) | Fuego / Cobertura (`FIRE/COV`) |
| 6 | Avanzar / Fuego (`ADV/FIRE`) | Fuego / Cobertura (`FIRE/COV`) | Avanzar / Cobertura (`ADV/COV`) | Fuego / Cobertura (`FIRE/COV`) |

Referencias de fuente principales: turnos y activación en las páginas 6 y 7; Órdenes en las páginas 7 y 8; resumen en la página 14.

#### Criterios de aceptación

1. CUANDO comience una Misión, EL Motor de reglas DEBERÁ marcar el primer turno.
2. CUANDO se resuelva un turno, EL Motor de reglas DEBERÁ permitir activar una por una todas las Unidades británicas antes de activar cualquier Unidad alemana.
3. CUANDO finalice la activación de todas las Unidades británicas, EL Motor de reglas DEBERÁ permitir activar cada Unidad alemana una vez en el orden elegido por el Jugador.
4. CUANDO se active una Unidad alemana que tenga Zona de fuego, EL Motor de reglas DEBERÁ resolver exactamente un ataque contra cada Unidad británica adyacente situada dentro de la Zona de fuego de la Unidad alemana.
5. EL Motor de reglas DEBERÁ excluir Zonas de fuego propias para todas las Unidades británicas.
6. CUANDO comience la activación de una Unidad británica, EL Gestor de aleatoriedad DEBERÁ producir una tirada de 2d6.
7. CUANDO se obtenga la tirada de activación, EL Motor de reglas DEBERÁ cruzar el primer d6 con la primera columna y el segundo d6 con la segunda columna de la Tabla de órdenes del tipo de Unidad británica.
8. CUANDO una Unidad británica con Moral normal al comienzo de la activación obtenga dos valores distintos, LA Interfaz DEBERÁ ofrecer exactamente cuatro opciones: ejecutar solo la Orden del primer d6, ejecutar solo la Orden del segundo d6, ejecutar ambas órdenes o descartar ambos resultados.
9. CUANDO el Jugador elija ejecutar solo la Orden del primer d6, EL Motor de reglas DEBERÁ resolver la Orden de la primera columna y descartar el resultado del segundo d6.
10. CUANDO el Jugador elija ejecutar solo la Orden del segundo d6, EL Motor de reglas DEBERÁ resolver la Orden de la segunda columna y descartar el resultado del primer d6.
11. CUANDO el Jugador elija ejecutar ambas órdenes, EL Motor de reglas DEBERÁ resolver primero la Orden de la primera columna y después la Orden de la segunda columna.
12. CUANDO el Jugador elija descartar dos resultados no dobles, EL Motor de reglas DEBERÁ finalizar la activación de la Unidad británica sin ejecutar una Orden.
13. CUANDO una tirada de activación muestre dobles, LA Interfaz DEBERÁ permitir conservar la fila obtenida o volver a tirar ambos dados.
14. CUANDO una repetición de la tirada vuelva a mostrar dobles, LA Interfaz DEBERÁ ofrecer de nuevo conservar la fila obtenida o volver a tirar ambos dados sin imponer un límite de repeticiones.
15. CUANDO una Unidad británica con Moral normal al comienzo de la activación conserve un doble, LA Interfaz DEBERÁ permitir elegir solo una de las dos órdenes de la fila o descartar ambos resultados.
16. MIENTRAS una Unidad británica haya comenzado la activación con Moral baja, EL Motor de reglas DEBERÁ permitir ejecutar únicamente la Orden de la primera columna o no ejecutar ninguna Orden, con independencia de que la tirada sea doble o no doble.
17. MIENTRAS una Unidad británica haya comenzado la activación con Moral baja, CUANDO Reagrupar cambie la unidad a Moral normal, EL Motor de reglas DEBERÁ finalizar la activación sin habilitar la Orden de la segunda columna.
18. EL Motor de reglas DEBERÁ utilizar exactamente las seis filas de cada tipo de unidad indicadas en la Tabla de órdenes del requisito 34.
19. SI el Jugador solicita una opción de Orden distinta de las permitidas por el estado de Moral y la tirada, ENTONCES EL Motor de reglas DEBERÁ rechazar la opción sin cambiar el Estado de partida ni efectuar otro Consumo aleatorio.

### Requisito 35: Efectos concretos de las órdenes

**Historia de usuario:** Como Jugador, quiero que cada Orden tenga el alcance y las restricciones verificadas, para conocer las consecuencias antes de confirmarla.

Referencias de fuente principales: páginas 7 y 8; Moral y Revelado en las páginas 9 y 10; resumen en la página 14.

#### Criterios de aceptación

1. CUANDO una Unidad británica resuelva Avanzar, EL Motor de reglas DEBERÁ mover la unidad exactamente un Hexágono en una de las tres Direcciones hacia delante.
2. CUANDO una Unidad británica avance a un Hexágono ocupado únicamente por Unidades británicas, EL Motor de reglas DEBERÁ permitir compartir el Hexágono sin limitar el número de Unidades británicas apiladas.
3. SI el destino de Avanzar contiene una Unidad alemana, ENTONCES EL Motor de reglas DEBERÁ conservar la posición de la Unidad británica.
4. CUANDO una Unidad británica termine Avanzar adyacente a una o más Incógnitas, EL Motor de reglas DEBERÁ revelar todas las Incógnitas adyacentes.
5. CUANDO una Unidad británica resuelva Fuego, EL Motor de reglas DEBERÁ permitir seleccionar exactamente una Unidad alemana adyacente en cualquiera de las seis direcciones.
6. CUANDO se resuelva Fuego británico, EL Motor de reglas DEBERÁ tirar 2d6 y comparar el total modificado con el Valor para impactar aplicable.
7. CUANDO una Escuadra de fusileros resuelva Granada, EL Motor de reglas DEBERÁ permitir seleccionar exactamente una Unidad alemana adyacente.
8. CUANDO se resuelva Granada, EL Motor de reglas DEBERÁ aplicar un Valor para impactar fijo de 6+ sin modificadores de terreno, Flanqueo, Apoyo ni Mortero.
9. CUANDO una Unidad británica resuelva Cobertura, EL Motor de reglas DEBERÁ añadir un modificador acumulable de +1 contra los ataques que admitan Cobertura.
10. CUANDO una Unidad británica con Cobertura acumulada resuelva Avanzar, EL Motor de reglas DEBERÁ eliminar toda la Cobertura acumulada de la unidad.
11. CUANDO una Unidad británica con Moral baja resuelva Reagrupar, EL Motor de reglas DEBERÁ cambiar la unidad a Moral normal.
12. MIENTRAS una Unidad británica haya comenzado la activación con Moral baja, EL Motor de reglas DEBERÁ finalizar la activación después de resolver Reagrupar como primera Orden.
13. CUANDO una Escuadra de fusileros resuelva Explorar, EL Motor de reglas DEBERÁ permitir seleccionar exactamente una Incógnita situada a distancia hexagonal 2.
14. CUANDO Explorar revele una Unidad alemana, LA Interfaz DEBERÁ permitir elegir una Orientación entre las Direcciones inferiores que no apunte fuera del Mapa hexagonal.
15. MIENTRAS una unidad sea un Equipo MG, un Mortero o un PIAT, EL Motor de reglas DEBERÁ excluir Explorar de sus acciones aceptables.

### Requisito 36: Terreno y valores para impactar

**Historia de usuario:** Como Jugador, quiero aplicar valores base y modificadores de terreno concretos, para comprobar cada ataque con los mismos umbrales que la fuente.

#### Valores base verificados

| Atacante o efecto | Valor para impactar y alcance funcional |
|---|---|
| Escuadra de fusileros británica, Fuego | 8+ contra Unidad alemana adyacente |
| Escuadra de fusileros británica, Granada | 6+ fijo contra Unidad alemana adyacente, sin bonos ni penalizadores |
| Equipo MG británico, Fuego | 6+ |
| PIAT británico | 7+ únicamente contra Semiorugas y Unidades alemanas en edificios |
| HMG alemana | 5+ |
| LMG alemana | 6+ |
| Fusileros alemanes | 8+ |
| Semioruga alemana | 6+ |
| Artillería alemana | 10+ |
| Mina | 7+ sin modificadores |

Referencias de fuente principales: terreno en la página 5; Semioruga, PIAT y Minas en las páginas 12 y 13; Artillería y Ríos en la página 13; resumen en la página 14.

#### Criterios de aceptación

1. EL Motor de reglas DEBERÁ utilizar los Valores para impactar de la tabla del requisito 36 para los atacantes y efectos indicados.
2. CUANDO el defensor de un ataque que admite terreno se encuentre en bosque, EL Motor de reglas DEBERÁ sumar 1 al Valor para impactar.
3. CUANDO el defensor de un ataque que admite terreno se encuentre en un edificio, EL Motor de reglas DEBERÁ sumar 2 al Valor para impactar.
4. CUANDO un atacante realice un ataque que admite colina desde una colina, EL Motor de reglas DEBERÁ restar 1 al Valor para impactar.
5. MIENTRAS una resolución sea una Granada, EL Motor de reglas DEBERÁ excluir el modificador por atacar desde una colina.
6. CUANDO atacante y defensor se encuentren en terreno despejado sin otro modificador aplicable, EL Motor de reglas DEBERÁ conservar el Valor para impactar sin modificación de terreno.
7. SI una ruta intenta cruzar un lado de Río sin puente, ENTONCES EL Motor de reglas DEBERÁ conservar la posición inicial de la Ficha.
8. CUANDO una ruta cruce un Río mediante un puente, EL Motor de reglas DEBERÁ permitir el cruce sujeto a las demás restricciones de Avanzar.
9. CUANDO una línea de ataque atraviese un Río, EL Motor de reglas DEBERÁ conservar la elegibilidad del ataque respecto del Río.
10. CUANDO varios modificadores compatibles se apliquen a un ataque, EL Motor de reglas DEBERÁ calcular y registrar la suma algebraica de los modificadores.
11. MIENTRAS una resolución sea una Granada o una prueba de Mina, EL Motor de reglas DEBERÁ excluir todos los modificadores del Valor para impactar.
12. CUANDO un PIAT seleccione un objetivo, EL Motor de reglas DEBERÁ aceptar únicamente una Semioruga o una Unidad alemana situada en un edificio.
13. CUANDO un PIAT ataque a una Unidad alemana situada en un edificio, EL Motor de reglas DEBERÁ excluir el modificador defensivo de +2 del edificio.

### Requisito 37: Moral, zonas de fuego y revelado

**Historia de usuario:** Como Jugador, quiero que impactos, Orientación y Revelados produzcan estados concretos, para conservar la información táctica verificada.

Referencias de fuente principales: Moral y Revelado en las páginas 9 y 10; resumen en la página 14.

#### Criterios de aceptación

1. CUANDO una Unidad británica con Moral normal reciba un impacto, EL Motor de reglas DEBERÁ cambiar la unidad a Moral baja.
2. CUANDO una Unidad británica con Moral baja reciba un impacto, EL Motor de reglas DEBERÁ eliminar la unidad.
3. CUANDO una Unidad alemana reciba un impacto válido, EL Motor de reglas DEBERÁ eliminar la unidad.
4. EL Motor de reglas DEBERÁ permitir que una Escuadra de fusileros británica dispare contra una Unidad alemana adyacente en cualquier dirección sin crear una Zona de fuego propia.
5. EL Motor de reglas DEBERÁ calcular la Zona de fuego de una Unidad alemana como el Hexágono frontal y los dos Hexágonos frontales adyacentes que existan dentro de los bordes del Mapa hexagonal.
6. CUANDO Avanzar deje una Unidad británica adyacente a una Incógnita, EL Motor de reglas DEBERÁ revelar la Incógnita mediante la Tabla de revelado de la Misión.
7. CUANDO una Incógnita revele una Unidad alemana por adyacencia a una única Unidad británica reveladora, EL Motor de reglas DEBERÁ orientar la Unidad alemana hacia la Unidad británica reveladora.
8. SI dos o más Unidades británicas son reveladoras simultáneas y los Datos canónicos no definen un desempate de Orientación, ENTONCES EL Motor de reglas DEBERÁ suspender la elección de Orientación sin seleccionar una unidad reveladora.
9. CUANDO el Motor de reglas suspenda una Orientación por múltiples unidades reveladoras, EL Catálogo funcional DEBERÁ registrar una entrada de DP-002 con la Referencia de fuente aplicable.
10. CUANDO Explorar revele una Incógnita situada exactamente a dos Hexágonos, EL Motor de reglas DEBERÁ usar la Tabla de revelado sin efectuar una prueba inmediata de Mina.
11. CUANDO Explorar revele una Unidad alemana, EL Motor de reglas DEBERÁ usar la Orientación inferior válida elegida por el Jugador.
12. CUANDO una Tabla de revelado produzca una Mina, EL Motor de reglas DEBERÁ sustituir la Incógnita por la Mina en el mismo Hexágono.
13. MIENTRAS una Mina permanezca en el Mapa hexagonal, EL Motor de reglas DEBERÁ conservar la Mina en el Hexágono.

### Requisito 38: Flanqueo, apoyo y mortero

**Historia de usuario:** Como Jugador, quiero acumular únicamente las ventajas tácticas permitidas, para distinguir fuego directo, granadas y apoyo de Mortero.

Referencias de fuente principales: Flanqueo y Mortero en las páginas 11 y 12; resumen en la página 14.

#### Criterios de aceptación

1. CUANDO una Unidad británica dispare desde fuera de la Zona de fuego de la Unidad alemana objetivo, EL Motor de reglas DEBERÁ restar 1 al Valor para impactar por Flanqueo.
2. CUANDO una o más Unidades británicas distintas de la unidad atacante principal se encuentren adyacentes a la Unidad alemana objetivo, EL Motor de reglas DEBERÁ restar 1 al Valor para impactar por cada OTRA unidad de Apoyo, incluido un Mortero adyacente, sin imponer un máximo fijo de unidades de Apoyo.
3. CUANDO un Mortero se encuentre exactamente a dos Hexágonos de la Unidad alemana objetivo, EL Motor de reglas DEBERÁ restar 2 al Valor para impactar.
4. CUANDO un Mortero se encuentre adyacente a la Unidad alemana objetivo, EL Motor de reglas DEBERÁ aplicar una única resta de 1 como Apoyo normal en lugar del modificador de Mortero de -2.
5. CUANDO un ataque admita terreno, Apoyo y Mortero, EL Motor de reglas DEBERÁ acumular los modificadores compatibles.
6. EL Motor de reglas DEBERÁ utilizar el Mortero únicamente como modificador de otro ataque y no como atacante directo.
7. MIENTRAS una resolución sea una Granada, EL Motor de reglas DEBERÁ excluir modificadores de Flanqueo, Apoyo y Mortero.
8. CUANDO se resuelva un ataque con ventajas tácticas, EL Registro detallado DEBERÁ identificar por separado cada modificador de Flanqueo, cada unidad de Apoyo y el modificador de Mortero.
9. CUANDO varias Unidades británicas elegibles estén adyacentes a la Unidad alemana objetivo, EL Motor de reglas DEBERÁ aplicar el número real de modificadores de Apoyo sin imponer un máximo fijo de unidades de Apoyo.

### Requisito 39: Semiorugas, PIAT, minas y artillería

**Historia de usuario:** Como Jugador, quiero que los elementos especiales respeten sus excepciones verificadas, para evitar aplicar reglas generales incompatibles.

Referencias de fuente principales: Semioruga, PIAT y Minas en las páginas 12 y 13; Artillería en la página 13; resumen en la página 14.

#### Criterios de aceptación

1. CUANDO se prepare una Semioruga fija, EL Motor de reglas DEBERÁ colocarla revelada, en terreno despejado y con la Orientación indicada visualmente por la Página de Mapa.
2. CUANDO un ataque tenga una Semioruga como objetivo, EL Motor de reglas DEBERÁ aceptar únicamente un PIAT como atacante principal.
3. CUANDO otras Unidades británicas estén adyacentes a una Semioruga atacada por un PIAT, EL Motor de reglas DEBERÁ aplicar cada unidad elegible como Apoyo.
4. CUANDO un PIAT seleccione objetivo, EL Motor de reglas DEBERÁ limitar los objetivos a Semiorugas y Unidades alemanas situadas en edificios.
5. CUANDO un PIAT ataque a una Unidad alemana situada en un edificio, EL Motor de reglas DEBERÁ omitir el modificador de +2 del edificio.
6. CUANDO un PIAT resuelva un ataque, EL Motor de reglas DEBERÁ aplicar el Valor para impactar base de 7+ y los modificadores compatibles de colina, bosque, Apoyo, Flanqueo y Mortero.
7. CUANDO una Mina se revele por adyacencia desde la Misión 7 en adelante, EL Motor de reglas DEBERÁ efectuar inmediatamente una tirada de 2d6 por la Unidad británica reveladora.
8. CUANDO una prueba de Mina obtenga 7 o más, EL Motor de reglas DEBERÁ aplicar un impacto sin modificadores a la Unidad británica comprobada.
9. CUANDO una Mina se revele mediante Explorar, EL Motor de reglas DEBERÁ omitir la prueba inmediata de Mina.
10. CUANDO llegue la fase de activación alemana, EL Motor de reglas DEBERÁ efectuar por separado una prueba de Mina de 7+ sin modificadores para cada Unidad británica situada dentro de una Mina.
11. CUANDO una Unidad británica avance a un Hexágono con Mina, EL Motor de reglas DEBERÁ permitir la entrada sujeta a las demás restricciones de Avanzar.
12. MIENTRAS una Mina esté colocada, EL Motor de reglas DEBERÁ excluir acciones que retiren la Mina.
13. CUANDO se prepare Artillería fija, EL Motor de reglas DEBERÁ colocarla revelada, en terreno despejado y sin Orientación.
14. MIENTRAS una Unidad alemana sea Artillería, EL Motor de reglas DEBERÁ excluir el Flanqueo contra la Artillería.
15. CUANDO llegue la fase de activación alemana, EL Motor de reglas DEBERÁ resolver exactamente un ataque independiente de Artillería contra cada Unidad británica que no esté en bosque, no esté en un edificio y no tenga Cobertura acumulada.
16. MIENTRAS una Unidad británica esté en bosque, esté en un edificio o tenga Cobertura acumulada, EL Motor de reglas DEBERÁ excluir la Unidad británica de los objetivos de Artillería.
17. CUANDO la Artillería ataque a una Unidad británica elegible, EL Motor de reglas DEBERÁ usar un Valor para impactar fijo de 10+.
18. CUANDO un ataque válido impacte a la Artillería, EL Motor de reglas DEBERÁ eliminar la Artillería como a cualquier otra Unidad alemana.

### Requisito 40: Catálogo visual de mapas y contadores propios

**Historia de usuario:** Como Mantenedor, quiero transcribir y revisar cada elemento visual sin copiar las ilustraciones, para construir mapas fieles con Recursos propios.

Referencias de fuente: Mapas en las páginas 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43 y 45; inventario funcional de contadores en la página 47.

#### Criterios de aceptación

1. EL Catálogo funcional DEBERÁ representar por separado la red irregular de Hexágonos de cada Página de Mapa.
2. EL Catálogo funcional DEBERÁ registrar para cada Misión las coordenadas, adyacencias, bordes, posibles entradas, bosques, edificios, colinas, Ríos, puentes, Incógnitas y unidades fijas visibles en la Página de Mapa.
3. CUANDO una Página de Mapa muestre dos posibles entradas, EL Catálogo funcional DEBERÁ conservar ambas entradas como opciones distintas de preparación.
4. CUANDO se complete una transcripción de mapa, LA Matriz de conformidad DEBERÁ exigir una segunda pasada visual independiente de la transcripción que compare cada Hexágono y conexión con la Página de Mapa.
5. CUANDO se complete la segunda pasada visual, LA Matriz de conformidad DEBERÁ registrar la fecha, el resultado, la Referencia de misión y la identidad del Mantenedor que realizó la pasada.
6. SI una coordenada, conexión, terreno, entrada, Incógnita, unidad fija u Orientación no puede verificarse visualmente, ENTONCES EL Catálogo funcional DEBERÁ mantener el elemento afectado en Estado no publicable.
7. SI un dato de mapa no aparece en la Página de Mapa ni en otra Referencia de fuente de `FON-ML-2022`, ENTONCES EL Catálogo funcional DEBERÁ excluir el dato de los Datos canónicos.
8. EL Catálogo funcional DEBERÁ inventariar en la página 47 los contadores funcionales para Moral normal y baja, Fusileros, LMG, HMG, Artillería, Semioruga, Cobertura, Incógnitas, Minas y turno.
9. EL Inventario de licencias DEBERÁ clasificar como Recursos propios los diseños distribuidos para cada contador funcional inventariado.
10. LA Interfaz DEBERÁ distinguir mediante diseño propio cada tipo, estado, bando y Orientación de contador exigidos por los Datos canónicos.
11. LA Interfaz DEBERÁ conservar mediante diseño propio el terreno, la topología y la posición funcional de cada Mapa hexagonal.
12. LA Plataforma AWS DEBERÁ excluir del paquete desplegado las ilustraciones, mapas y contadores reproducidos del PDF fuente.
13. MIENTRAS un Mapa hexagonal no haya superado la Segunda revisión visual correspondiente, EL Catálogo funcional DEBERÁ mantener en Estado no publicable el Mapa hexagonal completo y la preparación de la Misión afectada.

## Mejoras futuras fuera de alcance

- **Campaña configurable:** posible función futura para agrupar Misiones y conservar historial. La función no forma parte del alcance base, no podrá atribuirse a `FON-ML-2022` y requerirá una especificación independiente antes de definir cualquier relación entre Partidas.

## Fuentes técnicas oficiales

El contenido técnico de esta sección y de los requisitos 27 a 29 está **parafraseado** a partir de documentación oficial de AWS:

- [CloudFront flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html): prestaciones y exclusiones del plan, nivel Free, ausencia de cargos por exceso de franquicia, avisos al 50 %, 80 % y 100 %, CloudFront Functions incluidas y crédito mensual de 5 GB para S3 Standard. La misma fuente advierte que determinadas funciones, registros, métricas, consultas y servicios pueden generar cargos adicionales; el crédito S3 indicado se refiere al almacenamiento S3 Standard y no demuestra por sí solo cobertura gratuita de todas las operaciones S3.
- [Using a budget template (simplified)](https://docs.aws.amazon.com/cost-management/latest/userguide/budget-templates.html): la plantilla `Zero spend budget` notifica cuando el gasto supera los límites gratuitos aplicables.

## Matriz resumida de cobertura solicitada

| Área solicitada | Requisitos principales |
|---|---|
| Fuente única `FON-ML-2022`, páginas, fidelidad y ambigüedades | 1, 2, 4, 30, 32, 33, 40 y DP-001 a DP-003 |
| Quince Misiones, nombres, duración y objetivos | 4, 5 y 32 |
| Fuerzas, tablas de revelado y unidades fijas | 5, 17 y 33 |
| Activación, dobles y Tablas de órdenes | 8 y 34 |
| Efectos de Avanzar, Fuego, Granada, Cobertura, Reagrupar y Explorar | 8, 10, 11, 12, 13 y 35 |
| Terreno, Ríos y Valores para impactar | 10, 11, 12, 16 y 36 |
| Moral, Zonas de fuego y Revelado | 9, 13, 14 y 37 |
| Flanqueo, Apoyo y Mortero | 14, 15 y 38 |
| Semiorugas, PIAT, Minas y Artillería | 15, 16 y 39 |
| Mapas, coordenadas visuales y contadores propios | 4, 30, 40 y DP-001 |
| Dificultad, victoria y derrota | 17, 18 y 32 |
| Partidas individuales independientes y varios guardados | 6, 7, 18 y 22 |
| Aleatoriedad reproducible y auditable | 19 |
| Registro simple y detallado | 20 |
| Persistencia local y exportación/importación manual sin sincronización | 22 y 23 |
| PWA y funcionamiento sin conexión | 23 |
| iPad estándar adaptable, tacto, orientaciones y accesibilidad | 24, 25 y 31 |
| Único usuario, HTTP Basic y Bloqueo local | 26 y 27 |
| Plan Gratuito CloudFront, S3 privado y bloqueo de coste 0 € | 27 y 28 |
| Avisos gratuitos e informativos | 29 |
| Recursos propios y equivalencia funcional | 30 y 40 |

## Condición para cerrar la fase de requisitos

La fase podrá considerarse lista para diseño cuando el Propietario revise este documento y confirme el alcance de Partidas individuales independientes. DP-001 deberá resolverse para cada Misión antes de publicar el Mapa correspondiente. DP-002 deberá resolverse para cada contenido ambiguo afectado antes de publicarlo. DP-003 deberá resolverse únicamente cuando se pretenda incorporar un recurso no propio. El Bloqueo de producción deberá verificar autenticación, elegibilidad del Plan Gratuito CloudFront y Cobertura gratuita verificada de S3 antes de cualquier despliegue de producción.
