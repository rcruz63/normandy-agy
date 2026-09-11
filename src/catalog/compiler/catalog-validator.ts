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
 * Las primitivas genéricas de validación (acumulador de fallos, identificadores
 * únicos, Referencias de fuente y cobertura de tablas) viven en
 * `catalog-validation-primitives.ts`; este fichero orquesta qué se valida en un
 * catálogo completo. Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK
 * de AWS.
 */
import {
  MAX_MISSION_NUMBER,
  MIN_MISSION_NUMBER,
} from "../schemas/source-ref.js";
import type {
  CanonicalRule,
  CatalogItem,
  MissionDefinition,
} from "../schemas/catalog.js";
import type {
  CatalogValidationError,
  MaintenanceCatalog,
} from "../schemas/build.js";
import {
  ErrorSink,
  registerId,
  validateSourceRefs,
  validateTableCoverage,
} from "./catalog-validation-primitives.js";

/** Número exacto de Misiones inventariadas (requisito 4.1). */
export const REQUIRED_MISSION_COUNT =
  MAX_MISSION_NUMBER - MIN_MISSION_NUMBER + 1;

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

/** Valida el número de una Misión: entero dentro de 1..15 y sin repetición. */
function validateMissionNumber(
  mission: MissionDefinition,
  scope: string,
  numbers: Set<number>,
  sink: ErrorSink,
): void {
  const isOutOfRange =
    !Number.isInteger(mission.number) ||
    mission.number < MIN_MISSION_NUMBER ||
    mission.number > MAX_MISSION_NUMBER;
  if (isOutOfRange) {
    sink.add({
      code: "mission-number",
      messageEs: `La ${scope} tiene un número fuera de ${MIN_MISSION_NUMBER}..${MAX_MISSION_NUMBER}.`,
      missionIds: [mission.id],
    });
    return;
  }
  if (numbers.has(mission.number)) {
    sink.add({
      code: "mission-number",
      messageEs: `El número de Misión ${mission.number} está repetido.`,
      missionIds: [mission.id],
    });
    return;
  }
  numbers.add(mission.number);
}

/** Comprueba que cada regla especial referenciada por la Misión existe. */
function validateMissionSpecialRules(
  mission: MissionDefinition,
  scope: string,
  ruleIdSet: ReadonlySet<string>,
  sink: ErrorSink,
): void {
  for (const ruleId of mission.specialRules) {
    if (ruleIdSet.has(ruleId as unknown as string)) continue;
    sink.add({
      code: "inventory-relation",
      messageEs: `La ${scope} referencia la regla especial «${ruleId as unknown as string}», que no existe en las reglas generales del catálogo.`,
      missionIds: [mission.id],
      catalogIds: [ruleId],
    });
  }
}

/** Valida una Misión concreta: identidad, número, trazabilidad y relaciones. */
function validateMission(
  mission: MissionDefinition,
  ids: Map<string, string>,
  ruleIdSet: ReadonlySet<string>,
  numbers: Set<number>,
  sink: ErrorSink,
): void {
  const scope = `Misión ${mission.number}`;
  registerId(ids, mission.id, scope, sink);
  validateMissionNumber(mission, scope, numbers, sink);
  validateSourceRefs(mission.sourceRefs, scope, sink);
  validateTableCoverage(
    mission.revealTable,
    `tabla de revelado de la ${scope}`,
    sink,
  );
  validateMissionSpecialRules(mission, scope, ruleIdSet, sink);
}

/**
 * Comprueba que el conjunto de números de Misión cubre 1..15 sin huecos. Solo
 * se ejecuta cuando el recuento total es correcto, para no duplicar el fallo de
 * recuento con fallos de hueco.
 */
function validateMissionSetCoverage(
  numbers: ReadonlySet<number>,
  sink: ErrorSink,
): void {
  for (let n = MIN_MISSION_NUMBER; n <= MAX_MISSION_NUMBER; n += 1) {
    if (numbers.has(n)) continue;
    sink.add({
      code: "mission-count",
      messageEs: `Falta la Misión número ${n}; el inventario debe cubrir 1..${MAX_MISSION_NUMBER} sin huecos.`,
    });
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
    validateMission(mission, ids, ruleIdSet, numbers, sink);
  }

  // Cobertura del conjunto 1..15 (detecta huecos aunque el recuento sea 15).
  if (missions.length === REQUIRED_MISSION_COUNT) {
    validateMissionSetCoverage(numbers, sink);
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
