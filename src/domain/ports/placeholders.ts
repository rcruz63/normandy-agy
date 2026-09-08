/**
 * Marcadores provisionales para tipos referenciados por los puertos.
 *
 * La Tarea 1 fija las FIRMAS de los puertos del diseño. Los modelos ricos que
 * estas firmas mencionan (catálogo, estado de partida, transiciones, copias,
 * migraciones, paquete sin conexión) se detallan en tareas posteriores:
 *
 * - Catálogo y publicación: Tarea 2.
 * - Estado, transición e invariantes: Tarea 7.
 * - Motor de reglas: Tarea 8.
 * - Aleatoriedad: Tarea 6.
 * - Persistencia y unidad de trabajo: Tarea 15.
 * - Copia, importación y migración: Tarea 16.
 * - Paquete sin conexión: Tarea 19.
 *
 * Hasta entonces se declaran aquí como tipos opacos (marcas) para que el
 * dominio compile con fronteras estrictas sin fijar prematuramente su forma.
 * Cada tarea sustituirá el marcador correspondiente por su definición real.
 *
 * Nota de frontera: este módulo vive en `domain/` y no importa DOM, IndexedDB,
 * red, reloj ni SDK de AWS.
 */
import type { Brand } from "../identity/index.js";

// --- Catálogo y publicación (Tarea 2) ---
export type MaintenanceCatalog = Brand<unknown, "MaintenanceCatalog">;
export type RulesCatalog = Brand<unknown, "RulesCatalog">;
export type CatalogBuildResult = Brand<unknown, "CatalogBuildResult">;
export type PublicationReport = Brand<unknown, "PublicationReport">;

// --- Estado, comandos y transiciones (Tareas 7 y 8) ---
export type GameState = Brand<unknown, "GameState">;
export type GameSnapshot = Brand<unknown, "GameSnapshot">;
export type GameCommand = Brand<unknown, "GameCommand">;
export type TransitionProposal = Brand<unknown, "TransitionProposal">;
export type ActionDescriptor = Brand<unknown, "ActionDescriptor">;
export type DomainMessage = Brand<unknown, "DomainMessage">;
export type Diagnostic = Brand<unknown, "Diagnostic">;

// --- Aleatoriedad (Tarea 6) ---
export type RandomState = Brand<unknown, "RandomState">;
export type RandomRequest = Brand<unknown, "RandomRequest">;
export type RandomConsumption = Brand<unknown, "RandomConsumption">;

// --- Persistencia y unidad de trabajo (Tarea 15) ---
export type CommandOutcome = Brand<unknown, "CommandOutcome">;
export type PersistableTransition = Brand<unknown, "PersistableTransition">;
export type CommitReceipt = Brand<unknown, "CommitReceipt">;
export type GameSummary = Brand<unknown, "GameSummary">;

// --- Copia, importación y migración (Tarea 16) ---
export type GameAggregate = Brand<unknown, "GameAggregate">;
export type BackupPackage = Brand<unknown, "BackupPackage">;
export type ValidatedBackup = Brand<unknown, "ValidatedBackup">;
export type BackupFailure = Brand<unknown, "BackupFailure">;
export type MigrationPlan = Brand<unknown, "MigrationPlan">;
export type MigrationResult = Brand<unknown, "MigrationResult">;
export type StorageGeneration = Brand<unknown, "StorageGeneration">;

// --- Paquete sin conexión (Tarea 19) ---
export type OfflinePackageManifest = Brand<unknown, "OfflinePackageManifest">;
export type OfflineAvailability = Brand<unknown, "OfflineAvailability">;
export type StagedPackageResult = Brand<unknown, "StagedPackageResult">;
export type ActivationResult = Brand<unknown, "ActivationResult">;
