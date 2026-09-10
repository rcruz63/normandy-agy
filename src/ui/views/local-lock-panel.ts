/**
 * Proyección de la Interfaz para el Bloqueo local (Tarea 23.2, requisitos
 * 26.11, 26.13, 26.14).
 *
 * A partir de la vista pura del Bloqueo local ({@link LocalLockView}, dominio)
 * produce una proyección `es-ES` que la Interfaz renderiza. Cuando el estado es
 * `locked`, oculta Partidas y reglas y solicita la credencial (26.11). SIEMPRE
 * incluye los dos avisos informativos OBLIGATORIOS:
 *
 * - el Bloqueo local solo protege la Interfaz y no cifra IndexedDB/Cache Storage
 *   ni ofrece confidencialidad frente a quien controla el dispositivo (26.13);
 * - la autenticación en línea no puede revocar el acceso a los Datos descargados
 *   ya almacenados (26.14).
 *
 * FRONTERA DE CAPAS: módulo de `ui/`. Transforma una proyección del dominio y
 * resuelve texto `es-ES`; no contiene lógica de verificación ni toca DOM,
 * IndexedDB, red ni reloj. La verificación de la credencial vive en el dominio
 * y su persistencia en el adaptador.
 */
import type { LocalLockView } from "../../domain/access/index.js";
import { resolveMessageKey } from "../locale/message-resolver.js";
import type { MessageCatalog } from "../locale/messages-es-ES.js";

/**
 * Proyección renderizable del panel del Bloqueo local. `contentVisible` refleja
 * si Partidas/reglas deben mostrarse; `promptForCredential` si se pide la
 * credencial. Los `notices` son los avisos informativos obligatorios (26.13,
 * 26.14) y se muestran SIEMPRE, también cuando el contenido es visible.
 */
export type LocalLockPanel = Readonly<{
  title: string;
  contentVisible: boolean;
  promptForCredential: boolean;
  /** Texto explicativo del formulario cuando está bloqueado (o vacío). */
  description: string;
  usernameLabel: string;
  keyLabel: string;
  unlockLabel: string;
  /** Avisos informativos obligatorios en orden estable (26.13, 26.14). */
  notices: readonly string[];
}>;

/**
 * Proyecta el panel del Bloqueo local a texto `es-ES`. Función pura: no muta la
 * vista ni el catálogo y devuelve una proyección congelada.
 */
export function projectLocalLockPanel(
  view: LocalLockView,
  catalog?: MessageCatalog,
): LocalLockPanel {
  const resolve = (key: string): string =>
    catalog === undefined
      ? resolveMessageKey(key)
      : resolveMessageKey(key, {}, catalog);

  return Object.freeze({
    title: resolve("ui.local-lock.title"),
    contentVisible: view.contentVisible,
    promptForCredential: view.promptForCredential,
    description: view.promptForCredential
      ? resolve("ui.local-lock.locked.description")
      : "",
    usernameLabel: resolve("ui.local-lock.username.label"),
    keyLabel: resolve("ui.local-lock.key.label"),
    unlockLabel: resolve("ui.local-lock.action.unlock"),
    notices: Object.freeze([
      resolve("ui.local-lock.notice.interface-only"),
      resolve("ui.local-lock.notice.no-revocation"),
    ]),
  });
}
