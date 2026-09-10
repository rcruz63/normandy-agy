/**
 * Punto de entrada del adaptador de persistencia del Bloqueo local
 * (Tarea 23.2).
 *
 * Reexporta la persistencia del material del Verificador local sobre el object
 * store `settings` de IndexedDB. Adaptador de navegador: el dominio no lo
 * importa.
 */
export {
  LOCAL_VERIFIER_SETTINGS_KEY,
  LocalVerifierStore,
} from "./local-verifier-store.js";
