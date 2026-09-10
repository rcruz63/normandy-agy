/**
 * Punto de entrada del compilador de catálogo fail-closed (Tarea 2.2).
 *
 * Reexporta el `CatalogValidator` (validación global) y el `CatalogCompiler`
 * (emisión de catálogo inmutable con `rulesVersion` nueva, sin reescribir
 * versiones publicadas). Módulo puro.
 */
export {
  validateMaintenanceCatalog,
  REQUIRED_MISSION_COUNT,
} from "./catalog-validator.js";
export {
  createCatalogCompiler,
  type CatalogCompilerOptions,
} from "./catalog-compiler.js";
export {
  generateConformanceMatrix,
  type ConformanceMatrixResult,
} from "./conformance-matrix.js";
