/**
 * `CatalogValidator` — validación global fail-closed del catálogo (Tarea 2.2).
 *
 * Recibe una {@link MaintenanceCatalog} y acumula todos los fallos globales que
 * impiden emitir una Versión de reglas. La compilación solo puede emitir un
 * catálogo inmutable cuando esta validación no devuelve ningún fallo.
 *
 * Comprobaciones (diseño §1, requisitos 1.6, 1.10, 1.11, 2.1, 2.2, 2.7, 2.8,
 * 4.1, 4.7, 4.9, 4.10, 17.7):
 *
 * 1. Identificadores únicos globalmente (`CatalogId` de reglas, tipos de Ficha,
 *    Tablas de órdenes, Misiones y tablas de revelado).
 * 2. Referencias válidas: cada `SourceRef` no vacía y con autoridad
 *    `FON-ML-2022`; cada `specialRule` de una Misión resuelve a una regla
 *    general existente.
 * 3. Cobertura y no solapamiento de cada tabla canónica (dominio cubierto
 *    exactamente una vez, sin filas fuera del dominio, sin duplicados).
 * 4. Exactamente quince Misiones, numeradas 1..15 sin repetición.
 * 5. Relaciones de inventario: los resultados de revelado y las referencias de
 *    reglas especiales de cada Misión resuelven; ausencia explícita permitida.
 * 6. Autoridad de la fuente: todo elemento se asocia a `FON-ML-2022`.
 * 7. `unknown`: cualquier estado indeterminado se trata como fallo (fail-closed).
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { CatalogId, MissionId } from "../../domain/identity/index.js";
import { SOURCE_VERSION } from "../schemas/source-ref.js";
import {
  MAX_MISSION_NUMBER,
  MIN_MISSION_NUMBER,
} from "../schemas/source-ref.js";
import type { SourceRef } from "../schemas/source-ref.js";
import type {
  CanonicalRule,
  CanonicalTable,
  CatalogItem,
  MissionDefinition,
} from "../schemas/catalog.js";
import type {
  CatalogValidationError,
  MaintenanceCatalog,
} from "../schemas/build.js";

/** Número exacto de Misiones inventariadas (requisito 4.1). */
export const REQUIRED_MISSION_COUNT =
  MAX_MISSION_NUMBER - MIN_MISSION_NUMBER + 1;

