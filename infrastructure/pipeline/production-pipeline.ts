/**
 * Orquestador determinista del pipeline por fases con promoción condicionada
 * (Tarea 25.2, requisitos 27.9, 28.12, 28.13, 29.11, diseño §11 «IaC, Bloqueo de
 * producción y observabilidad»).
 *
 * Ejecuta EN ORDEN las fases `build-content`, `test`, `synth`, `preflight`,
 * `deploy-staging`, `verify-staging` y `promote`. Reglas del diseño:
 *
 * - Fail-closed por orden: una fase anterior fallida impide todas las
 *   posteriores; `promote` solo se intenta si todas las anteriores tuvieron
 *   éxito.
 * - Solo `promote` crea o actualiza producción, y ÚNICAMENTE con un
 *   `ProductionEvidence` `allow` generado por el `preflight` de la MISMA
 *   ejecución (vínculo comprobado en `run-context.ts`).
 * - Las señales informativas (Avisos de franquicia, Zero spend budget,
 *   estimaciones, límite nominal de 5 GB) NUNCA cambian `deny` a `allow` ni
 *   autorizan la promoción: el gate no las consulta (requisito 29.11).
 *
 * Los efectos externos (construir contenido, tests, síntesis, desplegar a
 * staging, verificar staging, promover a producción) se INYECTAN como funciones
 * de efecto para que la orquestación sea determinista y verificable SIN llamar a
 * AWS ni desplegar realmente. Este módulo no despliega ni contacta AWS.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */
import type { ProductionEvidence } from "../evidence/production-evidence.js";
import {
  productionPreflight,
  type PreflightInput,
} from "../preflight/production-preflight.js";
import type { InformationalSignal } from "./informational-signals.js";
import {
  PROMOTE_PHASE_ID,
  type PipelinePhaseId,
} from "./pipeline-phases.js";
import {
  authorizesPromotion,
  type PipelineRunContext,
} from "./run-context.js";

/** Resultado atómico de ejecutar una fase de efecto (build/test/synth/deploy…). */
export type PhaseEffectResult = Readonly<{
  /** `true` si la fase terminó con éxito; `false` detiene el pipeline. */
  succeeded: boolean;
  /** Detalle en es-ES para registro/diagnóstico local. */
  detail: string;
}>;

/**
 * Efectos externos inyectables de cada fase. Se modelan como funciones puras
 * respecto a la orquestación (sus efectos reales quedan fuera). `preflight` NO
 * es un efecto inyectable: lo calcula la función pura `productionPreflight`.
 */
export type PipelineEffects = Readonly<{
  buildContent: () => PhaseEffectResult;
  test: () => PhaseEffectResult;
  synth: () => PhaseEffectResult;
  deployStaging: () => PhaseEffectResult;
  verifyStaging: () => PhaseEffectResult;
  /** Crea o actualiza producción. Solo se invoca con promoción autorizada. */
  promote: (evidence: ProductionEvidence) => PhaseEffectResult;
}>;

/** Entrada de la ejecución del pipeline: contexto, efectos, preflight y señales. */
export type PipelineRunInput = Readonly<{
  run: PipelineRunContext;
  effects: PipelineEffects;
  /** Entrada del preflight fail-closed que genera la evidencia de esta ejecución. */
  preflightInput: PreflightInput;
  /** Señales informativas de observabilidad; NO participan en el gate. */
  informationalSignals: readonly InformationalSignal[];
}>;

/** Resultado del recorrido de una fase individual dentro de la ejecución. */
export type PhaseOutcome = Readonly<{
  phase: PipelinePhaseId;
  succeeded: boolean;
  detail: string;
}>;

/** Resultado completo de una ejecución del pipeline. */
export type PipelineRunResult = Readonly<{
  /** Recorrido ordenado de las fases ejecutadas (se detiene en la primera fallida). */
  phases: readonly PhaseOutcome[];
  /** Evidencia generada por el `preflight` de esta ejecución. */
  evidence: ProductionEvidence;
  /** `true` solo si `promote` creó/actualizó producción con evidencia autorizada. */
  promoted: boolean;
}>;

/** Construye el resultado inmutable de una fase. */
function phaseOutcome(
  phase: PipelinePhaseId,
  result: PhaseEffectResult,
): PhaseOutcome {
  return Object.freeze({
    phase,
    succeeded: result.succeeded,
    detail: result.detail,
  });
}

/**
 * Ejecuta en orden las fases de efecto previas a la evidencia
 * (`build-content`, `test`, `synth`) más las de staging tras el preflight
 * (`deploy-staging`, `verify-staging`). Se detiene y devuelve en la primera fase
 * fallida (fail-closed), sin ejecutar las posteriores.
 *
 * @param sequence Pares fase/efecto en orden de ejecución.
 * @param outcomes Acumulador de resultados por fase (mutado de forma local).
 * @returns `true` si TODAS las fases de la secuencia tuvieron éxito.
 */
