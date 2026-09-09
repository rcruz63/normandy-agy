/**
 * `CombatResolver`: cálculo del Valor para impactar efectivo de un ataque como
 * valor base canónico más la suma algebraica de las fuentes de modificador
 * compatibles (Tarea 10.1, diseño §2 «submódulo `CombatResolver`»).
 *
 * Alcance verificado:
 *
 * - SUMA ALGEBRAICA INDEPENDIENTE DEL ORDEN (11.1, 11.2, 11.3, 36.1, 36.10): el
 *   Valor para impactar efectivo es `base + Σ modificadores`. La suma es
 *   conmutativa; este módulo la calcula sobre un conjunto de operandos con signo
 *   cuyo total NO depende del orden de enumeración. El resultado incluye el
 *   desglose ordenado de operandos para el Registro detallado (38.8, 16.4).
 *
 * - VALORES FIJOS QUE EXCLUYEN MODIFICADORES (12.1, 12.2, 12.4, 35.8, 36.11,
 *   38.7): una Granada (6+ fijo) y una prueba de Mina (7+ sin modificadores) son
 *   `fixed`; su Valor para impactar efectivo es EXACTAMENTE el base, sin sumar
 *   ningún modificador de terreno, Flanqueo, Apoyo ni Mortero. El `fixed` lo
 *   aporta el Dato canónico ({@link BaseHitInput.fixed}); no se deduce aquí.
 *
 * - MODIFICADORES DE TERRENO (14.3, 14.4, 15.1, 15.3, 16.4, 36.2, 36.3, 36.4,
 *   36.5, 36.6): defensor en bosque suma +1 (36.2); defensor en edificio suma +2
 *   (36.3); atacante desde colina resta −1 (36.4), excluido en Granada (36.5).
 *   El Río NO aporta un modificador numérico al Valor para impactar: conserva la
 *   elegibilidad del ataque cuando la línea lo atraviesa (16.4, 36.9); su
 *   restricción de cruce de ruta es de `resolveAdvance` (order-effects), no de
 *   este módulo. En terreno despejado sin otro modificador el valor se conserva
 *   (36.6).
 *
 * - FLANQUEO, APOYO Y MORTERO (38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.9):
 *   disparar desde fuera de la Zona de fuego del objetivo resta −1 por Flanqueo
 *   (38.1); cada OTRA Unidad británica adyacente al objetivo resta −1 por Apoyo,
 *   sin máximo (38.2, 38.9); un Mortero a distancia 2 resta −2 (38.3), pero un
 *   Mortero adyacente cuenta como un Apoyo normal de −1 en vez del −2 (38.4). El
 *   Mortero es SIEMPRE modificador de otro ataque, nunca atacante directo (38.6);
 *   este módulo modela su aporte como operando, no como sujeto base.
 *
 * - PIAT (36.12, 36.13): un PIAT solo puede tener como objetivo una Semioruga o
 *   una Unidad alemana en un edificio (36.12); cuando ataca a una Unidad en un
 *   edificio, se EXCLUYE el modificador defensivo de +2 del edificio (36.13). El
 *   resto de modificadores compatibles se acumulan con normalidad.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: el módulo NUNCA llama a `VersionedRandom`
 * ni tira 2d6. Produce la RESOLUCIÓN estructural (Valor para impactar efectivo,
 * desglose de operandos con signo, si es fijo). La comparación con el total de
 * 2d6 la realiza el Motor/aplicación con el azar suministrado desde fuera, tal
 * como `order-effects` produce la {@link AttackIntent} sin calcular.
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). Los Valores base para impactar viven en el
 * catálogo (`baseHitValues`); aquí se recibe una VISTA ESTRUCTURAL mínima
 * ({@link BaseHitInput}) que la capa de aplicación adapta desde el `BaseHitValue`
 * canónico, igual que `TurnOrderPolicy` con su `OrderTableView`.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";

// ---------------------------------------------------------------------------
// Constantes semánticas de modificadores (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Modificador por defensor en bosque: +1 al Valor para impactar (36.2). */
const FOREST_MODIFIER: number = 1;
/** Modificador por defensor en edificio: +2 al Valor para impactar (36.3). */
const BUILDING_MODIFIER: number = 2;
/** Modificador por atacar desde una colina: −1 al Valor para impactar (36.4). */
const HILL_MODIFIER: number = -1;
/** Modificador por Flanqueo (disparo fuera de la Zona de fuego): −1 (38.1). */
const FLANKING_MODIFIER: number = -1;
/** Modificador por cada OTRA Unidad de Apoyo adyacente al objetivo: −1 (38.2). */
const SUPPORT_MODIFIER_PER_UNIT: number = -1;
/** Modificador de Mortero a distancia exactamente 2 del objetivo: −2 (38.3). */
const MORTAR_AT_RANGE_MODIFIER: number = -2;
/** Aporte de Apoyo de un Mortero adyacente al objetivo: −1 en vez de −2 (38.4). */
const MORTAR_ADJACENT_AS_SUPPORT_MODIFIER: number = -1;
/** Neutro de la suma algebraica cuando no hay modificador compatible (36.6). */
const NO_MODIFIER: number = 0;

