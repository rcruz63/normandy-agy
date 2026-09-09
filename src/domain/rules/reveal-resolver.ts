/**
 * `RevealResolver`: resolución del Revelado de Incógnitas a partir de sus
 * disparadores (Tarea 11.1, requisitos 13.1-13.4, 33.2, 35.4, 35.13, 35.14,
 * 37.6-37.13).
 *
 * Alcance verificado:
 *
 * - OCULTACIÓN PREVIA (13.1): mientras una Ficha permanezca oculta
 *   (`visibility: "hidden"`), solo su condición de Incógnita es pública. Este
 *   módulo NO expone el contenido antes de resolver el Revelado; el contenido se
 *   fija exclusivamente al producir la sustitución.
 *
 * - SUSTITUCIÓN POR LA TABLA DE LA MISIÓN (13.3, 33.2, 37.6): al cumplirse un
 *   disparador de Revelado, se transforma el resultado de d6 ya tirado mediante
 *   la fila de la Tabla de revelado de la Misión y se SUSTITUYE la Incógnita por
 *   el resultado EN EL MISMO Hexágono. La Incógnita pasa a `visibility:
 *   "revealed"` con `definitionId`/`side` según el resultado; conserva su
 *   `hexId`.
 *
 * - ORIENTACIÓN HACIA LA ÚNICA REVELADORA (37.7): si la Incógnita revela una
 *   Unidad alemana por adyacencia a una ÚNICA Unidad británica reveladora, la
 *   Unidad alemana se orienta hacia esa reveladora. La correspondencia
 *   reveladora→Dirección la aportan los Datos canónicos (no se deduce).
 *
 * - SUSPENSIÓN POR EMPATE (37.8, 37.9, 13.8): si DOS O MÁS Unidades británicas
 *   son reveladoras simultáneas y los Datos canónicos no definen un desempate de
 *   Orientación, se SUSPENDE la elección de Orientación sin seleccionar una
 *   reveladora y se registra una entrada pendiente DP-002 con su Referencia de
 *   fuente. La Unidad alemana se revela SIN Orientación (queda a la espera de la
 *   resolución de DP-002).
 *
 * - EXPLORAR (37.10, 37.11): Explorar revela una Incógnita situada exactamente a
 *   distancia 2 usando la Tabla de revelado SIN prueba inmediata de Mina
 *   (37.10). Si Explorar revela una Unidad alemana, se usa la Orientación
 *   inferior válida ELEGIDA por el Jugador (37.11); este módulo la aplica tal
 *   cual (la validación de «inferior» y «no fuera del Mapa» es de la Interfaz,
 *   35.14).
 *
 * - MINA (37.12, 37.13): si la Tabla de revelado produce una Mina, se SUSTITUYE
 *   la Incógnita por la Mina EN EL MISMO Hexágono (37.12). La persistencia de la
 *   Mina la modela `mines.ts` (Tarea 10.2, 37.13); este módulo COMPONE con ella
 *   —no la duplica— y delega el disparo de prueba inmediata en
 *   {@link mineRevealTriggersImmediateTest} (Explorar nunca dispara, 37.10).
 *
 * - DETENCIÓN SIN RESOLUCIÓN CANÓNICA (13.6, 13.7, 13.8): si no existe una
 *   resolución documentada para una fuente agotada o contradictoria, se DETIENE
 *   el Revelado sin aplicar contenido al Estado de partida (13.6). Si ya hubo
 *   Consumo aleatorio, se conserva junto con la causa de la detención (13.7) y
 *   se registra una entrada DP-002 (13.8). Este módulo NO decide cuándo una
 *   fuente está agotada/contradictoria: recibe esa condición como entrada.
 *
 * DESACOPLAMIENTO DE LA ALEATORIEDAD (13.4): el Revelado consume aleatoriedad a
 * través del Gestor de aleatoriedad, pero este módulo NUNCA llama a
 * `VersionedRandom` ni tira d6. Recibe el resultado del d6 YA tirado y produce
 * la sustitución estructural; el Consumo se registra fuera, igual que en
 * `combat-resolver` y `order-effects`.
 *
 * FRONTERA DE CAPAS (pureza del dominio): el dominio NO importa la capa de
 * catálogo (`src/catalog/**`). La Tabla de revelado canónica vive en el catálogo
 * (`REVEAL_TABLE_BY_MISSION`); aquí se recibe una VISTA ESTRUCTURAL mínima
 * ({@link RevealTableView}) que la capa de aplicación adapta desde la
 * `CanonicalTable` canónica, igual que `TurnOrderPolicy` con su `OrderTableView`
 * y `CombatResolver` con su `BaseHitInput`.
 *
 * Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa
 * `Math.random` ni `Date`. Todos los tipos son `Readonly` y las funciones no
 * mutan sus argumentos. Los textos visibles se transportan por `messageKey`
 * (`es-ES`).
 */
