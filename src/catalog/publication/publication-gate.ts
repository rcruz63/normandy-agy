/**
 * `PublicationGate` fail-closed (Tarea 2.3).
 *
 * El Publication Gate agrega, para una {@link MaintenanceCatalog} candidata,
 * las decisiones del Registro (DP-001/DP-002/DP-003), la Segunda revisión
 * visual de cada Mapa, el Inventario de licencias y la Matriz de conformidad, y
 * decide qué Misiones pueden entregarse al selector jugable.
 *
 * Opera en modo FAIL-CLOSED: una Misión solo llega al selector cuando TODO su
 * contexto está resuelto y aprobado; cualquier estado `unknown`, pendiente,
 * huérfano o sin prueba aprobada la mantiene bloqueada con un
 * {@link PublicationBlocker} estructurado (diseño §1, requisitos 1.8, 2.3, 2.4,
 * 2.5, 3.6, 4.8, 30.4, 30.6, 30.11, 33.8, 40.6, 40.7, 40.13).
 *
 * Reglas de publicación por Misión:
 * - DP-001 resuelto + Segunda revisión visual aprobada para su Mapa.
 * - DP-002 resuelto para cada situación aplicable (ninguna decisión DP-002
 *   pendiente o supersedida sin aprobar).
 * - Recurso propio o permiso DP-003 documentado para cada recurso empleado
 *   (ninguna licencia con permiso ausente).
 * - Prueba aprobada por elemento inventariado necesario (conformidad
 *   `approved`; `unverified`/`failed`/ausente bloquean).
 *
 * El Gate NO resuelve decisiones ni fabrica contenido: solo comprueba estados y
 * bloquea. Módulo puro: no importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
import type { MissionId } from "../../domain/identity/index.js";
import type { MaintenanceCatalog } from "../schemas/build.js";
import type {
  ConformanceEntry,
  DecisionRecord,
  LicenseEntry,
  VisualReviewRecord,
} from "../schemas/publication.js";
import type {
  PublicationBlocker,
  PublicationGate,
  PublicationReport,
} from "./publication-gate-types.js";

// La superficie de tipos pública del Gate se define en `publication-gate-types`
// y se reexporta aquí para preservar el punto de entrada histórico del módulo.
export type {
  PublicationBlocker,
  PublicationGate,
  PublicationReport,
} from "./publication-gate-types.js";

/**
 * Referencias DP canónicas. El Gate identifica las decisiones DP-001/DP-002/
 * DP-003 por prefijo del `DecisionRef` (p. ej. `DP-001` o `DP-002-mXX`).
 */
const DP001_PREFIX = "DP-001";
const DP002_PREFIX = "DP-002";
const DP003_PREFIX = "DP-003";

function decisionIdString(decision: DecisionRecord): string {
  return decision.id as unknown as string;
}

function hasPrefix(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(`${prefix}-`) || id.startsWith(`${prefix}/`);
}

/** Una decisión está resuelta solo si su estado es exactamente `approved`. */
function isResolved(decision: DecisionRecord): boolean {
  return decision.status === "approved";
}

/**
 * Comprueba la Segunda revisión visual de una Misión: exige la revisión
 * presente, con DP-001 resuelto y resultado aprobado. Devuelve el bloqueo si
 * falla, o `undefined` si es publicable.
 */
function checkVisualReview(
  missionId: MissionId,
  review: VisualReviewRecord | undefined,
): PublicationBlocker | undefined {
  if (review === undefined) {
    return {
      kind: "DP-001",
      missionId,
      detailEs:
        "La Misión carece de Segunda revisión visual; DP-001 no puede considerarse resuelto (fail-closed).",
    };
  }
  if (review.dp001Status !== "resolved" || review.result !== "approved") {
    return {
      kind: "DP-001",
      missionId,
      detailEs:
        "La Segunda revisión visual del Mapa no está resuelta y aprobada; la Misión permanece no publicable.",
    };
  }
  return undefined;
}

/**
 * Reúne las decisiones DP-002 sin resolver (pendientes o supersedidas). Cada una
 * bloquea la publicación global hasta su resolución.
 */
function collectDp002Blockers(
  decisions: readonly DecisionRecord[],
): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];
  for (const decision of decisions) {
    const id = decisionIdString(decision);
    if (hasPrefix(id, DP002_PREFIX) && !isResolved(decision)) {
      blockers.push({
        kind: "DP-002",
        decisionId: id,
        detailEs: `La ambigüedad «${id}» (DP-002) no está resuelta; el contenido dependiente permanece no publicable.`,
      });
    }
  }
  return blockers;
}

/**
 * Reúne las decisiones DP-001 registradas que no están resueltas. Complementa
 * la Segunda revisión visual por Misión con la trazabilidad del Registro.
 */
function collectDp001DecisionBlockers(
  decisions: readonly DecisionRecord[],
): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];
  for (const decision of decisions) {
    const id = decisionIdString(decision);
    if (hasPrefix(id, DP001_PREFIX) && !isResolved(decision)) {
      blockers.push({
        kind: "DP-001",
        decisionId: id,
        detailEs: `La transcripción visual «${id}» (DP-001) no está resuelta; su Mapa permanece no publicable.`,
      });
    }
  }
  return blockers;
}