// ---------------------------------------------------------------------------
// Entrada: valor base, tipo de ataque, objetivo y contexto de modificadores
// ---------------------------------------------------------------------------

/**
 * Tipo de ataque cuya resolución algebraica gobierna este módulo.
 *
 * - `fire`: Fuego directo que admite terreno, Flanqueo, Apoyo y Mortero.
 * - `grenade`: Granada de Valor para impactar fijo que EXCLUYE todo modificador
 *   (12.4, 36.5, 38.7).
 * - `piat`: PIAT con objetivos limitados y exclusión del +2 de edificio (36.12,
 *   36.13).
 * - `mine-test`: prueba de Mina de Valor para impactar fijo sin modificadores
 *   (36.11).
 */
export type CombatAttackKind = "fire" | "grenade" | "piat" | "mine-test";

/**
 * Terreno del defensor relevante para el Valor para impactar. Lo aporta el
 * estado de la Partida (terreno del Hexágono del objetivo); este módulo no lo
 * deduce de coordenadas.
 */
export type DefenderTerrain = "clear" | "forest" | "building";

/**
 * Vista estructural mínima del Valor base para impactar canónico.
 *
 * La capa de aplicación la adapta desde el `BaseHitValue` del catálogo
 * (`baseHitValues`). `fixed` indica que el valor EXCLUYE todos los modificadores
 * (Granada, Mina): lo aporta el Dato canónico, no se deduce aquí (12.4, 36.11).
 */
export type BaseHitInput = Readonly<{
  /** Umbral base "n+" antes de modificadores permitidos. */
  threshold: number;
  /** Si el valor es fijo y excluye todos los modificadores de terreno/apoyo. */
  fixed: boolean;
}>;

/**
 * Contexto de modificadores de un ataque, aportado por el estado de la Partida y
 * la geometría (Zona de fuego, adyacencia, distancia). Todos los campos son
 * hechos ya evaluados por capas previas (`HexGeometry`, `order-effects`): este
 * módulo NO recalcula adyacencia ni Zona de fuego, solo aplica los signos.
 */
export type CombatModifierContext = Readonly<{
  /** Terreno del defensor (bosque/edificio/despejado). */
  defenderTerrain: DefenderTerrain;
  /** El atacante dispara desde una colina (resta −1, salvo Granada) (36.4). */
  attackerOnHill: boolean;
  /** El disparo procede de fuera de la Zona de fuego del objetivo (38.1). */
  flanking: boolean;
  /**
   * Número de OTRAS Unidades británicas de Apoyo adyacentes al objetivo,
   * distintas del atacante principal y de un Mortero contabilizado aparte
   * (38.2, 38.9). Debe ser un entero no negativo.
   */
  supportingUnits: number;
  /**
   * Aporte de un Mortero al ataque, ya clasificado por la geometría:
   * - `none`: no hay Mortero que module este ataque.
   * - `at-range`: Mortero a distancia exactamente 2 del objetivo (−2) (38.3).
   * - `adjacent`: Mortero adyacente al objetivo, cuenta como Apoyo −1 (38.4).
   */
  mortar: "none" | "at-range" | "adjacent";
}>;