function runEffectSequence(
  sequence: readonly (readonly [PipelinePhaseId, () => PhaseEffectResult])[],
  outcomes: PhaseOutcome[],
): boolean {
  for (const [phase, effect] of sequence) {
    const outcome = phaseOutcome(phase, effect());
    outcomes.push(outcome);
    if (!outcome.succeeded) {
      return false;
    }
  }
  return true;
}

/**
 * Registra una fase omitida (no ejecutada) por un fallo anterior, conservando el
 * fail-closed: la fase consta como no exitosa y no ejecuta su efecto.
 */
function pushSkippedPhase(
  phase: PipelinePhaseId,
  outcomes: PhaseOutcome[],
  reason: string,
): void {
  outcomes.push(
    Object.freeze({ phase, succeeded: false, detail: reason }),
  );
}

/**
 * Ejecuta el pipeline por fases y devuelve el resultado completo. La promoción a
 * producción solo ocurre si todas las fases previas tuvieron éxito Y el
 * `preflight` de esta misma ejecución produjo una evidencia `allow` atada a la
 * ejecución. Las señales informativas se conservan en la entrada pero no se
 * consultan en ninguna decisión de promoción.
 *
 * @param input Contexto, efectos, entrada del preflight y señales informativas.
 * @returns Recorrido por fases, evidencia generada y si hubo promoción.
 */
export function runProductionPipeline(
  input: PipelineRunInput,
): PipelineRunResult {
  const { run, effects, preflightInput } = input;
  const outcomes: PhaseOutcome[] = [];

  const preSynthOk = runEffectSequence(
    [
      ["build-content", effects.buildContent],
      ["test", effects.test],
      ["synth", effects.synth],
    ],
    outcomes,
  );

  const evidence = productionPreflight(preflightInput);
  return finalizeRun(run, effects, evidence, outcomes, preSynthOk);
}

/**
 * Completa la ejecución tras la síntesis: registra el `preflight`, ejecuta
 * staging y decide la promoción condicionada. Se extrae de `runProductionPipeline`
 * para mantener cada función por debajo del umbral de líneas y con como máximo
 * dos niveles de indentación.
 */
function finalizeRun(
  run: PipelineRunContext,
  effects: PipelineEffects,
  evidence: ProductionEvidence,
  outcomes: PhaseOutcome[],
  preSynthOk: boolean,
): PipelineRunResult {
  if (!preSynthOk) {
    return abortAfterFailure(evidence, outcomes, "fase anterior fallida");
  }

  outcomes.push(
    Object.freeze({
      phase: "preflight" as PipelinePhaseId,
      succeeded: true,
      detail: `preflight concluye «${evidence.conclusion}»`,
    }),
  );

  const stagingOk = runEffectSequence(
    [
      ["deploy-staging", effects.deployStaging],
      ["verify-staging", effects.verifyStaging],
    ],
    outcomes,
  );
  if (!stagingOk) {
    return abortPromotion(evidence, outcomes, "staging no superado");
  }

  return promoteIfAuthorized(run, effects, evidence, outcomes);
}

/**
 * Decide y ejecuta la promoción: solo invoca el efecto `promote` (que crea o
 * actualiza producción) si la evidencia de esta ejecución autoriza la promoción.
 * En caso contrario, marca `promote` como no ejecutada (fail-closed).
 */
function promoteIfAuthorized(
  run: PipelineRunContext,
  effects: PipelineEffects,
  evidence: ProductionEvidence,
  outcomes: PhaseOutcome[],
): PipelineRunResult {
  if (!authorizesPromotion(run, evidence)) {
    return abortPromotion(
      evidence,
      outcomes,
      "evidencia no autoriza promoción de esta ejecución",
    );
  }

  const result = effects.promote(evidence);
  outcomes.push(phaseOutcome(PROMOTE_PHASE_ID, result));
  return Object.freeze({
    phases: Object.freeze([...outcomes]),
    evidence,
    promoted: result.succeeded,
  });
}

/**
 * Aborta por fallo previo a la síntesis: marca `preflight`, staging y `promote`
 * como omitidos para dejar el recorrido de fases completo y ordenado. Aunque el
 * veredicto del preflight se calcula (función pura sin efectos), la FASE no se
 * ejecuta cuando una fase anterior falló (fail-closed).
 */
function abortAfterFailure(
  evidence: ProductionEvidence,
  outcomes: PhaseOutcome[],
  reason: string,
): PipelineRunResult {
  pushSkippedPhase("preflight", outcomes, reason);
  pushSkippedPhase("deploy-staging", outcomes, reason);
  pushSkippedPhase("verify-staging", outcomes, reason);
  return abortPromotion(evidence, outcomes, reason);
}

/** Cierra la ejecución sin promocionar: `promote` consta omitida y `promoted` es `false`. */
function abortPromotion(
  evidence: ProductionEvidence,
  outcomes: PhaseOutcome[],
  reason: string,
): PipelineRunResult {
  pushSkippedPhase(PROMOTE_PHASE_ID, outcomes, reason);
  return Object.freeze({
    phases: Object.freeze([...outcomes]),
    evidence,
    promoted: false,
  });
}
