/**
 * Primitivas reutilizables de validación de catálogo (Tarea 2.2).
 *
 * Este submódulo aísla las utilidades genéricas de validación —acumulación de
 * fallos, registro de identificadores únicos, autoridad/trazabilidad de las
 * Referencias de fuente y cobertura/no solapamiento de una tabla canónica— del
 * orquestador específico del catálogo (`catalog-validator.ts`). Al separar la
 * abstracción «cómo se valida un dato aislado» de la abstracción «qué se valida
 * en un catálogo completo», cada fichero conserva una única responsabilidad y
 * resulta auditable por separado.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { CatalogId, MissionId } from "../../domain/identity/index.js";
import { SOURCE_VERSION } from "../schemas/source-ref.js";
import type { SourceRef } from "../schemas/source-ref.js";
import type { CanonicalTable } from "../schemas/catalog.js";
import type { CatalogValidationError } from "../schemas/build.js";

/** Acumulador mutable interno de fallos; la salida pública es inmutable. */
export class ErrorSink {
  private readonly errors: CatalogValidationError[] = [];

  public add(error: CatalogValidationError): void {
    this.errors.push(Object.freeze(error));
  }

  public snapshot(): readonly CatalogValidationError[] {
    return Object.freeze([...this.errors]);
  }
}

/** Comprueba que una Referencia de fuente tiene autoridad `FON-ML-2022`. */
function isAuthoritative(ref: SourceRef): boolean {
  return ref.sourceVersion === SOURCE_VERSION;
}

/**
 * Registra un identificador en el conjunto global, marcando duplicados. No
 * devuelve valor: el efecto observable es el fallo acumulado ante colisión.
 */
export function registerId(
  seen: Map<string, string>,
  id: CatalogId | MissionId,
  scope: string,
  sink: ErrorSink,
): void {
  const key = id as unknown as string;
  const previous = seen.get(key);
  if (previous !== undefined) {
    sink.add({
      code: "duplicate-id",
      messageEs: `El identificador «${key}» se repite en «${scope}» y «${previous}»; cada elemento inventariado debe tener un identificador único.`,
      catalogIds: [id as unknown as CatalogId],
    });
    return;
  }
  seen.set(key, scope);
}

/** Valida trazabilidad y autoridad de una lista de Referencias de fuente. */
export function validateSourceRefs(
  refs: readonly SourceRef[],
  scope: string,
  sink: ErrorSink,
  id?: CatalogId,
): void {
  if (refs.length === 0) {
    sink.add({
      code: "missing-reference",
      messageEs: `«${scope}» debe conservar al menos una Referencia de fuente.`,
      ...(id !== undefined ? { catalogIds: [id] } : {}),
    });
    return;
  }
  for (const ref of refs) {
    if (isAuthoritative(ref)) continue;
    sink.add({
      code: "source-authority",
      messageEs: `«${scope}» referencia una fuente distinta de ${SOURCE_VERSION}; se excluye de los Datos canónicos.`,
      ...(id !== undefined ? { catalogIds: [id] } : {}),
    });
  }
}

/**
 * Revisa las filas de una tabla canónica y acumula solapamientos: filas fuera
 * del dominio declarado y entradas con más de una salida. Devuelve el conjunto
 * de entradas efectivamente cubiertas, que el llamador contrasta con el dominio
 * para detectar huecos de cobertura.
 */
function collectCoveredInputs<I, O>(
  table: CanonicalTable<I, O>,
  domainSet: ReadonlySet<I>,
  scope: string,
  sink: ErrorSink,
): Set<I> {
  const seen = new Set<I>();
  for (const row of table.rows) {
    if (!domainSet.has(row.input)) {
      sink.add({
        code: "table-overlap",
        messageEs: `La tabla «${scope}» tiene una fila fuera del dominio declarado.`,
        catalogIds: [table.id],
      });
      continue;
    }
    if (seen.has(row.input)) {
      sink.add({
        code: "table-overlap",
        messageEs: `La tabla «${scope}» asigna más de una salida a la misma entrada (solapamiento).`,
        catalogIds: [table.id],
      });
      continue;
    }
    seen.add(row.input);
  }
  return seen;
}

/**
 * Valida la cobertura y el no solapamiento de una tabla canónica: cada entrada
 * del dominio aparece exactamente una vez y no hay filas fuera del dominio.
 * (El constructor `canonicalTable` ya lo garantiza al construir; aquí se
 * revalida por si la tabla llega ensamblada por otra vía.)
 */
export function validateTableCoverage<I, O>(
  table: CanonicalTable<I, O>,
  scope: string,
  sink: ErrorSink,
): void {
  const domain = table.inputDomain;
  const domainSet = new Set<I>(domain);

  if (domainSet.size !== domain.length) {
    sink.add({
      code: "table-overlap",
      messageEs: `La tabla «${scope}» declara un dominio de entrada con valores repetidos.`,
      catalogIds: [table.id],
    });
  }

  const covered = collectCoveredInputs(table, domainSet, scope, sink);

  if (covered.size !== domainSet.size) {
    sink.add({
      code: "table-coverage",
      messageEs: `La tabla «${scope}» no cubre todo su dominio de entrada: cada entrada debe tener exactamente una fila.`,
      catalogIds: [table.id],
    });
  }

  if (table.sourceRefs.length === 0) {
    sink.add({
      code: "missing-reference",
      messageEs: `La tabla «${scope}» carece de Referencia de fuente.`,
      catalogIds: [table.id],
    });
  }
}