import type { DomainMessage } from "../engine/transition.js";
import type { CatalogId } from "../identity/index.js";
import type { DirectionId } from "../geometry/identifiers.js";
import type { PieceState } from "../geometry/map.js";
import type { MineRevealCause } from "./mines.js";
import { mineRevealTriggersImmediateTest } from "./mines.js";

// ---------------------------------------------------------------------------
// Constantes semánticas (sin valores mágicos)
// ---------------------------------------------------------------------------

/** Distancia hexagonal exacta a la que Explorar revela una Incógnita (37.10). */
export const SCOUT_REVEAL_DISTANCE: number = 2;

/**
 * Número mínimo de Unidades reveladoras que produce un empate de Orientación sin
 * desempate canónico y, por tanto, la suspensión con DP-002 (37.8).
 */
const AMBIGUOUS_REVEALER_COUNT: number = 2;

// ---------------------------------------------------------------------------
// Vista estructural de la Tabla de revelado (decoplada del catálogo)
// ---------------------------------------------------------------------------

/**
 * Resultado canónico de una fila de la Tabla de revelado (33.2). Espeja el
 * `RevealResult` del catálogo sin acoplarse a él: una Unidad alemana concreta o
 * una Mina.
 */
export type RevealResultKind = "HMG" | "LMG" | "german-rifles" | "mine";

/**
 * VISTA ESTRUCTURAL mínima de la Tabla de revelado de una Misión (33.2, 37.6).
 *
 * `resultOf` traduce el resultado de d6 (1..6) ya tirado a su `RevealResultKind`
 * canónico. La capa de aplicación la adapta desde la `CanonicalTable<D6,
 * RevealResult>` del catálogo (`REVEAL_TABLE_BY_MISSION`) antes de invocar la
 * resolución; este módulo no conoce la forma canónica.
 */
export type RevealTableView = Readonly<{
  resultOf: Readonly<Record<number, RevealResultKind>>;
}>;

/**
 * `CatalogId` de la definición de Ficha con la que se sustituye la Incógnita
 * según el resultado de la Tabla de revelado. La aportan los Datos canónicos: no
 * se fabrican identificadores en el dominio.
 */
export type RevealDefinitionIds = Readonly<Record<RevealResultKind, CatalogId>>;

// ---------------------------------------------------------------------------
// Causa del disparador de Revelado (compone con order-effects y mines)
// ---------------------------------------------------------------------------

/**
 * Causa del Revelado de una Incógnita, aportada por los disparadores de
 * `order-effects` (Tarea 9.3):
 * - `adjacency`: Avanzar dejó una Unidad británica adyacente a la Incógnita
 *   (35.4, 37.6); puede disparar prueba inmediata de Mina desde M7 (37.13 /
 *   `mines.ts`).
 * - `scout`: Explorar reveló una Incógnita a distancia 2 (35.13, 37.10);
 *   NUNCA dispara prueba inmediata de Mina (37.10).
 *
 * Coincide con {@link MineRevealCause} de `mines.ts` para componer sin duplicar.
 */
export type RevealCause = MineRevealCause;

// ---------------------------------------------------------------------------
// Entrada de la resolución del Revelado
// ---------------------------------------------------------------------------

/**
 * Datos necesarios para resolver el Revelado de una única Incógnita.
 */
export type RevealRequest = Readonly<{
  /** Incógnita a revelar; debe estar oculta y tener Hexágono (13.1, 37.6). */
  unknown: PieceState;
  /** Causa del disparador (adyacencia por Avanzar o Explorar). */
  cause: RevealCause;
  /** Número de Misión (1..15): decide el disparo de prueba de Mina (37.13). */
  missionNumber: number;
  /** Resultado de d6 YA tirado por el Gestor de aleatoriedad (13.4). */
  dieResult: number;
  /** Vista estructural de la Tabla de revelado de la Misión (33.2, 37.6). */
  table: RevealTableView;
  /** Identificadores canónicos de definición por resultado (Datos canónicos). */
  definitionIds: RevealDefinitionIds;
  /**
   * Unidades británicas reveladoras simultáneas de esta Incógnita (37.7, 37.8).
   * Para `adjacency`: las Unidades británicas adyacentes que la revelan. Su
   * número decide la Orientación única o la suspensión. Vacío o ausente cuando
   * la Orientación no aplica (p. ej. Mina o Explorar con Orientación de Jugador).
   */
  revealers?: readonly RevealerInput[];
  /**
   * Orientación inferior válida ELEGIDA por el Jugador cuando Explorar revela
   * una Unidad alemana (37.11, 35.14). Solo se usa con `cause: "scout"`.
   */
  scoutChosenOrientation?: DirectionId;
  /** Referencia de fuente para registrar DP-002 al suspender o detener (37.9, 13.8). */
  sourceRef: RevealSourceRef;
}>;

