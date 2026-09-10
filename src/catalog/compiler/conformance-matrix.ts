/**
 * Generación de la Matriz de conformidad y gate de aceptación (Tarea 26.1).
 *
 * La Matriz de conformidad relaciona cada elemento inventariado de los Datos
 * canónicos con al menos una prueba de aceptación que compara el comportamiento
 * de la Aplicación con la Fuente lúdica (requisitos 2.1, 2.3). El
 * {@link CatalogCompiler} la genera de forma determinista a partir del
 * inventario del catálogo y de las entradas de conformidad aportadas por el
 * Mantenedor, y falla en modo FAIL-CLOSED ante:
 *
 * - entradas HUÉRFANAS: una entrada cuyo `catalogId` no corresponde a ningún
 *   elemento inventariado (requisito 2.8);
 * - entradas FALTANTES: un elemento inventariado sin ninguna entrada
 *   (requisito 2.7);
 * - pruebas FALLIDAS: una entrada con estado `failed` (requisitos 2.6, 30.9,
 *   30.10, 40.4, 40.5);
 * - entradas NO VERIFICADAS necesarias para una Misión: una entrada `unverified`
 *   (o sin prueba aprobada) exigida por una Misión (requisitos 2.4, 2.5);
 * - entradas SIN PRUEBA vinculada: una entrada sin `testIds` (requisito 2.3);
 * - entradas DUPLICADAS: más de una entrada para el mismo elemento
 *   (requisito 2.1, «una entrada única por elemento»).
 *
 * Este módulo es puro y determinista: no lee el PDF (no guarda páginas ni
 * capturas), no accede a red/reloj y no muta su entrada. Sin DOM, IndexedDB,
 * red, reloj ni SDK de AWS.
 */
import type { CatalogId } from "../../domain/identity/index.js";
import type {
  CatalogValidationError,
  MaintenanceCatalog,
} from "../schemas/build.js";
import type { ConformanceEntry } from "../schemas/publication.js";

/** Un elemento inventariado del catálogo, con su ámbito para trazabilidad. */
type InventoriedElement = Readonly<{
  id: CatalogId;
  scopeEs: string;
  /** `true` si el elemento es necesario para una Misión (requisito 2.5). */
  neededByMission: boolean;
}>;

/** Resultado de la generación de la Matriz de conformidad. */
export type ConformanceMatrixResult = Readonly<{
  /**
   * La Matriz completa: exactamente una entrada por elemento inventariado.
   * Un elemento sin entrada aportada se genera como `unverified` (fail-closed).
   */
  matrix: readonly ConformanceEntry[];
  /** Fallos que impiden emitir la Versión de reglas. Vacío si es publicable. */
  errors: readonly CatalogValidationError[];
}>;

function idString(id: CatalogId): string {
  return id as unknown as string;
}

/**
 * Enumera todos los elementos inventariados del catálogo con un identificador
 * de catálogo estable: tipos de Ficha, Tablas de órdenes, reglas generales,
 * Misiones y las Tablas de revelado de cada Misión.
 *
 * Los elementos ligados a una Misión (la propia Misión y su Tabla de revelado)
 * se marcan `neededByMission`, porque una entrada no verificada de ellos
 * mantiene la Misión en Estado no publicable (requisito 2.5).
 */
function enumerateInventory(
  catalog: MaintenanceCatalog,
): readonly InventoriedElement[] {
  const elements: InventoriedElement[] = [];

  for (const [key, item] of Object.entries(catalog.pieceTypes)) {
    elements.push({
      id: item.id,
      scopeEs: `tipo de Ficha «${key}»`,
      neededByMission: false,
    });
  }

  for (const [key, item] of Object.entries(catalog.orderTables)) {
    elements.push({
      id: item.id,
      scopeEs: `Tabla de órdenes «${key}»`,
      neededByMission: false,
    });
  }

  catalog.generalRules.forEach((item, index) => {
    elements.push({
      id: item.id,
      scopeEs: `regla general #${index + 1}`,
      neededByMission: false,
    });
  });

  for (const mission of catalog.missions) {
    elements.push({
      id: mission.id as unknown as CatalogId,
      scopeEs: `Misión ${mission.number}`,
      neededByMission: true,
    });
    elements.push({
      id: mission.revealTable.id,
      scopeEs: `tabla de revelado de la Misión ${mission.number}`,
      neededByMission: true,
    });
  }

  return elements;
}

