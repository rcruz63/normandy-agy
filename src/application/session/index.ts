/**
 * Cableado final de la sesión de juego (Tarea 27.1).
 *
 * Punto de entrada del composition root que conecta la Interfaz, la capa de
 * aplicación (unidad de trabajo y Coordinador de Tiradas), el Motor puro, las
 * Invariantes, la persistencia IndexedDB y las proyecciones `es-ES`, respetando
 * las fronteras del diseño: ningún valor lúdico vive en la Interfaz ni en ramas
 * ad hoc, la modalidad de entrada nunca llega al Motor y el contenido no
 * publicable permanece bloqueado extremo a extremo.
 */
export { GameSession } from "./game-session.js";
export type {
  GameSessionDeps,
  PublishableMissions,
  SessionStartup,
  SnapshotProjection,
  RollResolutionResult,
  SubmitIntentResult,
} from "./game-session.js";