/**
 * Una Unidad británica reveladora y la Dirección canónica hacia ella desde el
 * Hexágono de la Incógnita (37.7). La correspondencia reveladora→Dirección la
 * aportan los Datos canónicos; este módulo no la deduce de coordenadas.
 */
export type RevealerInput = Readonly<{
  revealerId: PieceState["id"];
  /** Dirección canónica desde la Incógnita hacia la reveladora (37.7). */
  directionToRevealer: DirectionId;
}>;

/**
 * Referencia de fuente estructural mínima para las entradas DP-002 (37.9, 13.8).
 * Espeja la `SourceRef` canónica sin acoplar el dominio al catálogo.
 */
export type RevealSourceRef = Readonly<{
  sourceVersion: string;
  page: number;
  element: string;
  missionRef?: string;
}>;

// ---------------------------------------------------------------------------
// Entrada pendiente DP-002 (37.9, 13.8)
// ---------------------------------------------------------------------------

/**
 * Motivo de una entrada pendiente DP-002 producida por el Revelado:
 * - `orientation-tie`: empate de Orientación por múltiples reveladoras (37.8/37.9).
 * - `no-canonical-resolution`: fuente agotada/contradictoria sin resolución (13.6/13.8).
 */
export type Dp002Reason = "orientation-tie" | "no-canonical-resolution";

/**
 * Entrada pendiente de DP-002 a registrar en el Catálogo funcional (37.9, 13.8).
 * Contiene el motivo, la Referencia de fuente aplicable y un mensaje `es-ES`.
 */
export type Dp002Entry = Readonly<{
  decision: "DP-002";
  reason: Dp002Reason;
  sourceRef: RevealSourceRef;
  message: DomainMessage;
}>;

// ---------------------------------------------------------------------------
// Resultado estructural del Revelado
// ---------------------------------------------------------------------------

/**
 * Resultado de resolver el Revelado de una Incógnita.
 *
 * - `revealed`: la Incógnita se sustituyó por una Unidad alemana revelada en el
 *   mismo Hexágono (13.3, 33.2, 37.6). `piece` es el nuevo {@link PieceState}
 *   revelado; `orientation` refleja si se orientó (única reveladora, 37.7, o
 *   Explorar con Orientación de Jugador, 37.11) o si queda sin Orientación.
 * - `orientation-suspended`: la Unidad alemana se reveló pero la Orientación se
 *   SUSPENDIÓ por múltiples reveladoras sin desempate canónico (37.8). `piece`
 *   se revela SIN Orientación y se acompaña de la entrada `dp002` (37.9, 13.8).
 * - `mine-revealed`: la Tabla produjo una Mina y se sustituyó la Incógnita por
 *   la Mina en el mismo Hexágono (37.12). `triggersImmediateTest` indica si la
 *   causa dispara una prueba inmediata de Mina (37.13 / `mines.ts`; Explorar no,
 *   37.10). La prueba en sí la resuelve `mines.ts`/el Motor con el azar externo.
 * - `stopped`: no había resolución canónica para una fuente agotada o
 *   contradictoria; el Revelado se detiene SIN aplicar contenido (13.6) y se
 *   acompaña de la entrada `dp002` (13.8). Si hubo Consumo aleatorio previo, el
 *   Motor lo conserva con la causa (13.7); este módulo señala la causa.
 */
export type RevealOutcome =
  | Readonly<{
      kind: "revealed";
      piece: PieceState;
      result: RevealResultKind;
      orientation: DirectionId | undefined;
    }>
  | Readonly<{
      kind: "orientation-suspended";
      piece: PieceState;
      result: RevealResultKind;
      dp002: Dp002Entry;
    }>
  | Readonly<{
      kind: "mine-revealed";
      piece: PieceState;
      triggersImmediateTest: boolean;
    }>
  | Readonly<{ kind: "stopped"; cause: DomainMessage; dp002: Dp002Entry }>;

