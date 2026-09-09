/**
 * Marcadores provisionales para tipos referenciados por los puertos.
 *
 * La Tarea 1 fija las FIRMAS de los puertos del diseño. Los modelos ricos que
 * estas firmas mencionan (catálogo, estado de partida, transiciones, copias,
 * migraciones, paquete sin conexión) se detallan en tareas posteriores:
 *
 * - Catálogo y publicación: Tarea 2.
 * - Estado, transición e invariantes: Tarea 7 (ya sustituidos: ver más abajo).
 * - Motor de reglas: Tarea 8.
 * - Aleatoriedad: Tarea 6.
 * - Persistencia y unidad de trabajo: Tarea 15 (ya sustituidos: ver más abajo).
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

// --- Estado, comandos y transiciones (Tareas 7 y 8: modelos reales) ---
// Sustituidos por los modelos reales del Motor. El puerto no duplica formas:
// reexporta desde `engine/state.ts` y `engine/transition.ts` para que
// `RulesEngine`, `GameRepository` y `GameUnitOfWork` compartan exactamente el
// mismo `GameSnapshot`/`GameCommand`/`TransitionProposal`/`DomainMessage`.
export type {
  GameState,
  GameSnapshot,
} from "../engine/state.js";
export type {
  GameCommand,
  TransitionProposal,
  DomainMessage,
} from "../engine/transition.js";
export type { ActionDescriptor } from "../engine/rules-engine.js";

// --- Persistencia y unidad de trabajo (Tarea 15.2: modelos reales) ---
// Sustituidos por los modelos reales de `game-persistence.ts`.
export type { Diagnostic } from "./game-persistence.js";

// --- Aleatoriedad (Tarea 6) ---
export type RandomState = Brand<unknown, "RandomState">;
export type RandomRequest = Brand<unknown, "RandomRequest">;
export type RandomConsumption = Brand<unknown, "RandomConsumption">;

// --- Persistencia y unidad de trabajo (Tarea 15.2: modelos reales) ---
export type {
  CommandOutcome,
  PersistableTransition,
  CommitReceipt,
  GameSummary,
} from "./game-persistence.js";

// --- Copia e importación (Tarea 16.1: modelos reales) ---
// Sustituidos por los modelos reales de `persistence/backup-package.ts`. El
// puerto no duplica formas: reexporta el `GameAggregate`/`BackupPackage`/
// `ValidatedBackup`/`BackupFailure` reales para que `BackupCodec` comparta
// exactamente el mismo modelo que la implementación y el flujo de staging.
export type {
  GameAggregate,
  BackupPackage,
  ValidatedBackup,
  BackupFailure,
} from "../persistence/backup-package.js";

// --- Migración (Tarea 16.2/16.3) ---
export type MigrationPlan = Brand<unknown, "MigrationPlan">;
export type MigrationResult = Brand<unknown, "MigrationResult">;
export type StorageGeneration = Brand<unknown, "StorageGeneration">;

// --- Paquete sin conexión (Tarea 19) ---
export type OfflinePackageManifest = Brand<unknown, "OfflinePackageManifest">;
export type OfflineAvailability = Brand<unknown, "OfflineAvailability">;
export type StagedPackageResult = Brand<unknown, "StagedPackageResult">;
export type ActivationResult = Brand<unknown, "ActivationResult">;
