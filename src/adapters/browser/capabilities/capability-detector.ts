/**
 * Detección de capacidades de plataforma (Tarea 21.1, requisitos 31.3, 31.4,
 * 31.7).
 *
 * Al iniciar la Aplicación se comprueban las capacidades que una Partida
 * necesita: instalación como PWA, Almacenamiento local (IndexedDB), Modo sin
 * conexión (service worker + Cache API) e interacción táctil de un solo puntero
 * (requisito 31.3). Si falta una capacidad OBLIGATORIA, la Interfaz debe
 * identificar la carencia ANTES de iniciar una Partida (requisito 31.4): el
 * informe marca el inicio como bloqueado y aporta la clave de mensaje `es-ES`.
 *
 * Excepción de exportación (requisito 31.7): si el Navegador puede LEER el
 * Almacenamiento local pero no puede ejecutar otra capacidad obligatoria, la
 * exportación de los datos ya almacenados PERMANECE disponible. Por eso el
 * informe distingue la legibilidad de IndexedDB de su disponibilidad plena.
 *
 * FRONTERA DE CAPAS: este módulo vive en `adapters/browser/`. Es el único punto
 * que inspecciona `window`/`navigator`; no lo hace leyendo globals de forma
 * implícita, sino a través de la superficie {@link PlatformSurface} INYECTADA
 * por constructor, de modo que las pruebas usen una superficie falsa sin
 * depender de `globalThis`. El detector no importa dominio, DOM directo, red ni
 * reloj: solo describe lo que la superficie inyectada expone.
 */

/** Identificadores canónicos de las capacidades comprobadas. */
export type CapabilityId =
  | "installability"
  | "indexeddb"
  | "offline"
  | "touch";

/** Resultado de comprobar una capacidad concreta. */
export type CapabilityCheck = Readonly<{
  /** Capacidad comprobada. */
  id: CapabilityId;
  /** ¿Está presente en el Entorno observado? */
  present: boolean;
  /**
   * ¿Es obligatoria para iniciar una Partida? Una capacidad obligatoria ausente
   * bloquea el inicio (requisito 31.4).
   */
  mandatory: boolean;
  /**
   * Clave de mensaje `es-ES` que describe la capacidad. La Interfaz la resuelve
   * contra el catálogo (`ui/locale`); el adaptador no incrusta texto de idioma.
   */
  messageKey: string;
}>;

/**
 * Informe estructurado de la detección de capacidades. Es inmutable y sirve a
 * la Interfaz para decidir si puede iniciarse una Partida y qué explicar.
 */
export type CapabilityReport = Readonly<{
  /** Comprobaciones individuales, en orden estable. */
  checks: readonly CapabilityCheck[];
  /**
   * Capacidades OBLIGATORIAS ausentes. Si la lista no está vacía, el inicio de
   * una Partida queda bloqueado (requisito 31.4).
   */
  missingMandatory: readonly CapabilityId[];
  /**
   * ¿Puede iniciarse una Partida? `false` cuando falta alguna capacidad
   * obligatoria (requisito 31.4).
   */
  canStartGame: boolean;
  /**
   * ¿Permanece disponible la exportación? `true` cuando IndexedDB puede leerse,
   * incluso si otra capacidad obligatoria falta (requisito 31.7).
   */
  exportAvailable: boolean;
  /**
   * Clave de mensaje `es-ES` que explica el bloqueo cuando `canStartGame` es
   * `false`; `undefined` cuando no hay bloqueo.
   */
  blockMessageKey?: string;
}>;

/**
 * Superficie de plataforma inyectable que el detector inspecciona. Cada campo es
 * opcional para reflejar Entornos que no lo exponen; el detector nunca lee
 * `globalThis` directamente. Las pruebas construyen una superficie falsa.
 */
export type PlatformSurface = Readonly<{
  /**
   * ¿Está presente la API de IndexedDB y es legible? La superficie ya resuelve
   * la legibilidad efectiva (p. ej. tras intentar abrir la base): el detector no
   * abre bases de datos, solo interpreta el hecho observado.
   */
  indexedDbReadable?: boolean;
  /** ¿Existe `navigator.serviceWorker`? (Modo sin conexión). */
  serviceWorkerSupported?: boolean;
  /** ¿Existe la Cache API (`window.caches`)? (Modo sin conexión). */
  cacheApiSupported?: boolean;
  /**
   * ¿Es instalable como PWA? La superficie resuelve el criterio del Entorno
   * (p. ej. modo standalone o disponibilidad de `beforeinstallprompt`).
   */
  installable?: boolean;
  /** Número máximo de puntos de contacto simultáneos (`navigator.maxTouchPoints`). */
  maxTouchPoints?: number;
  /** ¿Coincide una media query de puntero grueso (`(pointer: coarse)`)? */
  coarsePointer?: boolean;
}>;