/**
 * Elegibilidad del objetivo de un PIAT, aportada por el estado de la Partida:
 * el objetivo es una Semioruga y/o una Unidad alemana situada en un edificio
 * (36.12). Este módulo no inspecciona Fichas: recibe los hechos ya evaluados.
 */
export type PiatTargetFacts = Readonly<{
  targetIsHalftrack: boolean;
  targetIsGermanInBuilding: boolean;
}>;

/** Datos completos para resolver el Valor para impactar de un ataque. */
export type CombatResolutionRequest = Readonly<{
  kind: CombatAttackKind;
  base: BaseHitInput;
  modifiers: CombatModifierContext;
  /** Hechos de elegibilidad del objetivo; obligatorio solo para PIAT (36.12). */
  piatTarget?: PiatTargetFacts;
}>;

// ---------------------------------------------------------------------------
// Salida: desglose de operandos y resolución del Valor para impactar
// ---------------------------------------------------------------------------

/** Origen de un operando de la suma algebraica, para el Registro detallado. */
export type ModifierSource =
  | "forest"
  | "building"
  | "hill"
  | "flanking"
  | "support"
  | "mortar";

/**
 * Un operando con signo de la suma algebraica del Valor para impactar (38.8,
 * 16.4). `value` es el aporte con signo; `count`, cuando aplica (Apoyo), indica
 * cuántas Unidades lo generan.
 */
export type ModifierOperand = Readonly<{
  source: ModifierSource;
  value: number;
  count?: number;
}>;

/**
 * Resolución estructural del Valor para impactar de un ataque.
 *
 * - `baseThreshold`: Valor base canónico "n+" antes de modificadores.
 * - `operands`: desglose ordenado y estable de los modificadores aplicados con
 *   su signo. Vacío para ataques fijos y para terreno despejado sin extras.
 * - `modifierTotal`: suma algebraica de `operands` (independiente del orden).
 * - `effectiveThreshold`: `baseThreshold + modifierTotal`, el umbral final que
 *   el total de 2d6 debe igualar o superar. Para ataques fijos coincide con
 *   `baseThreshold`.
 * - `fixed`: si el Valor era fijo y excluyó todos los modificadores (12.4).
 */
export type CombatResolution = Readonly<{
  baseThreshold: number;
  operands: readonly ModifierOperand[];
  modifierTotal: number;
  effectiveThreshold: number;
  fixed: boolean;
}>;

/**
 * Resultado de resolver un ataque.
 *
 * - `resolved`: la resolución algebraica del Valor para impactar.
 * - `rejected`: el objetivo no es elegible (PIAT contra objetivo no permitido,
 *   36.12) o falta un dato obligatorio; NO cambia el estado.
 */
export type CombatOutcome =
  | Readonly<{ kind: "resolved"; resolution: CombatResolution }>
  | Readonly<{ kind: "rejected"; reason: DomainMessage }>;

// ---------------------------------------------------------------------------
// Mensajes es-ES
// ---------------------------------------------------------------------------

/** Mensaje `es-ES`: el objetivo del PIAT no es una Semioruga ni está en edificio. */
function piatIneligibleTargetMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.combat.piat.ineligibleTarget" });
}

/** Mensaje `es-ES`: falta la elegibilidad del objetivo obligatoria para el PIAT. */
function piatMissingTargetFactsMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.combat.piat.missingTargetFacts" });
}

/** Mensaje `es-ES`: el número de Unidades de Apoyo es inválido. */
function invalidSupportCountMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.combat.support.invalidCount" });
}

