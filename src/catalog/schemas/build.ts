/**
 * Contrato de entrada y salida del compilador de catálogo (Tarea 2.2).
 *
 * `MaintenanceCatalog` es la fuente estructurada de mantenimiento que el
 * Mantenedor cura a partir de FON-ML-2022 (identidades de Misión, fuerzas,
 * revelado, tablas de órdenes, tipos de Ficha, reglas generales, decisiones y
 * conformidad). El {@link CatalogCompiler} la valida en modo fail-closed y, si
 * todo es coherente, emite un {@link RulesCatalog} inmutable estampado con una
 * `rulesVersion` NUEVA. Nunca reescribe una versión ya publicada.
 *
 * Este módulo define únicamente la FORMA (tipos `Readonly`) del contrato de
 * compilación y los tipos de error/resultado. La lógica de validación vive en
 * `src/catalog/compiler/`. Módulo puro: no importa DOM, IndexedDB, red, reloj
 * ni SDK de AWS.
 *
 * Frontera con el dominio: el puerto `CatalogCompiler` del dominio
 * (`src/domain/ports/catalog.ts`) declara `MaintenanceCatalog`,
 * `CatalogBuildResult` y `PublicationReport` como marcas opacas provisionales.
 * Los tipos concretos son estos; la implementación del catálogo refina el
 * puerto sin invertir la dependencia (el dominio no importa el catálogo).
 */
import type {
  CatalogId,
  MissionId,
  RulesVersion,
} from "../../domain/identity/index.js";
import type {
  CanonicalRule,
  CatalogItem,
  MissionDefinition,
  RulesCatalog,
} from "./catalog.js";
import type {
  ConformanceEntry,
  DecisionRecord,
} from "./publication.js";
import type { OrderTable, PieceDefinition } from "./placeholders.js";

/**
 * Fuente estructurada de mantenimiento que consume el compilador.
 *
 * - `rulesVersionCandidate`: identificador de la Versión de reglas que se
 *   desea emitir. Debe ser NUEVO respecto de cualquier versión ya publicada.
 * - `missions`: las Misiones inventariadas (exactamente quince tras validar).
 * - `pieceTypes` / `orderTables`: elementos inventariados indexados por clave.
 * - `generalRules`: reglas generales canónicas (páginas 5-14).
 * - `decisions` / `conformance`: trazabilidad de decisiones y Matriz de
 *   conformidad.
 */
export type MaintenanceCatalog = Readonly<{
  rulesVersionCandidate: RulesVersion;
  missions: readonly MissionDefinition[];
  pieceTypes: Readonly<Record<string, CatalogItem<PieceDefinition>>>;
  orderTables: Readonly<Record<string, CatalogItem<OrderTable>>>;
  generalRules: readonly CatalogItem<CanonicalRule>[];
  decisions?: readonly DecisionRecord[];
  conformance?: readonly ConformanceEntry[];
}>;

/** Código estable de cada clase de fallo de compilación fail-closed. */
export type CatalogValidationCode =
  | "duplicate-id"
  | "missing-reference"
  | "table-coverage"
  | "table-overlap"
  | "mission-count"
  | "mission-number"
  | "inventory-relation"
  | "source-authority"
  | "version-rewrite"
  | "unknown-condition";

/**
 * Fallo estructurado de validación. `code` identifica la clase de problema;
 * `messageEs` lo describe en es-ES; `catalogIds`/`missionIds` localizan los
 * elementos implicados para trazabilidad.
 */
export type CatalogValidationError = Readonly<{
  code: CatalogValidationCode;
  messageEs: string;
  catalogIds?: readonly CatalogId[];
  missionIds?: readonly MissionId[];
}>;

/**
 * Resultado de la compilación fail-closed.
 *
 * - `built`: la validación global pasó; `catalog` es inmutable y lleva la
 *   `rulesVersion` nueva.
 * - `failed`: la validación falló; `errors` contiene al menos un fallo y NO se
 *   emite catálogo (fail-closed).
 */
export type CatalogBuildResult =
  | Readonly<{ kind: "built"; catalog: RulesCatalog }>
  | Readonly<{
      kind: "failed";
      errors: readonly [CatalogValidationError, ...CatalogValidationError[]];
    }>;

/**
 * Puerto concreto del compilador de catálogo (refina el puerto del dominio con
 * los tipos ricos de esta capa). `compile` es puro y determinista.
 */
export interface CatalogCompiler {
  compile(input: MaintenanceCatalog): CatalogBuildResult;
}
