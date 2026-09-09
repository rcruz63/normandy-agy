/**
 * `MissionSetup`: preparación fiel de una Misión (Tarea 11.2, requisitos 5.1,
 * 5.2, 5.3, 17.2, 33.1, 33.3, 33.4, 33.5).
 *
 * Alcance verificado:
 *
 * - PREPARACIÓN EXACTA (5.1): preparar EXACTAMENTE las Fuerzas británicas, las
 *   Unidades alemanas fijas, el objetivo, la Tabla de revelado y la duración de
 *   la Misión seleccionada. Este módulo modela QUÉ se incluye (composición de
 *   fuerzas por tipo/cantidad, presencia de unidades fijas, objetivo tipado,
 *   duración elegida, tabla referenciada), NO las posiciones ni Orientaciones
 *   visuales, que dependen de DP-001 y permanecen en Estado no publicable
 *   (33.8): este módulo nunca fabrica coordenadas ni Orientaciones.
 *
 * - DURACIÓN base∓1 (17.2, 32.4, 32.5, 32.8, 32.9, 32.10): a partir de los
 *   turnos base de la Misión se ofrecen EXACTAMENTE tres opciones: base−1, base
 *   y base+1. La elección del Jugador (`shorter`/`base`/`longer`) fija la
 *   duración disponible de la Partida.
 *
 * - UNIDADES FIJAS REVELADAS (33.3): cada Unidad alemana fija indicada en la
 *   fila de la Misión se incluye REVELADA. La Misión 8 incluye una LMG alemana
 *   fija y revelada en el Hexágono de la iglesia (33.4); la Misión 11 incluye
 *   reveladas una Artillería y una LMG alemanas fijas (33.5). La ausencia de
 *   unidad fija se registra EXPLÍCITAMENTE (no se omite en silencio).
 *
 * - OBJETIVO TIPADO (32.11, 18.1): el objetivo de victoria se modela como un
 *   tipo discriminado del dominio para poder EVALUARLO estructuralmente en el
 *   desenlace (`mission-outcome.ts`), en lugar de comparar cadenas es-ES. El
 *   nombre es-ES sigue siendo contenido visible; la evaluación usa el tipo.
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). La identidad de Misión, las fuerzas, las
 * unidades fijas y las tablas viven en el catálogo (`missions.ts`,
 * `forces-reveal.ts`); aquí se reciben VISTAS ESTRUCTURALES mínimas que la capa
 * de aplicación adapta desde los fixtures, igual que `CombatResolver` con su
 * `BaseHitInput` o `RevealResolver` con su `RevealTableView`.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import type { HexId } from "../geometry/identifiers.js";

// ---------------------------------------------------------------------------
// Constantes semánticas de duración (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Delta de turnos de la variante «un turno menos» respecto a la base (32.8). */
const SHORTER_DURATION_DELTA: number = -1;
/** Delta de turnos de la variante «duración base» (32.10). */
const BASE_DURATION_DELTA: number = 0;
/** Delta de turnos de la variante «un turno más» respecto a la base (32.9). */
const LONGER_DURATION_DELTA: number = 1;
/** Número mínimo de turnos base admisible para una Misión (fail-fast). */
const MIN_BASE_TURNS: number = 1;

// ---------------------------------------------------------------------------
// Duración de la Misión (17.2, 32.4, 32.5, 32.8, 32.9, 32.10)
// ---------------------------------------------------------------------------

/** Variante de duración elegida por el Jugador (exactamente tres, 32.5). */
export type DurationChoice = "shorter" | "base" | "longer";

/** Las tres variantes de duración admitidas, en orden creciente de turnos. */
export const DURATION_CHOICES: readonly DurationChoice[] = Object.freeze([
  "shorter",
  "base",
  "longer",
] as const);

/**
 * Especificación de duración de una Misión: turnos base verificados. Las tres
 * opciones (base−1, base, base+1) se derivan de aquí (32.5).
 */
export type MissionDurationSpec = Readonly<{
  /** Turnos base indicados en la tabla del requisito 32 para la Misión. */
  baseTurns: number;
}>;

// ---------------------------------------------------------------------------
// Composición de fuerzas y unidades fijas (vistas estructurales)
// ---------------------------------------------------------------------------

/** Tipo de Fuerza británica de preparación (espeja el catálogo, 33.1). */
export type BritishForceKind =
  | "rifle-squad"
  | "mg-team"
  | "mortar"
  | "piat";

/**
 * VISTA ESTRUCTURAL de una Fuerza británica de preparación (33.1): su tipo y,
 * para las escuadras de fusileros, su designación («A», «B», «C»). No fija
 * posición: la ubicación de entrada depende de DP-001 (Estado no publicable).
 */
export type BritishForceView = Readonly<{
  kind: BritishForceKind;
  /** Designación de escuadra solo para `rifle-squad` (A/B/C). */
  squad?: string;
  /** Nombre visible en es-ES (único contenido de juego). */
  labelEs: string;
}>;

/** Tipo de Unidad alemana fija adicional (espeja el catálogo, 33.3). */
export type FixedGermanUnitKind = "HMG" | "LMG" | "half-track" | "artillery";