// ---------------------------------------------------------------------------
// Mensajes es-ES
// ---------------------------------------------------------------------------

/** Mensaje `es-ES`: la Incógnita no está oculta o no tiene Hexágono (13.1, 37.6). */
function invalidUnknownMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.reveal.invalidUnknown" });
}

/** Mensaje `es-ES`: el resultado de d6 no tiene fila en la Tabla de revelado (33.2). */
function unmappedDieResultMessage(dieResult: number): DomainMessage {
  return Object.freeze({
    messageKey: "rules.reveal.unmappedDieResult",
    params: Object.freeze({ dieResult }),
  });
}

/** Mensaje `es-ES`: falta el `CatalogId` de definición para el resultado (Datos canónicos). */
function missingDefinitionMessage(result: RevealResultKind): DomainMessage {
  return Object.freeze({
    messageKey: "rules.reveal.missingDefinition",
    params: Object.freeze({ result }),
  });
}

/** Mensaje `es-ES`: Orientación suspendida por múltiples reveladoras (37.8). */
function orientationSuspendedMessage(): DomainMessage {
  return Object.freeze({ messageKey: "rules.reveal.orientationSuspended" });
}

// ---------------------------------------------------------------------------
// Bando de cada resultado de Unidad alemana (33.2)
// ---------------------------------------------------------------------------

/**
 * Bando de una Unidad alemana revelada. Toda Unidad de la Tabla de revelado
 * distinta de la Mina es alemana (33.2); la Mina es neutral en el tablero.
 */
function sideOfResult(result: RevealResultKind): PieceState["side"] {
  return result === "mine" ? "neutral" : "german";
}

// ---------------------------------------------------------------------------
// Construcción de la Ficha revelada (13.3, 33.2, 37.6, 37.12)
// ---------------------------------------------------------------------------

/**
 * Sustituye la Incógnita por su contenido revelado EN EL MISMO Hexágono (13.3,
 * 37.6, 37.12): conserva `id` y `hexId`, cambia `visibility` a `"revealed"` y
 * fija `definitionId`/`side` según el resultado. La Orientación se aplica solo
 * cuando corresponde (única reveladora u Orientación de Jugador). No muta la
 * Incógnita recibida.
 */
function revealPiece(
  unknown: PieceState,
  definitionId: CatalogId,
  result: RevealResultKind,
  orientation: DirectionId | undefined,
): PieceState {
  const base: {
    -readonly [K in keyof PieceState]: PieceState[K];
  } = {
    ...unknown,
    definitionId,
    side: sideOfResult(result),
    visibility: "revealed",
  };
  if (orientation === undefined) {
    delete base.orientation;
  } else {
    base.orientation = orientation;
  }
  return Object.freeze(base);
}

// ---------------------------------------------------------------------------
// Orientación de la Unidad alemana revelada (37.7, 37.8, 37.11)
// ---------------------------------------------------------------------------

/**
 * Resuelve la Orientación de una Unidad alemana revelada.
 *
 * - Explorar (37.11): usa la Orientación inferior válida elegida por el Jugador,
 *   si se aportó; en otro caso queda sin Orientación (pendiente de elección).
 * - Adyacencia con UNA reveladora (37.7): orienta hacia esa reveladora.
 * - Adyacencia con DOS O MÁS reveladoras (37.8): devuelve `"suspended"` para que
 *   el Motor registre DP-002 y revele sin Orientación (37.9).
 * - Sin reveladoras conocidas: sin Orientación (no aplica).
 */
type OrientationResolution =
  | Readonly<{ kind: "oriented"; orientation: DirectionId | undefined }>
  | Readonly<{ kind: "suspended" }>;

function resolveOrientation(request: RevealRequest): OrientationResolution {
  if (request.cause === "scout") {
    return Object.freeze({
      kind: "oriented",
      orientation: request.scoutChosenOrientation,
    });
  }
  const revealers = request.revealers ?? [];
  if (revealers.length >= AMBIGUOUS_REVEALER_COUNT) {
    return Object.freeze({ kind: "suspended" });
  }
  const [singleRevealer] = revealers;
  return Object.freeze({
    kind: "oriented",
    orientation: singleRevealer?.directionToRevealer,
  });
}

// ---------------------------------------------------------------------------
// Guardas de entrada (fail-fast)
// ---------------------------------------------------------------------------

/** ¿La Incógnita es una Ficha oculta con Hexágono asignado? (13.1, 37.6) */
function isRevealableUnknown(unknown: PieceState): boolean {
  return unknown.visibility === "hidden" && unknown.hexId !== undefined;
}

