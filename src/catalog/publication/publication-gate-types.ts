/**
 * Tipos públicos del Publication Gate (Tarea 2.3).
 *
 * Este submódulo aísla la superficie de tipos del Gate —la causa estructurada de
 * bloqueo, el informe de publicación y el contrato del Gate— de la lógica de
 * evaluación (`publication-gate.ts`). Al separar la definición de la forma de
 * los datos de la lógica que los produce, la superficie pública queda descrita
 * en un único lugar auditable y la implementación puede evolucionar sin mezclar
 * abstracciones.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { CatalogId, MissionId } from "../../domain/identity/index.js";
import type { MaintenanceCatalog } from "../schemas/build.js";
import type {
  ConformanceEntry,
  PublicationBlockerKind,
} from "../schemas/publication.js";

/**
 * Causa estructurada por la que un elemento o Misión no es publicable.
 *
 * - `kind`: clase de bloqueo, reutilizando {@link PublicationBlockerKind}.
 * - `missionId`: Misión afectada, cuando el bloqueo es atribuible a una.
 * - `catalogId`: Dato canónico o recurso concreto implicado, cuando aplica.
 * - `decisionId` / `resourceId`: referencia a la decisión o al recurso.
 * - `detailEs`: descripción en es-ES para trazabilidad.
 */
export type PublicationBlocker = Readonly<{
  kind: PublicationBlockerKind;
  detailEs: string;
  missionId?: MissionId;
  catalogId?: CatalogId;
  decisionId?: string;
  resourceId?: string;
}>;

/**
 * Informe de publicación emitido por el Gate.
 *
 * - `rulesVersionCandidate`: Versión de reglas evaluada.
 * - `publishableMissionIds`: Misiones que SÍ pueden entregarse al selector
 *   (todas sus comprobaciones pasan). Vacío si ninguna es publicable.
 * - `blockers`: todas las causas de bloqueo encontradas (globales y por Misión).
 * - `inventoryCoverage`: la Matriz de conformidad considerada al evaluar.
 */
export type PublicationReport = Readonly<{
  rulesVersionCandidate: string;
  publishableMissionIds: readonly MissionId[];
  blockers: readonly PublicationBlocker[];
  inventoryCoverage: readonly ConformanceEntry[];
}>;

/** Contrato concreto del Gate (refina el puerto del dominio). */
export interface PublicationGate {
  evaluate(catalog: MaintenanceCatalog): PublicationReport;
}
