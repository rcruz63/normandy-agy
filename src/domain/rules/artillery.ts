/**
 * `artillery`: selección de objetivo y resolución de la Artillería (Tarea 10.2,
 * requisitos 16.2, 39.13-39.18). Compone con {@link resolveCombat} de
 * `combat-resolver` (Tarea 10.1) para el Valor para impactar FIJO 10+: este
 * módulo aporta la SELECCIÓN de objetivos válidos (excluir bosque, edificio y
 * Cobertura), la exclusión del Flanqueo contra la Artillería y la eliminación de
 * la Artillería; la comparación con el 2d6 la resuelve el Motor con azar externo.
 *
 * Alcance verificado:
 *
 * - FLANQUEO EXCLUIDO CONTRA LA ARTILLERÍA (39.14): mientras una Unidad alemana
 *   sea Artillería, se EXCLUYE el Flanqueo contra ella. Es un hecho de
 *   elegibilidad de modificador de un ataque QUE TIENE a la Artillería como
 *   objetivo (competencia del atacante británico); {@link artilleryAllowsFlanking}
 *   lo expone como predicado para que la capa que arma ese ataque anule el
 *   Flanqueo.
 *
 * - OBJETIVO DE ARTILLERÍA VÁLIDO (39.15, 39.16): al llegar la fase de
 *   activación alemana se resuelve EXACTAMENTE un ataque independiente de
 *   Artillería contra cada Unidad británica que NO esté en bosque, NO esté en un
 *   edificio y NO tenga Cobertura acumulada (39.15). Una Unidad británica en
 *   bosque, en edificio o con Cobertura queda EXCLUIDA de los objetivos (39.16).
 *
 * - VALOR PARA IMPACTAR FIJO 10+ (16.2, 39.17): cuando la Artillería ataca a una
 *   Unidad británica elegible usa un Valor para impactar FIJO 10+, sin Flanqueo
 *   ni otros modificadores; se compone con {@link resolveCombat} usando
 *   `kind: "mine-test"` (resolución fija sin modificadores) y el Dato canónico
 *   `fixed` con umbral 10. El 10+ lo aporta el Dato canónico ({@link BaseHitInput});
 *   no se codifica aquí.
 *
 * - ARTILLERÍA ELIMINABLE (39.18): cuando un ataque válido impacte a la
 *   Artillería, se elimina como a cualquier otra Unidad alemana. La eliminación
 *   la aplica el Motor tras el impacto; este módulo modela que la Artillería es
 *   un objetivo eliminable normal (sin excepción de invulnerabilidad).
 *
 * NOTA SOBRE `kind: "mine-test"`: la resolución de la Artillería es un Valor FIJO
 * sin modificadores, idéntico en forma a la prueba de Mina (fijo, sin Flanqueo ni
 * terreno). Reutilizar `kind: "mine-test"` evita añadir un tipo de ataque nuevo a
 * `combat-resolver` para el mismo comportamiento estructural (valor fijo, 12.4);
 * el umbral 10+ lo aporta el Dato canónico, no el `kind`.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD: el módulo NUNCA llama a `VersionedRandom`
 * ni tira 2d6. Produce la SELECCIÓN y la RESOLUCIÓN estructural (Valor fijo 10+);
 * el 2d6 y el impacto los aplica el Motor con el azar suministrado desde fuera.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { PieceState } from "../geometry/map.js";
import {
  resolveCombat,
  type BaseHitInput,
  type CombatOutcome,
  type DefenderTerrain,
} from "./combat-resolver.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Cobertura mínima que EXCLUYE a una Unidad británica de la Artillería (39.16). */
const ARTILLERY_EXCLUDING_COVER: number = 1;

/**
 * Contexto de modificadores nulo para la Artillería. El ataque es FIJO 10+ y
 * EXCLUYE todo modificador, incluido el Flanqueo (16.2, 39.14, 39.17);
 * `combat-resolver` ignora estos campos al ser `fixed`.
 */
const ARTILLERY_NEUTRAL_MODIFIERS = Object.freeze({
  defenderTerrain: "clear" as const,
  attackerOnHill: false,
  flanking: false,
  supportingUnits: 0,
  mortar: "none" as const,
});

