/**
 * Estado de publicación, decisiones, conformidad y licencias (Tarea 2.1).
 *
 * Estos tipos modelan la trazabilidad fail-closed del diseño: un Dato canónico
 * solo llega al selector jugable cuando su {@link PublicationStatus} es
 * `published`; en caso contrario queda `blocked` con la lista de causas
 * (DP-001/DP-002/DP-003, prueba pendiente o trazabilidad).
 *
 * Módulo puro, sin dependencias de plataforma (DOM/IndexedDB/red/reloj/AWS).
 * Solo define tipos `Readonly` y sus constructores validadores. La agregación
 * de estados y la emisión de `PublicationReport` corresponden a la Tarea 2.3.
 */
import type {
  CatalogId,
  DecisionRef,
  MissionId,
} from "../../domain/identity/index.js";
import type { SourceRef } from "./source-ref.js";

/** Causas por las que un elemento permanece en Estado no publicable. */
export type PublicationBlockerKind =
  | "DP-001"
  | "DP-002"
  | "DP-003"
  | "test"
  | "traceability";

/**
 * Estado de publicación de un Dato canónico.
 *
 * - `published`: aprobado, con marca temporal de aprobación (`approvedAt`).
 * - `blocked`: bloqueado, con al menos una causa.
 */
export type PublicationStatus =
  | Readonly<{ kind: "published"; approvedAt: string }>
  | Readonly<{
      kind: "blocked";
      blockers: readonly [PublicationBlockerKind, ...PublicationBlockerKind[]];
    }>;

/** Estado de tramitación de una decisión del Registro de decisiones. */
export type DecisionStatus = "pending" | "approved" | "superseded";

/** Alternativa considerada al resolver una ambigüedad o decisión pendiente. */
export type DecisionAlternative = Readonly<{
  id: string;
  summary: string;
  chosen: boolean;
}>;

/**
 * Registro de una decisión (DP-001/DP-002/DP-003 u otra) con su trazabilidad.
 */
export type DecisionRecord = Readonly<{
  id: DecisionRef;
  status: DecisionStatus;
  alternatives: readonly DecisionAlternative[];
  sourceRefs: readonly SourceRef[];
  rationale?: string;
  approvedAt?: string;
}>;

/** Resultado de conformidad de un Dato canónico frente a sus pruebas. */
export type ConformanceStatus = "approved" | "unverified" | "failed";

/** Entrada de la Matriz de conformidad: enlaza un elemento con sus pruebas. */
export type ConformanceEntry = Readonly<{
  catalogId: CatalogId;
  testIds: readonly string[];
  status: ConformanceStatus;
  expected?: unknown;
  actual?: unknown;
  sourceRefs: readonly SourceRef[];
}>;

/**
 * Registro de la Segunda revisión visual de una Misión (DP-001).
 *
 * Comprueba de forma humana e independiente que la transcripción del Mapa
 * coincide con la Página de Mapa (coordenadas, aristas, terrenos, entradas,
 * Incógnitas, fijas y orientaciones). No guarda páginas ni capturas del PDF:
 * solo el estado de DP-001, el resultado, el revisor, la fecha y la Referencia
 * de misión (diseño §1, requisitos 1.8, 2.3).
 *
 * El {@link PublicationGate} solo considera un Mapa publicable cuando
 * `dp001Status === "resolved"` y `result === "approved"`; cualquier otro caso
 * (incluido `undefined`) bloquea la Misión (fail-closed).
 */
export type VisualReviewRecord = Readonly<{
  missionId: MissionId;
  missionRef: SourceRef;
  dp001Status: "pending" | "resolved";
  result?: "approved" | "failed";
  reviewerId?: string;
  reviewedAt?: string;
}>;

/** Propiedad de un recurso: propio o licenciado (DP-003). */
export type ResourceOwnership = "own" | "licensed";

/** Entrada de licencia/procedencia de un recurso empleado por la Aplicación. */
export type LicenseEntry = Readonly<{
  resourceId: string;
  ownership: ResourceOwnership;
  author: string;
  provenance: string;
  license?: string;
  attribution?: string;
  scope?: string;
  evidenceRef?: string;
}>;

/** Error de los constructores de este módulo ante un valor inválido. */
export class InvalidPublicationDataError extends Error {
  public readonly field: string;
  public readonly rawValue: unknown;

  public constructor(field: string, rawValue: unknown, detail?: string) {
    super(`Dato de publicación inválido en «${field}»${detail ? `: ${detail}` : ""}.`);
    this.name = "InvalidPublicationDataError";
    this.field = field;
    this.rawValue = rawValue;
  }
}

function requireNonEmpty(field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidPublicationDataError(field, value, "no puede estar vacío");
  }
  return value;
}

/** Construye un {@link PublicationStatus} `published`. */
export function publishedStatus(approvedAt: string): PublicationStatus {
  return Object.freeze({
    kind: "published",
    approvedAt: requireNonEmpty("approvedAt", approvedAt),
  });
}

/**
 * Construye un {@link PublicationStatus} `blocked` con al menos una causa;
 * elimina duplicados conservando el orden de aparición.
 */
export function blockedStatus(
  blockers: readonly PublicationBlockerKind[],
): PublicationStatus {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    throw new InvalidPublicationDataError(
      "blockers",
      blockers,
      "un estado bloqueado requiere al menos una causa",
    );
  }
  const unique = [...new Set(blockers)];
  return Object.freeze({
    kind: "blocked",
    blockers: Object.freeze(unique) as readonly [
      PublicationBlockerKind,
      ...PublicationBlockerKind[],
    ],
  });
}

/** Indica si un estado permite entregar el elemento al selector jugable. */
export function isPublished(
  status: PublicationStatus,
): status is Readonly<{ kind: "published"; approvedAt: string }> {
  return status.kind === "published";
}