/**
 * VISTA ESTRUCTURAL de una Unidad alemana fija adicional (33.3). La posición y
 * Orientación visual dependen de DP-001 y NO se incluyen aquí (Estado no
 * publicable, 33.8). `semanticAnchorEs` transporta el anclaje verificado en la
 * fuente cuando el requisito lo indica (p. ej. la LMG de la Misión 8 en el
 * Hexágono de la iglesia, 33.4), sin resolver coordenadas.
 */
export type FixedGermanUnitView = Readonly<{
  kind: FixedGermanUnitKind;
  labelEs: string;
  /** Anclaje semántico verificado (sin coordenadas), si la fuente lo indica. */
  semanticAnchorEs?: string;
}>;

/**
 * VISTA ESTRUCTURAL de las Unidades alemanas fijas de una Misión (33.3, 33.6).
 * La ausencia se declara EXPLÍCITAMENTE con `present: false` (33.6), nunca se
 * omite en silencio.
 */
export type FixedGermanUnitsView =
  | Readonly<{ present: true; units: readonly [FixedGermanUnitView, ...FixedGermanUnitView[]] }>
  | Readonly<{ present: false }>;

// ---------------------------------------------------------------------------
// Objetivo de victoria tipado (32.11, 18.1)
// ---------------------------------------------------------------------------

/**
 * Objetivo de victoria de una Misión como tipo discriminado del dominio. Se
 * EVALÚA estructuralmente en el desenlace (18.1, 32.6, 32.11); el texto es-ES
 * es solo el nombre visible.
 *
 * - `eliminate-all-germans`: revelar y eliminar todas las Unidades alemanas
 *   (mayoría de Misiones, req. 32).
 * - `eliminate-single-revealed-german`: eliminar la única Unidad alemana
 *   revelada (Misión 1, req. 32).
 * - `destroy-artillery`: destruir la Artillería alemana (Misión 11, req. 32).
 * - `occupy-church-hex`: ocupar el Hexágono de la iglesia con cualquier Unidad
 *   británica (Misiones 8 y 14, req. 32). `churchHexId` lo aporta la
 *   preparación cuando DP-001 lo resuelve; mientras permanezca sin resolver, la
 *   ocupación no puede evaluarse (Estado no publicable, 33.8).
 */
export type MissionObjective =
  | Readonly<{ kind: "eliminate-all-germans" }>
  | Readonly<{ kind: "eliminate-single-revealed-german" }>
  | Readonly<{ kind: "destroy-artillery" }>
  | Readonly<{ kind: "occupy-church-hex"; churchHexId?: HexId }>;

// ---------------------------------------------------------------------------
// Referencia a la Tabla de revelado (sin acoplar al catálogo)
// ---------------------------------------------------------------------------

/**
 * Referencia estructural a la Tabla de revelado de la Misión (33.2). La tabla
 * concreta la resuelve `RevealResolver` con su `RevealTableView`; aquí solo se
 * conserva la Referencia de misión para trazar la preparación.
 */
export type RevealTableRef = Readonly<{ missionRef: string }>;

// ---------------------------------------------------------------------------
// Petición y resultado de preparación
// ---------------------------------------------------------------------------

/**
 * Datos verificados de la Misión para preparar la Partida (5.1). La capa de
 * aplicación los adapta desde los fixtures del catálogo; el dominio no los
 * fabrica.
 */
export type MissionSetupRequest = Readonly<{
  /** Número de Misión (1..15). */
  missionNumber: number;
  /** Duración base verificada de la Misión (17.2, 32.4). */
  duration: MissionDurationSpec;
  /** Variante de duración elegida por el Jugador (32.5, 32.8, 32.9, 32.10). */
  durationChoice: DurationChoice;
  /** Fuerzas británicas exactas de la Misión (33.1). */
  britishForces: readonly [BritishForceView, ...BritishForceView[]];
  /** Unidades alemanas fijas adicionales, con ausencia explícita (33.3, 33.6). */
  fixedGermanUnits: FixedGermanUnitsView;
  /** Objetivo de victoria tipado de la Misión (32.11). */
  objective: MissionObjective;
  /** Referencia a la Tabla de revelado de la Misión (33.2). */
  revealTable: RevealTableRef;
}>;

/**
 * Una Unidad alemana fija incluida en la preparación (33.3). Se incluye siempre
 * REVELADA (`revealed: true`); la ubicación/Orientación visual permanece en
 * Estado no publicable (DP-001, 33.8) y por eso no aparece aquí.
 */
export type PreparedFixedGermanUnit = Readonly<{
  kind: FixedGermanUnitKind;
  labelEs: string;
  semanticAnchorEs?: string;
  /** Toda unidad fija adicional se prepara revelada (33.3). */
  revealed: true;
}>;

/**
 * Resultado estructural de preparar una Misión (5.1). Contiene la duración
 * disponible elegida, las Fuerzas británicas incluidas, las Unidades alemanas
 * fijas reveladas, el objetivo tipado y la Referencia de la Tabla de revelado.
 * No contiene posiciones ni Orientaciones visuales (Estado no publicable).
 */