// ---------------------------------------------------------------------------
// Resolución del Revelado
// ---------------------------------------------------------------------------

/**
 * Resuelve el Revelado de una única Incógnita a partir de su disparador y del
 * resultado de d6 ya tirado (13.1-13.4, 33.2, 37.6-37.13).
 *
 * 1. Falla-rápido si la Incógnita no es revelable (no oculta o sin Hexágono).
 * 2. Detiene el Revelado con DP-002 si el resultado de d6 no tiene fila en la
 *    Tabla (fuente agotada/contradictoria: 13.6, 13.8).
 * 3. Si el resultado es Mina, sustituye la Incógnita por la Mina en el mismo
 *    Hexágono (37.12) y delega el disparo de prueba inmediata en `mines.ts`
 *    (37.13; Explorar no dispara, 37.10).
 * 4. Si el resultado es una Unidad alemana, resuelve la Orientación (única
 *    reveladora 37.7, Explorar 37.11) o la SUSPENDE con DP-002 ante empate
 *    (37.8/37.9), y sustituye la Incógnita en el mismo Hexágono (13.3, 33.2,
 *    37.6).
 *
 * Función pura: devuelve un nuevo {@link PieceState} sin mutar la Incógnita y no
 * consume azar (el d6 se recibe ya tirado, 13.4).
 */
export function resolveReveal(request: RevealRequest): RevealOutcome {
  if (!isRevealableUnknown(request.unknown)) {
    return stoppedOutcome(invalidUnknownMessage(), request.sourceRef);
  }
  const result = request.table.resultOf[request.dieResult];
  if (result === undefined) {
    return stoppedOutcome(unmappedDieResultMessage(request.dieResult), request.sourceRef);
  }
  const definitionId = request.definitionIds[result];
  if (definitionId === undefined) {
    return stoppedOutcome(missingDefinitionMessage(result), request.sourceRef);
  }
  if (result === "mine") {
    return revealMine(request, definitionId);
  }
  return revealGermanUnit(request, result, definitionId);
}

/**
 * Sustituye la Incógnita por una Mina en el mismo Hexágono (37.12) e indica si
 * la causa dispara una prueba inmediata (37.13; Explorar no, 37.10). La Mina se
 * revela sin Orientación; su persistencia la gobierna `mines.ts`.
 */
function revealMine(request: RevealRequest, definitionId: CatalogId): RevealOutcome {
  const piece = revealPiece(request.unknown, definitionId, "mine", undefined);
  return Object.freeze({
    kind: "mine-revealed",
    piece,
    triggersImmediateTest: mineRevealTriggersImmediateTest(
      request.cause,
      request.missionNumber,
    ),
  });
}

/**
 * Sustituye la Incógnita por una Unidad alemana revelada en el mismo Hexágono
 * (13.3, 33.2, 37.6) con la Orientación resuelta (37.7/37.11) o suspendida
 * (37.8/37.9).
 */
function revealGermanUnit(
  request: RevealRequest,
  result: RevealResultKind,
  definitionId: CatalogId,
): RevealOutcome {
  const orientation = resolveOrientation(request);
  if (orientation.kind === "suspended") {
    const piece = revealPiece(request.unknown, definitionId, result, undefined);
    return Object.freeze({
      kind: "orientation-suspended",
      piece,
      result,
      dp002: dp002Entry("orientation-tie", request.sourceRef, orientationSuspendedMessage()),
    });
  }
  const piece = revealPiece(request.unknown, definitionId, result, orientation.orientation);
  return Object.freeze({
    kind: "revealed",
    piece,
    result,
    orientation: orientation.orientation,
  });
}

/**
 * Construye una detención del Revelado sin aplicar contenido (13.6) con su
 * entrada DP-002 (13.8). El Motor conserva el Consumo aleatorio previo con la
 * causa cuando corresponda (13.7).
 */
function stoppedOutcome(cause: DomainMessage, sourceRef: RevealSourceRef): RevealOutcome {
  return Object.freeze({
    kind: "stopped",
    cause,
    dp002: dp002Entry("no-canonical-resolution", sourceRef, cause),
  });
}

/** Construye una entrada pendiente DP-002 (37.9, 13.8). */
function dp002Entry(
  reason: Dp002Reason,
  sourceRef: RevealSourceRef,
  message: DomainMessage,
): Dp002Entry {
  return Object.freeze({
    decision: "DP-002",
    reason,
    sourceRef: Object.freeze({ ...sourceRef }),
    message,
  });
}
