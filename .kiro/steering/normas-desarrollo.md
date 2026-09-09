---
inclusion: auto
---

# Normas de desarrollo

Objetivo: todo el código debe ser comprensible, auditable y mantenible por una persona sin ayuda de IA. Estas normas aplican al TypeScript de dominio puro de este repositorio y a cualquier trabajo delegado a subagentes.

## 1. Idioma y nomenclatura
- Identificadores de CÓDIGO en inglés: variables, funciones, clases, constantes, tipos, interfaces, rutas de fichero y endpoints (ej.: `getUserProfile`, `maxRetryAttempts`, `PaymentService`).
- En español (es-ES): comentarios, JSDoc/docstrings, documentación técnica, mensajes de commit y de PR, y textos/mensajes orientados al usuario.
- La terminología de DOMINIO del juego que aparece como texto visible o como valor de `messageKey` (Misión, Hexágono, Moral, etc.) permanece en es-ES. Esto NO afecta a los identificadores de código, que siguen en inglés.

## 2. Git y commits
- Commits atómicos: un commit por cambio lógico unitario (una tarea). No mezclar cambios dispares.
- Conventional Commits en español, con estructura `<tipo>(<ámbito opcional>): <descripción>`.
- Tipos admitidos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
- Descripción en minúscula, en modo imperativo y en español.

## 3. Modularidad
- Responsabilidad única (SRP) por fichero: un solo dominio funcional bien delimitado.
- Tamaño acotado a 200-250 líneas por fichero (excepción justificada para esquemas de datos o definiciones de tipos).
- Sin dependencias circulares; importaciones estrictamente unidireccionales.

## 4. Funciones
- Atómicas: una única tarea con propósito evidente en su nombre en inglés.
- Longitud por debajo de 25-30 líneas; si crecen, descomponer en auxiliares privadas.
- Tipado estricto y explícito en parámetros y retorno. Prohibido `any` u otros tipos comodín sin esquema.
- Favorecer pureza e inmutabilidad: sin efectos colaterales ni mutación de parámetros.

## 5. Control de flujo
- Máximo 2 niveles de indentación dentro de una función.
- Cláusulas de guarda / early returns para precondiciones, nulos y errores.
- El happy path reside en el nivel base de indentación.

## 6. Errores
- Cero excepciones silenciadas: nada de `catch`/`except` vacíos ni que solo registren sin mitigar o relanzar.
- Fail-fast: notificar el error donde se produce; no propagar datos corruptos ni nulos silenciosos.
- Sin código fantasma: nada de stubs vacíos, funciones incompletas, `TODO` no solicitados ni dependencias ficticias.

## 7. Configuración
- Sin valores mágicos: usar constantes semánticas en inglés para códigos, timeouts, umbrales o nombres de colas.
- Configuración por entorno (claves, URLs, puertos, credenciales) leída de config centralizada o del entorno; nunca hardcodeada.

## 8. Documentación
- Comentar en español el "por qué" (decisiones de diseño, restricciones técnicas, reglas de negocio complejas), no el "qué" obvio.
- Mantener al día `README.md`, esquemas de arquitectura y guías ante cambios relevantes.

## 9. Pruebas
- Cubrir flujo de éxito, casos límite (nulos, colecciones vacías, desbordamientos) y errores controlados.
- Nombres de test descriptivos y directos.
- Sin lógica compleja dentro del test (nada de bucles ni ramas condicionales en el propio test).
