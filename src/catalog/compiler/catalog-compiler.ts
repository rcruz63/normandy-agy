/**
 * `CatalogCompiler` fail-closed (Tarea 2.2).
 *
 * Convierte una {@link MaintenanceCatalog} curada por el Mantenedor en un
 * {@link RulesCatalog} inmutable. El compilador:
 *
 * 1. rechaza reescribir una Versión de reglas ya publicada (requisito 1.10):
 *    el `rulesVersionCandidate` debe ser NUEVO;
 * 2. ejecuta la validación global fail-closed (identificadores únicos,
 *    referencias, cobertura/no solapamiento de tablas, exactamente quince
 *    Misiones y relaciones de inventario) mediante {@link validateMaintenanceCatalog};
 * 3. genera la Matriz de conformidad (una entrada única por elemento
 *    inventariado) y falla ante elementos huérfanos, faltantes, con prueba
 *    fallida o no verificados necesarios para una Misión, mediante
 *    {@link generateConformanceMatrix} (Tarea 26.1);
 * 4. solo si no hay ningún fallo, emite un catálogo inmutable estampado con la
 *    `rulesVersion` nueva, la Matriz de conformidad generada, la Segunda
 *    revisión visual (revisor, fecha, resultado y Referencia de misión, sin
 *    guardar páginas ni capturas del PDF) y las Partidas de aceptación
 *    (asociadas con Versión de reglas, Semilla y Versión de guardado); ante
 *    cualquier fallo devuelve `kind: "failed"` sin emitir catálogo.
 *
 * `compile` es puro y determinista: no lee el PDF, no accede a red/reloj y no
 * muta su entrada. Módulo puro: sin DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { RulesVersion } from "../../domain/identity/index.js";
import { rulesCatalog } from "../schemas/catalog.js";
import type {
  CatalogBuildResult,
  CatalogCompiler,
  CatalogValidationError,
  MaintenanceCatalog,
} from "../schemas/build.js";
import { validateMaintenanceCatalog } from "./catalog-validator.js";
import { generateConformanceMatrix } from "./conformance-matrix.js";

/** Opciones de construcción del compilador. */
export type CatalogCompilerOptions = Readonly<{
  /**
   * Versiones de reglas ya publicadas e inmutables. El compilador NUNCA
   * reescribe ninguna de ellas: si el `rulesVersionCandidate` coincide con una,
   * la compilación falla (requisito 1.10, fail-closed).
   */
  publishedVersions?: readonly RulesVersion[];
}>;

/**
 * Comprueba que el candidato de Versión de reglas no colisiona con ninguna
 * versión ya publicada. Devuelve el fallo si colisiona, o `undefined`.
 */
function checkVersionRewrite(
  candidate: RulesVersion,
  published: ReadonlySet<string>,
): CatalogValidationError | undefined {
  const key = candidate as unknown as string;
  if (typeof key !== "string" || key.trim().length === 0) {
    return {
      code: "unknown-condition",
      messageEs:
        "El candidato de Versión de reglas está indeterminado; no puede emitirse (fail-closed).",
    };
  }
  if (published.has(key)) {
    return {
      code: "version-rewrite",
      messageEs: `La Versión de reglas «${key}» ya está publicada; una versión publicada nunca se reescribe. Emita una versión nueva.`,
    };
  }
  return undefined;
}

/**
 * Crea un {@link CatalogCompiler} fail-closed.
 *
 * `publishedVersions` es el registro inmutable de versiones ya publicadas que
 * el compilador debe preservar sin reescribir.
 */
export function createCatalogCompiler(
  options: CatalogCompilerOptions = {},
): CatalogCompiler {
  const published = new Set<string>(
    (options.publishedVersions ?? []).map((v) => v as unknown as string),
  );

  return Object.freeze({
    compile(input: MaintenanceCatalog): CatalogBuildResult {
      const errors: CatalogValidationError[] = [];

      // 1. Nunca reescribir una versión publicada.
      const rewrite = checkVersionRewrite(input.rulesVersionCandidate, published);
      if (rewrite !== undefined) {
        errors.push(rewrite);
      }

      // 2. Validación global fail-closed.
      errors.push(...validateMaintenanceCatalog(input));

      // 3. Generación de la Matriz de conformidad y gate de aceptación
      //    fail-closed (huérfanos/faltantes/fallidos/no verificados).
      const conformance = generateConformanceMatrix(input);
      errors.push(...conformance.errors);

      // 4. Fail-closed: cualquier fallo impide emitir el catálogo.
      if (errors.length > 0) {
        return Object.freeze({
          kind: "failed",
          errors: Object.freeze(errors) as readonly [
            CatalogValidationError,
            ...CatalogValidationError[],
          ],
        });
      }

      // Emitir catálogo inmutable estampado con la rulesVersion nueva, la Matriz
      // de conformidad generada, la Segunda revisión visual y las Partidas de
      // aceptación (Versión de reglas, Semilla y Versión de guardado).
      const catalog = rulesCatalog({
        rulesVersion: input.rulesVersionCandidate,
        missions: input.missions,
        pieceTypes: input.pieceTypes,
        orderTables: input.orderTables,
        generalRules: input.generalRules,
        conformance: conformance.matrix,
        ...(input.decisions !== undefined ? { decisions: input.decisions } : {}),
        ...(input.visualReviews !== undefined
          ? { visualReviews: input.visualReviews }
          : {}),
        ...(input.acceptanceRuns !== undefined
          ? { acceptanceRuns: input.acceptanceRuns }
          : {}),
      });

      return Object.freeze({ kind: "built", catalog });
    },
  });
}
