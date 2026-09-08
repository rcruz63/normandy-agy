/**
 * Puertos de exportación/importación y migraciones (diseño §6).
 *
 * `BackupCodec` trabaja sobre una representación canónica versionada; la suma
 * detecta alteración accidental y no es firma, autenticación ni cifrado.
 * `MigrationRegistry` planifica y ejecuta cadenas de migradores puros sobre una
 * generación de almacenamiento. Ningún flujo llama a un servidor.
 */
import type { SaveVersion } from "../identity/index.js";
import type {
  BackupFailure,
  BackupPackage,
  GameAggregate,
  MigrationPlan,
  MigrationResult,
  StorageGeneration,
  ValidatedBackup,
} from "./placeholders.js";

export interface BackupCodec {
  encode(games: readonly GameAggregate[]): Promise<BackupPackage>;
  validate(bytes: Uint8Array): Promise<ValidatedBackup | BackupFailure>;
}

export interface MigrationRegistry {
  plan(from: SaveVersion, to: SaveVersion): MigrationPlan | undefined;
  migrate(input: StorageGeneration, plan: MigrationPlan): MigrationResult;
}