// ---------------------------------------------------------------------------
// Operandos de terreno, colina, Flanqueo, Apoyo y Mortero
// ---------------------------------------------------------------------------

/**
 * Operando de terreno del defensor (36.2, 36.3, 36.6). En un PIAT contra una
 * Unidad en edificio se EXCLUYE el +2 (36.13): ese caso se filtra antes de
 * invocar esta función, de modo que aquí el edificio siempre aporta +2.
 */
function terrainOperand(terrain: DefenderTerrain): ModifierOperand | undefined {
  if (terrain === "forest") {
    return Object.freeze({ source: "forest", value: FOREST_MODIFIER });
  }
  if (terrain === "building") {
    return Object.freeze({ source: "building", value: BUILDING_MODIFIER });
  }
  return undefined;
}

/** Operando por atacar desde una colina: −1 (36.4). */
function hillOperand(attackerOnHill: boolean): ModifierOperand | undefined {
  if (!attackerOnHill) {
    return undefined;
  }
  return Object.freeze({ source: "hill", value: HILL_MODIFIER });
}

/** Operando por Flanqueo: −1 (38.1). */
function flankingOperand(flanking: boolean): ModifierOperand | undefined {
  if (!flanking) {
    return undefined;
  }
  return Object.freeze({ source: "flanking", value: FLANKING_MODIFIER });
}

/**
 * Operando de Apoyo: −1 por cada OTRA Unidad adyacente al objetivo, más el
 * Mortero adyacente que cuenta como un Apoyo normal (38.2, 38.4, 38.9). El
 * número de Unidades no tiene máximo fijo.
 */
function supportOperand(
  supportingUnits: number,
  mortarAdjacent: boolean,
): ModifierOperand | undefined {
  const unitContribution = SUPPORT_MODIFIER_PER_UNIT * supportingUnits;
  // Un Mortero adyacente aporta una única resta de -1 como Apoyo normal (38.4),
  // no el -2 de Mortero; su constante propia documenta esa equivalencia.
  const mortarContribution = mortarAdjacent ? MORTAR_ADJACENT_AS_SUPPORT_MODIFIER : NO_MODIFIER;
  const totalUnits = supportingUnits + (mortarAdjacent ? 1 : 0);
  if (totalUnits <= 0) {
    return undefined;
  }
  return Object.freeze({
    source: "support",
    value: unitContribution + mortarContribution,
    count: totalUnits,
  });
}

/** Operando de Mortero a distancia exactamente 2 del objetivo: −2 (38.3). */
function mortarAtRangeOperand(
  mortar: CombatModifierContext["mortar"],
): ModifierOperand | undefined {
  if (mortar !== "at-range") {
    return undefined;
  }
  return Object.freeze({ source: "mortar", value: MORTAR_AT_RANGE_MODIFIER });
}

/**
 * Reúne los operandos aplicables a un ataque NO fijo, respetando las exclusiones
 * de cada tipo. El orden de este arreglo es solo para el Registro detallado; la
 * suma algebraica que produce {@link sumOperands} es independiente del orden.
 */
function collectOperands(request: CombatResolutionRequest): readonly ModifierOperand[] {
  const { kind, modifiers } = request;
  const excludeBuilding = kind === "piat"; // 36.13: PIAT omite el +2 de edificio.
  const terrain = excludeBuilding && modifiers.defenderTerrain === "building"
    ? "clear"
    : modifiers.defenderTerrain;
  const mortarAdjacent = modifiers.mortar === "adjacent";
  const candidates: readonly (ModifierOperand | undefined)[] = [
    terrainOperand(terrain),
    hillOperand(modifiers.attackerOnHill),
    flankingOperand(modifiers.flanking),
    supportOperand(modifiers.supportingUnits, mortarAdjacent),
    mortarAtRangeOperand(modifiers.mortar),
  ];
  return Object.freeze(
    candidates.filter((operand): operand is ModifierOperand => operand !== undefined),
  );
}