// ---------------------------------------------------------------------------
// Flanqueo excluido contra la Artillería (39.14)
// ---------------------------------------------------------------------------

/**
 * ¿Se permite el Flanqueo contra la Artillería? Nunca (39.14). Predicado puro
 * para que la capa que arma un ataque británico contra la Artillería ANULE el
 * Flanqueo antes de invocar {@link resolveCombat}.
 */
export function artilleryAllowsFlanking(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Selección de objetivo de Artillería (39.15, 39.16)
// ---------------------------------------------------------------------------

/**
 * Vista estructural de una Unidad británica candidata a objetivo de Artillería.
 * `terrain` (bosque/edificio/despejado) lo aporta el estado de la Partida desde
 * el terreno del Hexágono; este módulo NO deduce terreno de coordenadas. La
 * Cobertura acumulada se lee del propio {@link PieceState}.
 */
export type ArtilleryCandidate = Readonly<{
  piece: PieceState;
  terrain: DefenderTerrain;
}>;

/**
 * ¿La Unidad británica es un objetivo elegible de Artillería? (39.15, 39.16)
 *
 * Elegible solo si NO está en bosque, NO está en un edificio y NO tiene
 * Cobertura acumulada. Exige además que sea una Unidad británica activa.
 * Función pura sin efectos ni azar.
 */
export function isArtilleryTargetEligible(candidate: ArtilleryCandidate): boolean {
  const { piece, terrain } = candidate;
  if (piece.side !== "british" || piece.status !== "active") {
    return false;
  }
  if (terrain === "forest" || terrain === "building") {
    return false;
  }
  return piece.cover < ARTILLERY_EXCLUDING_COVER;
}

/**
 * Selecciona las Unidades británicas elegibles como objetivo de Artillería en la
 * fase de activación alemana (39.15, 39.16): una por Unidad no excluida por
 * bosque, edificio o Cobertura. El resultado es estable (orden de entrada) y no
 * muta la lista recibida; cada objetivo recibe EXACTAMENTE un ataque de
 * Artillería, que se resuelve por separado con {@link resolveArtilleryAttack}.
 */
export function selectArtilleryTargets(
  candidates: readonly ArtilleryCandidate[],
): readonly PieceState[] {
  const targets = candidates
    .filter((candidate) => isArtilleryTargetEligible(candidate))
    .map((candidate) => candidate.piece);
  return Object.freeze([...targets]);
}

// ---------------------------------------------------------------------------
// Resolución del ataque de Artillería (16.2, 39.17)
// ---------------------------------------------------------------------------

/**
 * Resuelve un ataque de Artillería contra una Unidad británica elegible (16.2,
 * 39.17): Valor para impactar FIJO 10+ sin Flanqueo ni otros modificadores.
 * Compone con {@link resolveCombat}; el umbral 10 y el `fixed` los aporta el Dato
 * canónico ({@link BaseHitInput}).
 *
 * Función pura: no consume azar. La comparación del 2d6 con el umbral y las
 * consecuencias las aplica el Motor con el azar externo.
 */
export function resolveArtilleryAttack(base: BaseHitInput): CombatOutcome {
  return resolveCombat({
    kind: "mine-test",
    base,
    modifiers: ARTILLERY_NEUTRAL_MODIFIERS,
  });
}

// ---------------------------------------------------------------------------
// Eliminación de la Artillería (39.18)
// ---------------------------------------------------------------------------

/**
 * Elimina la Artillería tras un ataque válido que la impacte (39.18): la
 * Artillería se elimina como cualquier otra Unidad alemana, sin excepción de
 * invulnerabilidad. Devuelve un nuevo {@link PieceState} con `status:
 * "eliminated"` sin mutar el recibido.
 *
 * La DECISIÓN de si el ataque impacta (2d6 ≥ umbral) es externa; esta función
 * modela solo la consecuencia estructural de un impacto ya confirmado.
 */
export function eliminateArtillery(artillery: PieceState): PieceState {
  return Object.freeze({ ...artillery, status: "eliminated" });
}
