/**
 * Puertos del compilador de catálogo y el Publication Gate (diseño §1).
 *
 * `CatalogCompiler` convierte fuentes estructuradas de mantenimiento en un
 * `RulesCatalog`; no lee el PDF ni extrae recursos. `PublicationGate` agrega
 * decisiones, revisiones, licencias y conformidad, y opera fail-closed: solo
 * las Misiones `published` llegan al selector jugable.
 */
import type { CatalogBuildResult, MaintenanceCatalog, PublicationReport } from "./placeholders.js";

export interface CatalogCompiler {
  compile(input: MaintenanceCatalog): CatalogBuildResult;
}

export interface PublicationGate {
  evaluate(catalog: MaintenanceCatalog): PublicationReport;
}