export type MissionSetup = Readonly<{
  missionNumber: number;
  /** Duración disponible de la Partida tras aplicar la variante (32.4/32.8/32.9/32.10). */
  availableTurns: number;
  durationChoice: DurationChoice;
  britishForces: readonly [BritishForceView, ...BritishForceView[]];
  /** Unidades fijas reveladas incluidas; lista vacía si hay ausencia explícita (33.6). */
  fixedGermanUnits: readonly PreparedFixedGermanUnit[];
  objective: MissionObjective;
  revealTable: RevealTableRef;
}>;

/** Error lanzado ante una preparación inválida (fail-fast, 5.4). */
export class InvalidMissionSetupError extends Error {
  public readonly field: string;

  public constructor(field: string, detail: string) {
    super(`Preparación de Misión inválida en «${field}»: ${detail}.`);
    this.name = "InvalidMissionSetupError";
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Duración disponible según la variante (32.4, 32.8, 32.9, 32.10)
// ---------------------------------------------------------------------------

/** Delta de turnos asociado a cada variante de duración (32.8/32.9/32.10). */
function durationDelta(choice: DurationChoice): number {
  if (choice === "shorter") return SHORTER_DURATION_DELTA;
  if (choice === "longer") return LONGER_DURATION_DELTA;
  return BASE_DURATION_DELTA;
}

/**
 * Calcula la duración disponible de la Partida a partir de los turnos base y la
 * variante elegida (32.4/32.8/32.9/32.10). Devuelve exactamente base−1, base o
 * base+1 sin efectos colaterales.
 */
export function availableTurnsFor(
  duration: MissionDurationSpec,
  choice: DurationChoice,
): number {
  if (!Number.isInteger(duration.baseTurns) || duration.baseTurns < MIN_BASE_TURNS) {
    throw new InvalidMissionSetupError(
      "duration.baseTurns",
      `los turnos base deben ser un entero ≥ ${String(MIN_BASE_TURNS)}`,
    );
  }
  return duration.baseTurns + durationDelta(choice);
}

// ---------------------------------------------------------------------------
// Inclusión de unidades fijas reveladas (33.3, 33.6)
// ---------------------------------------------------------------------------

/**
 * Marca una Unidad alemana fija como revelada para la preparación (33.3). No
 * fija posición ni Orientación (Estado no publicable, 33.8). Conserva el
 * anclaje semántico cuando la fuente lo indica (p. ej. iglesia, 33.4).
 */
function prepareFixedUnit(unit: FixedGermanUnitView): PreparedFixedGermanUnit {
  if (unit.semanticAnchorEs === undefined) {
    return Object.freeze({ kind: unit.kind, labelEs: unit.labelEs, revealed: true });
  }
  return Object.freeze({
    kind: unit.kind,
    labelEs: unit.labelEs,
    semanticAnchorEs: unit.semanticAnchorEs,
    revealed: true,
  });
}

/**
 * Traduce la vista de unidades fijas a la lista preparada revelada (33.3). La
 * ausencia explícita produce una lista vacía sin inventar unidades (33.6).
 */
function prepareFixedUnits(
  view: FixedGermanUnitsView,
): readonly PreparedFixedGermanUnit[] {
  if (!view.present) {
    return Object.freeze([]);
  }
  return Object.freeze(view.units.map(prepareFixedUnit));
}

// ---------------------------------------------------------------------------
// Preparación de la Misión (5.1, 5.2, 17.2, 33.1, 33.3, 33.4, 33.5)
// ---------------------------------------------------------------------------

/**
 * Prepara una Misión: fija la duración disponible según la variante elegida
 * (32.4/32.8/32.9/32.10), incluye las Fuerzas británicas exactas (33.1) y las
 * Unidades alemanas fijas reveladas (33.3, 33.4, 33.5), conserva el objetivo
 * tipado (32.11) y la Referencia de la Tabla de revelado (33.2).
 *
 * Función pura: no muta la petición, no consume azar y no fabrica posiciones ni
 * Orientaciones visuales (Estado no publicable, 33.8).
 */
export function prepareMission(request: MissionSetupRequest): MissionSetup {
  if (!Number.isInteger(request.missionNumber) || request.missionNumber < 1 || request.missionNumber > 15) {
    throw new InvalidMissionSetupError("missionNumber", "debe estar en 1..15");
  }
  if (request.britishForces.length === 0) {
    throw new InvalidMissionSetupError("britishForces", "toda Misión incluye Fuerzas británicas");
  }
  const availableTurns = availableTurnsFor(request.duration, request.durationChoice);
  return Object.freeze({
    missionNumber: request.missionNumber,
    availableTurns,
    durationChoice: request.durationChoice,
    britishForces: Object.freeze([...request.britishForces]) as MissionSetup["britishForces"],
    fixedGermanUnits: prepareFixedUnits(request.fixedGermanUnits),
    objective: request.objective,
    revealTable: Object.freeze({ ...request.revealTable }),
  });
}

/** Mensaje `es-ES`: la variante de duración no es una de las tres admitidas (32.5). */
export function invalidDurationChoiceMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.mission.invalidDurationChoice" });
}
