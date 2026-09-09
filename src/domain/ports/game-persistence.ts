/**
 * Modelos de dominio de persistencia de Partidas (Tarea 15.2).
 *
 * La Tarea 1 fijó las FIRMAS de `GameRepository`/`GameUnitOfWork` con tipos
 * opacos (marcadores) en `placeholders.ts`. La Tarea 15.2 SUSTITUYE esos
 * marcadores por los modelos reales que atraviesan la frontera puerto↔capa de
 * aplicación:
 *
 * - {@link Diagnostic}: explicación estructurada `es-ES` de un rechazo, bloqueo
 *   o Invariante rota (reutiliza `messageKey`, nunca texto interpolado).
 * - {@link PersistableTransition}: lo que la unidad de trabajo entrega al
 *   repositorio para confirmar en UNA sola transacción (control de concurrencia
 *   optimista mediante `expectedSnapshotId`, Instantánea resultante y modo).
 * - {@link CommitReceipt}: acuse de un commit confirmado (nuevo `snapshotId` y
 *   puntero `latestSnapshotId`).
 * - {@link GameSummary}: resumen proyectable de una Partida para listados.
 * - {@link CommandOutcome}: desenlace de `execute` de la unidad de trabajo.
 *
 * FRONTERA DE CAPAS Y PUREZA: este módulo vive en `domain/` y es PURO. No
 * importa DOM, IndexedDB, red, reloj ni SDK de AWS; no usa `Math.random` ni
 * `Date`. Reutiliza los modelos REALES del Motor (`engine/state.ts`,
 * `engine/transition.ts`) y de invariantes en lugar de duplicarlos: el
 * `GameSnapshot` de este puerto es EXACTAMENTE el de `engine/state.ts`.
 */
import type { GameId, MissionId, SnapshotId } from "../identity/index.js";
import type { GameOutcome, GameSnapshot } from "../engine/state.js";
import type {
  DomainMessage,
  TransitionMode,
} from "../engine/transition.js";
import type { InvariantViolation } from "../invariants/invariant-validator.js";

/**
 * Diagnóstico estructurado `es-ES` de un desenlace no confirmable o de una
 * anomalía de persistencia.
 *
 * `category` clasifica el origen para que la UI (Tarea 20) y la cuarentena de
 * alto nivel (Tarea 15.4) decidan sin analizar cadenas. `message` transporta la
 * clave `es-ES` y sus parámetros; `violations` acompaña los diagnósticos de
 * Invariante.
 */
export type DiagnosticCategory =
  | "rejected"
  | "blocked"
  | "invalid-proposal"
  | "stale-expected-snapshot"
  | "persistence-failure"
  | "corrupt-snapshot";

export type Diagnostic = Readonly<{
  category: DiagnosticCategory;
  message: DomainMessage;
  violations?: readonly InvariantViolation[];
}>;

/**
 * Transición lista para persistir que la unidad de trabajo entrega al
 * repositorio.
 *
 * `expectedSnapshotId` es el identificador de la última Instantánea confirmada
 * sobre la que se calculó la propuesta (control de concurrencia optimista): el
 * repositorio confirma solo si sigue siendo la última. `next` es la Instantánea
 * resultante íntegra (estado, ambos registros y Estado aleatorio); `mode`
 * distingue transición completa de detención tras Consumo.
 */
export type PersistableTransition = Readonly<{
  gameId: GameId;
  expectedSnapshotId: SnapshotId;
  next: GameSnapshot;
  mode: TransitionMode;
}>;

/**
 * Acuse de un commit confirmado. `snapshotId` es la nueva Instantánea; coincide
 * con `latestSnapshotId`, el puntero que el resumen de la Partida deja apuntando
 * a ella.
 */
export type CommitReceipt = Readonly<{
  gameId: GameId;
  snapshotId: SnapshotId;
  latestSnapshotId: SnapshotId;
  previousSnapshotId?: SnapshotId;
}>;

/**
 * Resumen proyectable de una Partida para listados de selección/reanudación.
 * Deriva de la última Instantánea confirmada; no contiene estado de vista.
 */
export type GameSummary = Readonly<{
  gameId: GameId;
  missionId: MissionId;
  latestSnapshotId: SnapshotId;
  confirmedAt: string;
  turn: number;
  outcome: GameOutcome;
}>;

/**
 * Desenlace de `GameUnitOfWork.execute`.
 *
 * - `committed`: la transición se confirmó atómicamente; incluye el acuse y la
 *   Instantánea confirmada que la UI debe proyectar.
 * - `rejected`: el Motor rechazó el comando (no permitido por estado/secuencia);
 *   sin evaluar azar; se conserva la última confirmada.
 * - `blocked`: bloqueo por dato/prioridad/decisión pendiente (DP); sin azar; se
 *   conserva la última confirmada.
 * - `invalid`: la propuesta rompió una Invariante antes de confirmar; NO se
 *   confirma; se conserva la última confirmada.
 * - `stale`: `expectedSnapshotId` obsoleto (concurrencia optimista); se rechaza
 *   SIN evaluar reglas ni consumir aleatoriedad; se conserva la última
 *   confirmada.
 *
 * - `failed`: el commit transaccional falló/abortó; IndexedDB revirtió todos
 *   los cambios (nada a medias) y la UI conserva la última confirmada; la capa
 *   superior puede reintentar o exportar (requisito 7.8, 21.10).
 *
 * Toda rama distinta de `committed` devuelve la última Instantánea confirmada
 * (`current`) para que la UI la siga proyectando (requisito 7.8, 21.4).
 */
export type CommandOutcome =
  | Readonly<{ kind: "committed"; receipt: CommitReceipt; snapshot: GameSnapshot }>
  | Readonly<{ kind: "rejected"; diagnostic: Diagnostic; current: GameSnapshot }>
  | Readonly<{ kind: "blocked"; diagnostic: Diagnostic; current: GameSnapshot }>
  | Readonly<{ kind: "invalid"; diagnostic: Diagnostic; current: GameSnapshot }>
  | Readonly<{ kind: "stale"; diagnostic: Diagnostic; current: GameSnapshot }>
  | Readonly<{ kind: "failed"; diagnostic: Diagnostic; current: GameSnapshot }>;
