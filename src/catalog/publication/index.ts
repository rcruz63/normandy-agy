/**
 * Punto de entrada del Publication Gate fail-closed (Tarea 2.3).
 *
 * Reexporta el tipo concreto {@link PublicationReport}, la causa estructurada
 * {@link PublicationBlocker}, el contrato {@link PublicationGate} y su fábrica
 * {@link createPublicationGate}. Módulo puro.
 */
export type {
  PublicationBlocker,
  PublicationReport,
  PublicationGate,
} from "./publication-gate.js";
export { createPublicationGate } from "./publication-gate.js";