/** Construye una {@link DecisionAlternative}. */
export function decisionAlternative(input: {
  id: string;
  summary: string;
  chosen: boolean;
}): DecisionAlternative {
  return Object.freeze({
    id: requireNonEmpty("id", input.id),
    summary: requireNonEmpty("summary", input.summary),
    chosen: input.chosen === true,
  });
}

/**
 * Construye un {@link DecisionRecord}.
 *
 * - Una decisión `approved` requiere exactamente una alternativa elegida y una
 *   `approvedAt`; ninguna alternativa marcada como elegida invalida el estado.
 * - `pending` y `superseded` no exigen alternativa elegida.
 * - Los campos opcionales se omiten por completo cuando faltan
 *   (`exactOptionalPropertyTypes`).
 */
export function decisionRecord(input: {
  id: DecisionRef;
  status: DecisionStatus;
  alternatives?: readonly DecisionAlternative[];
  sourceRefs?: readonly SourceRef[];
  rationale?: string;
  approvedAt?: string;
}): DecisionRecord {
  const alternatives = Object.freeze([...(input.alternatives ?? [])]);
  const chosenCount = alternatives.filter((a) => a.chosen).length;

  if (input.status === "approved") {
    if (chosenCount !== 1) {
      throw new InvalidPublicationDataError(
        "alternatives",
        input.alternatives,
        "una decisión aprobada requiere exactamente una alternativa elegida",
      );
    }
    if (input.approvedAt === undefined || input.approvedAt.trim().length === 0) {
      throw new InvalidPublicationDataError(
        "approvedAt",
        input.approvedAt,
        "una decisión aprobada requiere marca temporal",
      );
    }
  }

  const base = {
    id: input.id,
    status: input.status,
    alternatives,
    sourceRefs: Object.freeze([...(input.sourceRefs ?? [])]),
  };
  const withRationale =
    input.rationale !== undefined
      ? { ...base, rationale: input.rationale }
      : base;
  const withApproved =
    input.approvedAt !== undefined
      ? { ...withRationale, approvedAt: input.approvedAt }
      : withRationale;
  return Object.freeze(withApproved) as DecisionRecord;
}

/** Construye una {@link ConformanceEntry}. */
export function conformanceEntry(input: {
  catalogId: CatalogId;
  testIds?: readonly string[];
  status: ConformanceStatus;
  expected?: unknown;
  actual?: unknown;
  sourceRefs?: readonly SourceRef[];
}): ConformanceEntry {
  const base = {
    catalogId: input.catalogId,
    testIds: Object.freeze([...(input.testIds ?? [])]),
    status: input.status,
    sourceRefs: Object.freeze([...(input.sourceRefs ?? [])]),
  };
  const withExpected =
    input.expected !== undefined ? { ...base, expected: input.expected } : base;
  const withActual =
    input.actual !== undefined
      ? { ...withExpected, actual: input.actual }
      : withExpected;
  return Object.freeze(withActual) as ConformanceEntry;
}

/**
 * Construye una {@link LicenseEntry}.
 *
 * Los campos obligatorios (`resourceId`, `author`, `provenance`) no pueden
 * estar vacíos; los opcionales se omiten cuando no se aportan.
 */
export function licenseEntry(input: {
  resourceId: string;
  ownership: ResourceOwnership;
  author: string;
  provenance: string;
  license?: string;
  attribution?: string;
  scope?: string;
  evidenceRef?: string;
}): LicenseEntry {
  const base = {
    resourceId: requireNonEmpty("resourceId", input.resourceId),
    ownership: input.ownership,
    author: requireNonEmpty("author", input.author),
    provenance: requireNonEmpty("provenance", input.provenance),
  };
  let result: Record<string, unknown> = { ...base };
  if (input.license !== undefined) result = { ...result, license: input.license };
  if (input.attribution !== undefined)
    result = { ...result, attribution: input.attribution };
  if (input.scope !== undefined) result = { ...result, scope: input.scope };
  if (input.evidenceRef !== undefined)
    result = { ...result, evidenceRef: input.evidenceRef };
  return Object.freeze(result) as unknown as LicenseEntry;
}

/**
 * Construye un {@link VisualReviewRecord}.
 *
 * Una revisión con `result === "approved"` exige `dp001Status === "resolved"`,
 * un `reviewerId` no vacío y un `reviewedAt` no vacío: una aprobación sin
 * revisor o sin fecha no es trazable (fail-closed). Los campos opcionales se
 * omiten por completo cuando no se aportan (`exactOptionalPropertyTypes`).
 */
export function visualReviewRecord(input: {
  missionId: MissionId;
  missionRef: SourceRef;
  dp001Status: "pending" | "resolved";
  result?: "approved" | "failed";
  reviewerId?: string;
  reviewedAt?: string;
}): VisualReviewRecord {
  if (input.result === "approved") {
    if (input.dp001Status !== "resolved") {
      throw new InvalidPublicationDataError(
        "dp001Status",
        input.dp001Status,
        "una revisión aprobada exige DP-001 resuelto",
      );
    }
    requireNonEmpty("reviewerId", input.reviewerId);
    requireNonEmpty("reviewedAt", input.reviewedAt);
  }

  const base = {
    missionId: input.missionId,
    missionRef: input.missionRef,
    dp001Status: input.dp001Status,
  };
  let result: Record<string, unknown> = { ...base };
  if (input.result !== undefined) result = { ...result, result: input.result };
  if (input.reviewerId !== undefined)
    result = { ...result, reviewerId: input.reviewerId };
  if (input.reviewedAt !== undefined)
    result = { ...result, reviewedAt: input.reviewedAt };
  return Object.freeze(result) as unknown as VisualReviewRecord;
}
