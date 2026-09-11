/**
 * Segunda revisión visual y estado de DP-001 de un mapa (Tarea 5.1).
 *
 * Modela la revisión de transcripción del mapa y el estado de la decisión
 * pendiente DP-001 que condiciona su publicación (requisitos 40.4, 40.13), sin
 * hornear posiciones ni Orientaciones derivadas del PDF. Se separa del modelo de
 * Mapa (`./map.js`) porque es una abstracción distinta —el flujo de revisión y
 * publicación— con sus propias invariantes.
 *
 * Pureza del dominio: no importa DOM, IndexedDB, red, reloj ni SDK de AWS. Un
 * mapa cuya revisión no esté aprobada permanece en Estado no publicable, de modo
 * que capas superiores bloqueen la publicación (requisito 40.6/40.13).
 */
import { InvalidGeometryModelError } from "./geometry-model-error.js";

/**
 * Referencia de misión estructural usada por {@link VisualReview}.
 *
 * Espeja la forma de la `SourceRef` canónica (definida en el catálogo) sin
 * crear una dependencia del dominio hacia el catálogo. El cableado con la
 * `SourceRef` oficial se hará en una tarea posterior de puertos.
 */
export type MissionSourceRef = Readonly<{
  sourceVersion: string;
  page: number;
  element: string;
  missionRef?: string;
}>;

/**
 * Segunda revisión visual y estado de la decisión DP-001 de un mapa.
 *
 * `dp001Status = "pending"` o la ausencia/rechazo de `result` mantienen el
 * mapa en Estado no publicable. `missionRef` localiza el elemento revisado en
 * la Fuente lúdica.
 */
export type VisualReview = Readonly<{
  dp001Status: "pending" | "resolved";
  reviewerId?: string;
  reviewedAt?: string;
  missionRef: MissionSourceRef;
  result?: "approved" | "failed";
}>;

/** Entrada del constructor {@link visualReview}. */
type VisualReviewInput = {
  dp001Status: "pending" | "resolved";
  missionRef: MissionSourceRef;
  reviewerId?: string;
  reviewedAt?: string;
  result?: "approved" | "failed";
};

/** Comprueba que `dp001Status` tenga uno de los dos valores admitidos. */
function assertDp001Status(status: VisualReview["dp001Status"]): void {
  if (status !== "pending" && status !== "resolved") {
    throw new InvalidGeometryModelError("dp001Status", "debe ser «pending» o «resolved»");
  }
}

/**
 * Comprueba que una revisión aprobada tenga la trazabilidad exigida: una
 * aprobación sin DP-001 resuelto, sin revisor o sin fecha no puede publicar el
 * mapa (requisitos 40.4/40.5).
 */
function assertApprovedReviewTraceability(input: VisualReviewInput): void {
  if (input.result !== "approved") return;

  if (input.dp001Status !== "resolved") {
    throw new InvalidGeometryModelError(
      "result",
      "no puede aprobarse mientras DP-001 esté pendiente",
    );
  }
  if (input.reviewerId === undefined || input.reviewerId.trim().length === 0) {
    throw new InvalidGeometryModelError("reviewerId", "una revisión aprobada requiere revisor");
  }
  if (input.reviewedAt === undefined || input.reviewedAt.trim().length === 0) {
    throw new InvalidGeometryModelError("reviewedAt", "una revisión aprobada requiere fecha");
  }
}

/** Construye una {@link VisualReview} validando su coherencia. */
export function visualReview(input: VisualReviewInput): VisualReview {
  assertDp001Status(input.dp001Status);
  if (input.missionRef === undefined || input.missionRef === null) {
    throw new InvalidGeometryModelError("missionRef", "la revisión requiere una Referencia de misión");
  }
  assertApprovedReviewTraceability(input);

  const base: {
    dp001Status: "pending" | "resolved";
    missionRef: MissionSourceRef;
    reviewerId?: string;
    reviewedAt?: string;
    result?: "approved" | "failed";
  } = {
    dp001Status: input.dp001Status,
    missionRef: Object.freeze({ ...input.missionRef }),
  };
  if (input.reviewerId !== undefined) base.reviewerId = input.reviewerId;
  if (input.reviewedAt !== undefined) base.reviewedAt = input.reviewedAt;
  if (input.result !== undefined) base.result = input.result;
  return Object.freeze(base);
}

/**
 * Indica si un mapa ha superado la Segunda revisión visual y puede publicarse
 * (requisito 40.13). No decide por sí mismo la publicación: es un predicado que
 * las capas de publicación consumen.
 */
export function isMapPublishable(review: VisualReview): boolean {
  return review.dp001Status === "resolved" && review.result === "approved";
}