/** Clave de mensaje `es-ES` por capacidad (resuelta por la Interfaz). */
const CAPABILITY_MESSAGE_KEY: Readonly<Record<CapabilityId, string>> = Object.freeze({
  installability: "ui.capability.installability",
  indexeddb: "ui.capability.indexeddb",
  offline: "ui.capability.offline",
  touch: "ui.capability.touch",
});

/**
 * ¿La superficie ofrece Modo sin conexión? Requiere service worker Y Cache API,
 * porque el Paquete sin conexión se sirve desde cachés controladas por el SW.
 */
function isOfflineCapable(surface: PlatformSurface): boolean {
  return surface.serviceWorkerSupported === true && surface.cacheApiSupported === true;
}

/**
 * ¿La superficie ofrece interacción táctil de un solo puntero? Basta con detectar
 * al menos un punto de contacto o un puntero grueso (requisito 31.3).
 */
function isTouchCapable(surface: PlatformSurface): boolean {
  const points = surface.maxTouchPoints ?? 0;
  return points >= 1 || surface.coarsePointer === true;
}

/**
 * Detector de capacidades. Recibe la {@link PlatformSurface} por constructor
 * (inyección) para ser puro y comprobable: dos superficies iguales producen el
 * mismo informe. Todas las capacidades comprobadas son OBLIGATORIAS según el
 * diseño (§8): instalación, IndexedDB, Modo sin conexión y tacto.
 */
export class CapabilityDetector {
  private readonly surface: PlatformSurface;

  public constructor(surface: PlatformSurface) {
    this.surface = surface;
  }

  /**
   * Comprueba todas las capacidades y produce un {@link CapabilityReport}
   * inmutable. El orden de las comprobaciones es estable
   * (instalación → IndexedDB → Modo sin conexión → tacto).
   */
  public detect(): CapabilityReport {
    const indexedDbReadable = this.surface.indexedDbReadable === true;

    const checks: readonly CapabilityCheck[] = Object.freeze([
      this.check("installability", this.surface.installable === true),
      this.check("indexeddb", indexedDbReadable),
      this.check("offline", isOfflineCapable(this.surface)),
      this.check("touch", isTouchCapable(this.surface)),
    ]);

    const missingMandatory: readonly CapabilityId[] = Object.freeze(
      checks.filter((c) => c.mandatory && !c.present).map((c) => c.id),
    );

    const canStartGame = missingMandatory.length === 0;

    const base: {
      checks: readonly CapabilityCheck[];
      missingMandatory: readonly CapabilityId[];
      canStartGame: boolean;
      exportAvailable: boolean;
      blockMessageKey?: string;
    } = {
      checks,
      missingMandatory,
      canStartGame,
      // Requisito 31.7: si IndexedDB puede leerse, la exportación permanece
      // disponible aunque falte otra capacidad obligatoria.
      exportAvailable: indexedDbReadable,
    };

    if (!canStartGame) {
      base.blockMessageKey = "ui.capability.blocked";
    }

    return Object.freeze(base);
  }

  /** Construye una comprobación individual; todas son obligatorias (diseño §8). */
  private check(id: CapabilityId, present: boolean): CapabilityCheck {
    return Object.freeze({
      id,
      present,
      mandatory: true,
      messageKey: CAPABILITY_MESSAGE_KEY[id],
    });
  }
}

/**
 * Construye una {@link PlatformSurface} a partir de `window`/`navigator` reales.
 * Es el ÚNICO punto que lee esos globals; se aísla aquí para que el detector
 * permanezca puro y las pruebas no dependan del Entorno. No abre IndexedDB:
 * comprueba solo la presencia de la API (legibilidad efectiva). Un Entorno sin
 * `window` (p. ej. pruebas de nodo puro) produce una superficie sin capacidades.
 */
export function surfaceFromEnvironment(env: {
  readonly window?: unknown;
  readonly navigator?: unknown;
}): PlatformSurface {
  const win = env.window as
    | {
        indexedDB?: unknown;
        caches?: unknown;
        matchMedia?: (query: string) => { matches?: boolean };
      }
    | undefined;
  const nav = env.navigator as
    | {
        serviceWorker?: unknown;
        maxTouchPoints?: number;
        standalone?: boolean;
      }
    | undefined;

  const coarsePointer =
    typeof win?.matchMedia === "function"
      ? win.matchMedia("(pointer: coarse)").matches === true
      : false;

  const displayModeStandalone =
    typeof win?.matchMedia === "function"
      ? win.matchMedia("(display-mode: standalone)").matches === true
      : false;

  return Object.freeze({
    indexedDbReadable: win?.indexedDB !== undefined && win.indexedDB !== null,
    serviceWorkerSupported: nav?.serviceWorker !== undefined && nav.serviceWorker !== null,
    cacheApiSupported: win?.caches !== undefined && win.caches !== null,
    installable: displayModeStandalone || nav?.standalone === true,
    maxTouchPoints: typeof nav?.maxTouchPoints === "number" ? nav.maxTouchPoints : 0,
    coarsePointer,
  });
}