/** Acumulador mutable interno de fallos; la salida pública es inmutable. */
class ErrorSink {
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
 * Registra un identificador en el conjunto global, marcando duplicados. Devuelve
 * `true` si el identificador es nuevo.
 */
function registerId(
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

/**
 * Valida la cobertura y el no solapamiento de una tabla canónica: cada entrada
 * del dominio aparece exactamente una vez y no hay filas fuera del dominio.
 * (El constructor `canonicalTable` ya lo garantiza al construir; aquí se
 * revalida por si la tabla llega ensamblada por otra vía.)
 */
function validateTableCoverage<I, O>(
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

  if (seen.size !== domainSet.size) {
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

/** Valida trazabilidad y autoridad de una lista de Referencias de fuente. */
function validateSourceRefs(
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
    if (!isAuthoritative(ref)) {
      sink.add({
        code: "source-authority",
        messageEs: `«${scope}» referencia una fuente distinta de ${SOURCE_VERSION}; se excluye de los Datos canónicos.`,
        ...(id !== undefined ? { catalogIds: [id] } : {}),
      });
    }
  }
}

/** Valida las reglas generales: identificadores únicos y prioridad determinada. */
function validateGeneralRules(
  rules: readonly CatalogItem<CanonicalRule>[],
  ids: Map<string, string>,
  ruleIdSet: Set<string>,
  sink: ErrorSink,
): void {
  rules.forEach((item, index) => {
    const scope = `regla general #${index + 1}`;
    registerId(ids, item.id, scope, sink);
    ruleIdSet.add(item.id as unknown as string);
    validateSourceRefs(item.sourceRefs, scope, sink, item.id);

    const priority = item.value.priority;
    // `unknown` fail-closed: una prioridad sin resolver (no numérica finita)
    // no cae en un `default`; produce un fallo y una referencia de decisión.
    if (typeof priority !== "number" || !Number.isFinite(priority)) {
      sink.add({
        code: "unknown-condition",
        messageEs: `La regla «${item.id as unknown as string}» no tiene una prioridad de precedencia resuelta; una prioridad pendiente no puede publicarse (fail-closed).`,
        catalogIds: [item.id],
      });
    }
  });
}

/** Valida los elementos inventariados con identificador (tipos de Ficha, tablas). */
function validateInventoryItems<T>(
  items: Readonly<Record<string, CatalogItem<T>>>,
  ids: Map<string, string>,
  label: string,
  sink: ErrorSink,
): void {
  for (const [key, item] of Object.entries(items)) {
    const scope = `${label} «${key}»`;
    registerId(ids, item.id, scope, sink);
    validateSourceRefs(item.sourceRefs, scope, sink, item.id);
  }
}

/**
 * Valida las Misiones: exactamente quince, numeradas 1..15 sin repetir, con
 * trazabilidad, tabla de revelado cubierta y reglas especiales resueltas.
 */
function validateMissions(
  missions: readonly MissionDefinition[],
  ids: Map<string, string>,
  ruleIdSet: Set<string>,
  sink: ErrorSink,
): void {
  if (missions.length !== REQUIRED_MISSION_COUNT) {
    sink.add({
      code: "mission-count",
      messageEs: `El catálogo debe inventariar exactamente ${REQUIRED_MISSION_COUNT} Misiones; se han encontrado ${missions.length}.`,
    });
  }

  const numbers = new Set<number>();
  for (const mission of missions) {
    const scope = `Misión ${mission.number}`;

    registerId(ids, mission.id, scope, sink);

    if (
      !Number.isInteger(mission.number) ||
      mission.number < MIN_MISSION_NUMBER ||
      mission.number > MAX_MISSION_NUMBER
    ) {
      sink.add({
        code: "mission-number",
        messageEs: `La ${scope} tiene un número fuera de ${MIN_MISSION_NUMBER}..${MAX_MISSION_NUMBER}.`,
        missionIds: [mission.id],
      });
    } else if (numbers.has(mission.number)) {
      sink.add({
        code: "mission-number",
        messageEs: `El número de Misión ${mission.number} está repetido.`,
        missionIds: [mission.id],
      });
    } else {
      numbers.add(mission.number);
    }

    validateSourceRefs(mission.sourceRefs, scope, sink);

    // Cobertura de la Tabla de revelado de la Misión.
    validateTableCoverage(
      mission.revealTable,
      `tabla de revelado de la ${scope}`,
      sink,
    );

    // Relación de inventario: cada regla especial referenciada debe existir.
    for (const ruleId of mission.specialRules) {
      if (!ruleIdSet.has(ruleId as unknown as string)) {
        sink.add({
          code: "inventory-relation",
          messageEs: `La ${scope} referencia la regla especial «${ruleId as unknown as string}», que no existe en las reglas generales del catálogo.`,
          missionIds: [mission.id],
          catalogIds: [ruleId],
        });
      }
    }
  }

  // Cobertura del conjunto 1..15 (detecta huecos aunque el recuento sea 15).
  if (missions.length === REQUIRED_MISSION_COUNT) {
    for (let n = MIN_MISSION_NUMBER; n <= MAX_MISSION_NUMBER; n += 1) {
      if (!numbers.has(n)) {
        sink.add({
          code: "mission-count",
          messageEs: `Falta la Misión número ${n}; el inventario debe cubrir 1..${MAX_MISSION_NUMBER} sin huecos.`,
        });
      }
    }
  }
}

/**
 * Valida globalmente una {@link MaintenanceCatalog} y devuelve TODOS los fallos
 * encontrados. Una lista vacía significa que el catálogo es compilable.
 */
export function validateMaintenanceCatalog(
  input: MaintenanceCatalog,
): readonly CatalogValidationError[] {
  const sink = new ErrorSink();
  const ids = new Map<string, string>();
  const ruleIdSet = new Set<string>();

  // 1. Reglas generales primero, para poder resolver reglas especiales.
  validateGeneralRules(input.generalRules, ids, ruleIdSet, sink);

  // 2. Tipos de Ficha y Tablas de órdenes inventariados.
  validateInventoryItems(input.pieceTypes, ids, "tipo de Ficha", sink);
  validateInventoryItems(input.orderTables, ids, "Tabla de órdenes", sink);

  // 3. Cobertura/no solapamiento de las Tablas de órdenes.
  for (const [key, item] of Object.entries(input.orderTables)) {
    validateTableCoverage(item.value, `Tabla de órdenes «${key}»`, sink);
  }

  // 4-5. Misiones e inventario relacional.
  validateMissions(input.missions, ids, ruleIdSet, sink);

  return sink.snapshot();
}