/**
 * Suma algebraica de los operandos (11.2, 36.10). Es independiente del orden de
 * enumeración por ser una suma conmutativa sobre el neutro {@link NO_MODIFIER}.
 */
function sumOperands(operands: readonly ModifierOperand[]): number {
  return operands.reduce((total, operand) => total + operand.value, NO_MODIFIER);
}

// ---------------------------------------------------------------------------
// Elegibilidad del objetivo del PIAT (36.12)
// ---------------------------------------------------------------------------

/**
 * ¿El objetivo del PIAT es elegible? Solo una Semioruga o una Unidad alemana en
 * un edificio (36.12). Se exige que la capa superior aporte los hechos.
 */
export function isPiatTargetEligible(facts: PiatTargetFacts): boolean {
  return facts.targetIsHalftrack || facts.targetIsGermanInBuilding;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

/** Construye la resolución de un Valor para impactar fijo, sin modificadores. */
function fixedResolution(base: BaseHitInput): CombatResolution {
  return Object.freeze({
    baseThreshold: base.threshold,
    operands: Object.freeze([]),
    modifierTotal: NO_MODIFIER,
    effectiveThreshold: base.threshold,
    fixed: true,
  });
}

/** Construye la resolución de un ataque con suma algebraica de modificadores. */
function modifiableResolution(request: CombatResolutionRequest): CombatResolution {
  const operands = collectOperands(request);
  const modifierTotal = sumOperands(operands);
  return Object.freeze({
    baseThreshold: request.base.threshold,
    operands,
    modifierTotal,
    effectiveThreshold: request.base.threshold + modifierTotal,
    fixed: false,
  });
}

/**
 * Comprueba la elegibilidad previa del PIAT (36.12) devolviendo el rechazo
 * correspondiente, o `undefined` si el objetivo es válido o el ataque no es PIAT.
 */
function rejectPiatIfIneligible(
  request: CombatResolutionRequest,
): DomainMessage | undefined {
  if (request.kind !== "piat") {
    return undefined;
  }
  if (request.piatTarget === undefined) {
    return piatMissingTargetFactsMessage();
  }
  if (!isPiatTargetEligible(request.piatTarget)) {
    return piatIneligibleTargetMessage();
  }
  return undefined;
}

/**
 * Resuelve el Valor para impactar efectivo de un ataque (11.1-11.3, 12.4, 14.3,
 * 14.4, 15.1, 15.3, 16.4, 35.6-35.8, 36.*, 38.*).
 *
 * 1. Falla-rápido si el número de Unidades de Apoyo es inválido (dato corrupto).
 * 2. Rechaza un PIAT contra un objetivo no elegible sin cambiar estado (36.12).
 * 3. Si el Valor base es fijo (Granada, Mina), devuelve el base sin sumar ningún
 *    modificador (12.4, 36.11, 35.8, 38.7).
 * 4. En caso contrario, calcula `base + Σ modificadores` con el desglose ordenado
 *    para el Registro detallado; la suma es independiente del orden (36.10).
 *
 * Función pura: no muta argumentos ni consume azar. La comparación con el 2d6 y
 * las consecuencias (bajas, Moral) las resuelven capas posteriores.
 */
export function resolveCombat(request: CombatResolutionRequest): CombatOutcome {
  if (!Number.isInteger(request.modifiers.supportingUnits) || request.modifiers.supportingUnits < 0) {
    return Object.freeze({ kind: "rejected", reason: invalidSupportCountMessage() });
  }
  const piatRejection = rejectPiatIfIneligible(request);
  if (piatRejection !== undefined) {
    return Object.freeze({ kind: "rejected", reason: piatRejection });
  }
  if (request.base.fixed) {
    return Object.freeze({ kind: "resolved", resolution: fixedResolution(request.base) });
  }
  return Object.freeze({ kind: "resolved", resolution: modifiableResolution(request) });
}
