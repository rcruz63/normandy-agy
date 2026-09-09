/**
 * Modelos de dominio de la migración de generaciones de almacenamiento
 * (Tarea 16.3, requisitos 22.6, 22.7, 22.8, 22.9, 22.10).
 *
 * La Tarea 1 fijó la FIRMA del puerto `MigrationRegistry` con tipos opacos
 * (marcas) en `ports/placeholders.ts`. La Tarea 16.3 SUSTITUYE esos marcadores
 * (`StorageGeneration`, `MigrationPlan`, `MigrationResult`) por los modelos
 * reales que atraviesan la frontera de migración:
 *
 * - {@link StorageGeneration}: representación EN MEMORIA de una generación de
 *   almacenamiento (conjunto de Instantáneas confirmadas con su Versión de
 *   guardado), NO IndexedDB. La orquestación (Tarea 16.3, `application/`) la
 *   construye leyendo la generación activa y la escribe tras validar.
 * - {@link Migrator}: transformación PURA `(StorageGeneration) => StorageGeneration`
 *   entre dos Versiones de guardado contiguas. No accede a DOM, IndexedDB, red,
 *   reloj ni `Math.random`.
 * - {@link MigrationPlan}: cadena EXPLÍCITA y ordenada de {@link Migrator} que
 *   lleva de una Versión de guardado de origen a otra de destino, sin saltos ni
 *   `default` silencioso.
 * - {@link MigrationResult}: éxito (nueva {@link StorageGeneration} migrada) o
 *   fallo tipado (`field-not-preserved`, `invariant-violation`,
 *   `integrity-mismatch`, etc.) fail-fast, sin datos parcialmente migrados.
 *
 * CONSERVACIÓN (requisito 22.6): una migración debe conservar todos los campos,
 * AMBOS registros (simple y detallado) y el Estado aleatorio. Un migrador solo
 * puede transformar intencionadamente lo que su conversión declara; nunca puede
 * DESCARTAR una Partida ni vaciar sus registros o su Estado aleatorio (diseño
 * §6: «una migración no puede descartar campos desconocidos»).
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es PURO. No
 * importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`. Reutiliza el {@link GameSnapshot} real de `engine/state.js`.
 */
import type { Brand, SaveVersion } from "../identity/index.js";
import type { GameSnapshot } from "../engine/state.js";
import type { InvariantViolation } from "../invariants/index.js";

// ---------------------------------------------------------------------------
// Generación de almacenamiento en memoria
// ---------------------------------------------------------------------------

/**
 * Identificador de una generación de almacenamiento (activa/anterior/staging).
 * Coincide en forma con el `GenerationId` del adaptador de IndexedDB, pero se
 * declara aquí como marca del dominio para no acoplar el dominio al adaptador.
 */
export type GenerationId = Brand<string, "GenerationId">;

/**
 * Representación EN MEMORIA de una generación de almacenamiento: el conjunto de
 * Instantáneas confirmadas de una Versión de guardado dada. NO es IndexedDB; la
 * orquestación (`application/`) la construye leyendo la generación activa y la
 * consolida tras validar. Cada Instantánea porta su Estado, ambos registros y
 * Estado aleatorio, por lo que la conservación se comprueba sobre esta forma.
 */
export type StorageGeneration = Readonly<{
  id: GenerationId;
  saveVersion: SaveVersion;
  games: readonly GameSnapshot[];
}>;

// ---------------------------------------------------------------------------
// Migradores puros y plan de migración
// ---------------------------------------------------------------------------

/**
 * Transformación PURA de una generación entre dos Versiones de guardado
 * contiguas. `apply` recibe una generación con `from` y devuelve otra con `to`;
 * no muta la entrada ni realiza efectos. El registro (Tarea 16.3) compone estos
 * migradores en un {@link MigrationPlan}.
 */
export type Migrator = Readonly<{
  from: SaveVersion;
  to: SaveVersion;
  apply: (input: StorageGeneration) => StorageGeneration;
}>;

/**
 * Cadena EXPLÍCITA y ordenada de migradores que lleva de `from` a `to`. Cada
 * paso encadena con el siguiente (`steps[i].to === steps[i + 1].from`) sin
 * huecos; `MigrationRegistry.plan` la construye o devuelve `undefined` si no
 * existe ruta (nunca un `default` silencioso).
 */
export type MigrationPlan = Readonly<{
  from: SaveVersion;
  to: SaveVersion;
  steps: readonly Migrator[];
}>;

// ---------------------------------------------------------------------------
// Resultado de la migración (fail-fast, tipado)
// ---------------------------------------------------------------------------

/**
 * Motivos por los que una migración falla-cerrado. El llamante decide en
 * función de `reason` sin analizar cadenas, en coherencia de estilo con
 * `BackupRejectionReason`/`ImportRejectionReason`:
 *
 * - `empty-plan`: el plan no contiene ningún migrador (nada que aplicar de forma
 *   demostrablemente conservadora).
 * - `plan-version-mismatch`: la Versión de guardado de la generación de entrada
 *   no coincide con el origen del plan.
 * - `broken-chain`: dos pasos consecutivos del plan no encadenan sus Versiones.
 * - `field-not-preserved`: un migrador descartó una Partida, un registro o el
 *   Estado aleatorio que debía conservar (requisito 22.9).
 * - `invariant-violation`: una Instantánea migrada rompe una Invariante del
 *   dominio (requisito 22.6).
 * - `integrity-mismatch`: la Versión de guardado resultante no coincide con el
 *   destino esperado del plan.
 */
export type MigrationRejectionReason =
  | "empty-plan"
  | "plan-version-mismatch"
  | "broken-chain"
  | "field-not-preserved"
  | "invariant-violation"
  | "integrity-mismatch";

/**
 * Migración satisfactoria: la nueva generación migrada, con su Versión de
 * guardado de destino y todas las Instantáneas conservadas y transformadas.
 */
export type MigrationSuccess = Readonly<{
  ok: true;
  generation: StorageGeneration;
}>;

/**
 * Rechazo tipado de una migración. Fail-fast: nunca se devuelve una generación
 * parcialmente migrada. `detail` aporta contexto `es-ES` para diagnóstico;
 * `violations` acompaña a `invariant-violation` con las Invariantes rotas.
 */
export type MigrationFailure = Readonly<{
  ok: false;
  reason: MigrationRejectionReason;
  detail: string;
  violations?: readonly InvariantViolation[];
}>;

/** Resultado de `MigrationRegistry.migrate`: éxito o fallo tipado. */
export type MigrationResult = MigrationSuccess | MigrationFailure;

/** Construye un {@link MigrationFailure} inmutable. */
export function migrationFailure(
  reason: MigrationRejectionReason,
  detail: string,
  violations?: readonly InvariantViolation[],
): MigrationFailure {
  return Object.freeze(
    violations === undefined
      ? { ok: false, reason, detail }
      : { ok: false, reason, detail, violations },
  );
}

/** Construye un {@link MigrationSuccess} inmutable. */
export function migrationSuccess(
  generation: StorageGeneration,
): MigrationSuccess {
  return Object.freeze({ ok: true, generation });
}
