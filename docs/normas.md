# Directrices de Desarrollo y Mantenimiento de Código para Agentes IA

Este documento define las reglas de obligado cumplimiento para la generación y modificación de código en este repositorio. El objetivo principal es garantizar que todo el código sea **fácilmente comprensible, auditable y mantenible por un desarrollador humano sin asistencia de IA**.

---

## 1. Idioma y Nomenclatura

Se aplica una separación estricta entre el código y la documentación/metadatos:

- **Código fuente en inglés (US/UK consistente):**
  - Nombres de variables, funciones, clases, constantes, rutas de ficheros, interfaces y endpoints deben escribirse exclusivamente en inglés.
  - Ejemplo: `getUserProfile`, `maxRetryAttempts`, `PaymentService`.
- **Textos, documentación y comunicación en español (España):**
  - Comentarios en el código, docstrings/JSDoc explicativos.
  - Documentos técnicos (`README.md`, guías, diagramas, arquitectura).
  - Mensajes de error orientados al usuario o logs funcionales (salvo logs técnicos estándar).
  - Mensajes de commit y descripciones de Pull Requests/Merge Requests.

---

## 2. Flujo de Git y Commits

- **Commits atómicos y por tarea:**
  - Prohibido acumular cambios dispares en un único commit.
  - Cada commit debe representar un cambio lógico unitario (por ejemplo: crear un esquema, añadir una función pura, escribir sus tests).
- **Conventional Commits en español:**
  - Estructura obligatoria: `<tipo>(<ámbito opcional>): <descripción>`
  - Tipos admitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
  - La descripción debe comenzar en minúscula, en modo imperativo y en español.
  - *Ejemplos válidos:*
    - `feat(auth): añadir validación de expiración de token de sesión`
    - `test(billing): incluir casos límite para cálculo de iva intracomunitario`
    - `refactor(parser): aplicar cláusulas de guarda en procesador de eventos`
    - `docs(api): documentar endpoints del módulo de pagos`

---

## 3. Modularidad y Organización de Ficheros

- **Principio de Responsabilidad Única (SRP):** Cada fichero debe pertenecer a un único dominio funcional bien delimitado.
- **Tamaño acotado:**
  - Los ficheros no deben superar las **200-250 líneas** de código (salvo excepciones justificadas de esquemas de datos o definiciones de tipos).
  - Si un fichero empieza a gestionar más de una abstracción, debe subdividirse en submódulos dentro del mismo dominio.
- **Jerarquía limpia:** Dependencias e importaciones estrictamente unidireccionales; prohibidas las dependencias circulares.

---

## 4. Diseño de Funciones y Métodos

- **Atomicidad:** Cada función debe resolver una única tarea y tener un propósito evidente reflejado en su nombre en inglés.
- **Longitud máxima:** Mantener funciones por debajo de **25-30 líneas**. Si requieren más espacio, deben descomponerse en funciones auxiliares privadas.
- **Tipado estricto y contratos explícitos:**
  - Obligatorio el uso de tipos en parámetros y valores de retorno.
  - Prohibidos los tipos opacos o comodín (`any`, `Object`, mapas/diccionarios genéricos sin esquema).
- **Inmutabilidad y pureza:**
  - Favorece funciones puras (mismas entradas producen mismas salidas, sin efectos colaterales en variables globales ni mutación de parámetros pasados por referencia).

---

## 5. Control de Flujo y Complejidad Ciclomática

- **Prohibido el anidamiento profundo (*Deep Nested Ifs*):**
  - Profundidad máxima de indentación permitida dentro de una función: **2 niveles**.
- **Cláusulas de guarda obligatorias (*Early Returns*):**
  - Valida precondiciones, nulos y casos de error al principio de la función saliendo de inmediato o lanzando excepción.
  - El camino principal (*happy path*) debe residir en el nivel base de indentación.

*Ejemplo de contraste:*
```text
// EVITAR:
function procesar(item) {
    if (item != null) {
        if (item.activo) {
            if (item.saldo > 0) {
                ejecutar(item);
            }
        }
    }
}

// OBLIGATORIO:
function procesar(item) {
    if (item == null) return;
    if (!item.activo) return;
    if (item.saldo <= 0) return;

    ejecutar(item);
}

```

---

## 6. Gestión de Errores y Robustez

- **Cero excepciones silenciadas:** Prohibidos los bloques `catch`/`except` vacíos o que únicamente emitan un log sin mitigar el fallo o relanzar la excepción.
- **Fallar rápido (*Fail-Fast*):** Notificar errores en el punto exacto donde se producen; no propagar datos corruptos o valores nulos silenciosos.
- **Sin código fantasma:** Prohibido generar stubs simulados vacíos, funciones incompletas no solicitadas (`pass`, `TODO`) o dependencias ficticias.

---

## 7. Configuración y Desacoplamiento

- **Prohibidos los valores mágicos (*Magic Numbers / Strings*):**
  - Constantes semánticas en inglés para códigos, timeouts, umbrales o nombres de colas.
- **Variables de entorno:**
  - Toda configuración que varíe según el entorno (claves, URLs, puertos, credenciales) debe leerse de la configuración centralizada o del entorno, nunca hardcodeada.

---

## 8. Documentación para Humanos

- **Comentarios útiles:**
  - Comentar en español el **por qué** (motivos de diseño, restricciones técnicas o reglas de negocio complejas), nunca el qué cuando el código ya sea evidente.
- **Artefactos del repositorio:**
  - Mantener actualizados `README.md`, esquemas de arquitectura y guías de uso en español ante cualquier modificación funcional o técnica relevante.

---

## 9. Pruebas Unitarias como Especificación

- **Cobertura obligatoria:** Toda funcionalidad debe acompañarse de pruebas para:
  1. Flujo de éxito.
  2. Casos límite (nulos, colecciones vacías, desbordamientos).
  3. Errores y excepciones controladas.
- **Legibilidad:** Nombres de pruebas descriptivos y directos, sin lógica interna compleja (sin bucles ni ramas condicionales en el propio test).
