/**
 * Persistencia del material del Verificador local (Tarea 23.2, requisito 26.12).
 *
 * El Bloqueo local necesita conservar, ENTRE arranques, el material verificador
 * NO recuperable ({@link LocalVerifierMaterial}) para poder comprobar la
 * credencial sin volver a pedir una descarga. Ese material se guarda en el
 * object store `settings` de IndexedDB (diseño §5) bajo una clave estable. NO se
 * guarda la clave ni ninguna representación reversible: `LocalVerifierMaterial`
 * contiene solo `algorithmVersion`, `salt`, iteraciones y el digest de tamaño
 * fijo.
 *
 * FRONTERA DE CAPAS: adaptador de navegador. Depende de `IndexedDbStoreAdapter`
 * (IndexedDB) y de tipos PUROS del dominio; el dominio no importa este módulo.
 * No usa reloj ni `Math.random`; la compatibilidad del sobre se inyecta.
 */
import type { LocalVerifierMaterial } from "../../../domain/access/index.js";
import type { EnvelopeCompatibility } from "../../../domain/persistence/index.js";
import type { IndexedDbStoreAdapter } from "../indexeddb/index.js";

/** Clave estable del material del Verificador local en el store `settings`. */
export const LOCAL_VERIFIER_SETTINGS_KEY = "local-lock:verifier-material" as const;

/**
 * Adaptador de persistencia del material del Verificador local sobre el store
 * `settings`. La compatibilidad del sobre (versiones de guardado/reglas
 * soportadas) se inyecta porque este material es un ajuste global, no ligado a
 * una Partida concreta (`gameId` omitido).
 */
export class LocalVerifierStore {
  private readonly store: IndexedDbStoreAdapter;
  private readonly compatibility: EnvelopeCompatibility;

  public constructor(
    store: IndexedDbStoreAdapter,
    compatibility: EnvelopeCompatibility,
  ) {
    this.store = store;
    this.compatibility = compatibility;
  }

  /**
   * Guarda (o reemplaza) el material del Verificador local. Solo persiste
   * material NO recuperable; nunca la clave del Propietario.
   */
  public async save(material: LocalVerifierMaterial): Promise<void> {
    await this.store.putSetting<LocalVerifierMaterial>(
      LOCAL_VERIFIER_SETTINGS_KEY,
      { compatibility: this.compatibility, payload: material },
    );
  }

  /**
   * Lee el material persistido o `undefined` si aún no se ha inicializado el
   * Bloqueo local. La lectura valida el sobre (versión/integridad) como
   * cualquier otra del adaptador.
   */
  public async load(): Promise<LocalVerifierMaterial | undefined> {
    return this.store.getSetting<LocalVerifierMaterial>(
      LOCAL_VERIFIER_SETTINGS_KEY,
    );
  }
}