/**
 * Reúne los recursos sin permiso: una licencia `licensed` sin permiso concreto
 * documentado (`license` ausente/vacío) bloquea por DP-003. Un recurso `own`
 * (propio) no requiere permiso. Además, cualquier decisión DP-003 sin resolver
 * bloquea.
 */
function collectDp003Blockers(
  licenses: readonly LicenseEntry[],
  decisions: readonly DecisionRecord[],
): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];

  for (const entry of licenses) {
    if (
      entry.ownership === "licensed" &&
      (entry.license === undefined || entry.license.trim().length === 0)
    ) {
      blockers.push({
        kind: "DP-003",
        resourceId: entry.resourceId,
        detailEs: `El recurso «${entry.resourceId}» es licenciado pero no documenta un permiso concreto (DP-003); use recurso propio o registre el permiso.`,
      });
    }
  }

  for (const decision of decisions) {
    const id = decisionIdString(decision);
    if (hasPrefix(id, DP003_PREFIX) && !isResolved(decision)) {
      blockers.push({
        kind: "DP-003",
        decisionId: id,
        detailEs: `El permiso «${id}» (DP-003) no está resuelto; el recurso dependiente permanece no publicable.`,
      });
    }
  }

  return blockers;
}

/**
 * Reúne los bloqueos de conformidad: toda entrada de la Matriz cuya prueba no
 * esté `approved` (es decir `unverified` o `failed`) bloquea el elemento y, por
 * tanto, la Versión de reglas (requisitos 2.4, 2.5). Un elemento sin entrada de
 * conformidad no puede publicarse, pero esa cobertura huérfana la refuerza el
 * compilador (Tarea 2.2); aquí se bloquea lo que la Matriz declara no aprobado.
 */
function collectConformanceBlockers(
  conformance: readonly ConformanceEntry[],
): PublicationBlocker[] {
  const blockers: PublicationBlocker[] = [];
  for (const entry of conformance) {
    if (entry.status !== "approved") {
      blockers.push({
        kind: "test",
        catalogId: entry.catalogId,
        detailEs: `El elemento «${entry.catalogId as unknown as string}» no tiene una prueba aprobada (estado «${entry.status}»); permanece no publicable.`,
      });
    }
  }
  return blockers;
}

/**
 * Crea un {@link PublicationGate} fail-closed.
 *
 * `evaluate` es puro y determinista: no muta su entrada y no accede a
 * plataforma. Entrega en `publishableMissionIds` únicamente las Misiones cuyo
 * contexto completo (DP-001 + revisión visual, DP-002, DP-003 y conformidad)
 * está resuelto y aprobado.
 */
export function createPublicationGate(): PublicationGate {
  return Object.freeze({
    evaluate(catalog: MaintenanceCatalog): PublicationReport {
      const decisions = catalog.decisions ?? [];
      const conformance = catalog.conformance ?? [];
      const licenses = catalog.licenses ?? [];
      const reviews = catalog.visualReviews ?? [];

      const reviewByMission = new Map<string, VisualReviewRecord>();
      for (const review of reviews) {
        reviewByMission.set(review.missionId as unknown as string, review);
      }

      const blockers: PublicationBlocker[] = [];

      // Bloqueos globales: decisiones DP no resueltas, licencias sin permiso y
      // conformidad no aprobada. Cualquiera de ellos impide publicar el
      // contenido dependiente.
      const dp001DecisionBlockers = collectDp001DecisionBlockers(decisions);
      const dp002Blockers = collectDp002Blockers(decisions);
      const dp003Blockers = collectDp003Blockers(licenses, decisions);
      const conformanceBlockers = collectConformanceBlockers(conformance);

      blockers.push(
        ...dp001DecisionBlockers,
        ...dp002Blockers,
        ...dp003Blockers,
        ...conformanceBlockers,
      );

      // Si hay CUALQUIER bloqueo global sin atribución de Misión concreta, el
      // Gate es fail-closed: ninguna Misión se entrega al selector.
      const hasGlobalBlockers =
        dp002Blockers.length > 0 ||
        dp003Blockers.length > 0 ||
        conformanceBlockers.length > 0 ||
        dp001DecisionBlockers.length > 0;

      const publishable: MissionId[] = [];

      for (const mission of catalog.missions) {
        const review = reviewByMission.get(mission.id as unknown as string);
        const visualBlocker = checkVisualReview(mission.id, review);
        if (visualBlocker !== undefined) {
          blockers.push(visualBlocker);
        }

        // Una Misión solo es publicable si su Mapa pasó la revisión y no hay
        // ningún bloqueo global pendiente que afecte al contenido distribuido.
        if (visualBlocker === undefined && !hasGlobalBlockers) {
          publishable.push(mission.id);
        }
      }

      return Object.freeze({
        rulesVersionCandidate:
          catalog.rulesVersionCandidate as unknown as string,
        publishableMissionIds: Object.freeze([...publishable]),
        blockers: Object.freeze([...blockers]),
        inventoryCoverage: Object.freeze([...conformance]),
      });
    },
  });
}