/**
 * Agrupa las entradas de conformidad aportadas por `catalogId`, detectando
 * duplicados. Devuelve el mapa de la primera entrada vista por id y la lista de
 * fallos por duplicado.
 */
function indexConformance(
  conformance: readonly ConformanceEntry[],
): Readonly<{
  byId: ReadonlyMap<string, ConformanceEntry>;
  duplicates: readonly CatalogValidationError[];
}> {
  const byId = new Map<string, ConformanceEntry>();
  const duplicates: CatalogValidationError[] = [];

  for (const entry of conformance) {
    const key = idString(entry.catalogId);
    if (byId.has(key)) {
      duplicates.push({
        code: "conformance-duplicate",
        messageEs: `La Matriz de conformidad tiene más de una entrada para «${key}»; cada elemento inventariado debe tener una entrada única.`,
        catalogIds: [entry.catalogId],
      });
      continue;
    }
    byId.set(key, entry);
  }

  return { byId, duplicates };
}

/** Deriva una entrada `unverified` para un elemento inventariado sin entrada. */
function unverifiedEntryFor(
  element: InventoriedElement,
): ConformanceEntry {
  return Object.freeze({
    catalogId: element.id,
    testIds: Object.freeze([]),
    status: "unverified",
    sourceRefs: Object.freeze([]),
  });
}

/**
 * Genera la Matriz de conformidad completa y valida el gate de aceptación en
 * modo fail-closed.
 *
 * `generateConformanceMatrix` es puro y determinista: para el mismo catálogo
 * produce la misma Matriz y el mismo conjunto de fallos, sin mutar la entrada.
 */
export function generateConformanceMatrix(
  catalog: MaintenanceCatalog,
): ConformanceMatrixResult {
  const inventory = enumerateInventory(catalog);
  const inventoryIds = new Set(inventory.map((element) => idString(element.id)));

  const provided = catalog.conformance ?? [];
  const { byId, duplicates } = indexConformance(provided);

  const errors: CatalogValidationError[] = [...duplicates];
  const matrix: ConformanceEntry[] = [];

  // 1. Entradas HUÉRFANAS: una entrada aportada sin elemento inventariado.
  for (const entry of provided) {
    const key = idString(entry.catalogId);
    if (!inventoryIds.has(key)) {
      errors.push({
        code: "conformance-orphan",
        messageEs: `La entrada de conformidad «${key}» no identifica ningún elemento inventariado; la Versión de reglas no es publicable.`,
        catalogIds: [entry.catalogId],
      });
    }
  }

  // 2. Recorre el inventario: exactamente una entrada por elemento; genera una
  //    entrada `unverified` cuando falta, y valida cada estado (fail-closed).
  for (const element of inventory) {
    const key = idString(element.id);
    const entry = byId.get(key);

    if (entry === undefined) {
      // FALTANTE: sin entrada. Se genera `unverified` y se marca como fallo.
      matrix.push(unverifiedEntryFor(element));
      errors.push({
        code: "conformance-missing",
        messageEs: `El elemento inventariado «${key}» (${element.scopeEs}) no tiene entrada en la Matriz de conformidad; la Versión de reglas no es publicable.`,
        catalogIds: [element.id],
      });
      continue;
    }

    matrix.push(entry);

    // SIN PRUEBA vinculada: una entrada debe relacionar al menos una prueba.
    if (entry.testIds.length === 0) {
      errors.push({
        code: "conformance-test-link",
        messageEs: `La entrada de conformidad «${key}» (${element.scopeEs}) no vincula ninguna prueba de aceptación (requisito 2.3).`,
        catalogIds: [element.id],
      });
    }

    // FALLIDA: una prueba que detecta diferencia respecto de los Datos canónicos.
    if (entry.status === "failed") {
      errors.push({
        code: "conformance-failed",
        messageEs: `La prueba de «${key}» (${element.scopeEs}) ha fallado frente a los Datos canónicos; la Versión de reglas no es publicable.`,
        catalogIds: [element.id],
      });
      continue;
    }

    // NO VERIFICADA necesaria para una Misión: mantiene la Misión bloqueada.
    if (entry.status === "unverified" && element.neededByMission) {
      errors.push({
        code: "conformance-unverified",
        messageEs: `El elemento «${key}» (${element.scopeEs}) está no verificado y es necesario para una Misión; la Misión permanece en Estado no publicable (requisito 2.5).`,
        catalogIds: [element.id],
      });
    }
  }

  return Object.freeze({
    matrix: Object.freeze(matrix),
    errors: Object.freeze(errors),
  });
}
