/**
 * Máquina de estado pura del Bloqueo local (Tarea 23.2, requisitos 26.10, 26.11).
 *
 * Modela la lógica de bloqueo/desbloqueo de la Interfaz SIN tocar plataforma:
 * decide, a partir del material verificador persistido, del modo de red y de un
 * intento de credencial, si Partidas y reglas deben permanecer ocultas.
 *
 * Reglas del diseño (§10):
 * - Tras una descarga válida del Paquete sin conexión se puede inicializar el
 *   Verificador local con el mismo usuario y clave del Control de acceso (26.10);
 *   esa inicialización produce {@link LocalVerifierMaterial} (ver
 *   `local-verifier.ts`) que la capa de adaptador persiste.
 * - MIENTRAS el dispositivo opera sin conexión, el Bloqueo local oculta Partidas
 *   y reglas hasta verificar el mismo usuario y clave (26.11).
 * - El Verificador local no guarda la clave ni una representación recuperable
 *   (26.12): esta máquina nunca recibe ni almacena el material derivado como
 *   secreto reversible; solo lo consulta para comparar.
 *
 * FRONTERA DE CAPAS: módulo PURO de `domain/`. No importa DOM, IndexedDB, red ni
 * reloj. El modo de red y el material llegan como datos; la Interfaz aplica la
 * proyección y la persistencia vive en el adaptador.
 */
import {
  verifyLocalCredential,
  type LocalCredential,
  type LocalVerifierMaterial,
} from "./local-verifier.js";

/**
 * Estado del Bloqueo local. `locked` oculta Partidas/reglas; `unlocked` las
 * revela; `uninitialized` indica que aún no se ha creado el Verificador local
 * (no hay material tras una descarga válida). El estado de bloqueo NO es estado
 * de dominio de la Partida: es estado de sesión de la Interfaz.
 */
export type LocalLockStatus = "uninitialized" | "locked" | "unlocked";

/**
 * Entrada para decidir el estado inicial al arrancar. `online` refleja si el
 * dispositivo tiene conexión; `material` es el Verificador local persistido (o
 * `undefined` si no se ha inicializado).
 */
export type LocalLockStartup = Readonly<{
  online: boolean;
  material: LocalVerifierMaterial | undefined;
}>;

/** Proyección de visibilidad derivada del estado (consumida por `ui/`). */
export type LocalLockView = Readonly<{
  status: LocalLockStatus;
  /** Si Partidas y reglas deben mostrarse en la Interfaz. */
  contentVisible: boolean;
  /** Si la Interfaz debe pedir la credencial para desbloquear. */
  promptForCredential: boolean;
}>;

/** Resultado de un intento de verificación de credencial. */
export type LocalUnlockResult = Readonly<{
  status: LocalLockStatus;
  /** `true` si la credencial coincidió y se desbloqueó. */
  unlocked: boolean;
}>;

/**
 * Decide el estado del Bloqueo local al arrancar (26.11).
 *
 * - Sin material inicializado → `uninitialized` (el contenido depende de la
 *   inicialización tras la descarga; la Interfaz decide si ofrece continuar en
 *   línea o inicializar el Bloqueo local).
 * - Con material y SIN conexión → `locked`: se ocultan Partidas y reglas hasta
 *   verificar (requisito 26.11).
 * - Con material y CON conexión → `unlocked`: el Control de acceso en línea ya
 *   media la entrega; el Bloqueo local no vuelve a exigir credencial.
 */
export function evaluateStartupLock(startup: LocalLockStartup): LocalLockStatus {
  if (startup.material === undefined) {
    return "uninitialized";
  }
  if (!startup.online) {
    return "locked";
  }
  return "unlocked";
}

/**
 * Intenta desbloquear verificando la credencial contra el material. Solo pasa a
 * `unlocked` si la verificación es correcta; en caso contrario conserva
 * `locked`. Función pura: no muta el material ni conserva la credencial.
 */
export function attemptUnlock(
  material: LocalVerifierMaterial,
  credential: LocalCredential,
): LocalUnlockResult {
  const ok = verifyLocalCredential(material, credential);
  return Object.freeze({
    status: ok ? "unlocked" : "locked",
    unlocked: ok,
  });
}

/**
 * Proyecta la visibilidad a partir del estado. `locked` y `uninitialized`
 * ocultan el contenido; solo `unlocked` lo revela. `locked` solicita credencial;
 * `uninitialized` no (todavía no hay Verificador local que comprobar).
 */
export function projectLockView(status: LocalLockStatus): LocalLockView {
  return Object.freeze({
    status,
    contentVisible: status === "unlocked",
    promptForCredential: status === "locked",
  });
}
