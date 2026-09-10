/**
 * Señales informativas de observabilidad del pipeline (Tarea 25.2, requisitos
 * 29.9, 29.10, 29.11, diseño §11).
 *
 * Modela los Avisos de franquicia (50/80/100 %), el Zero spend budget y las
 * estimaciones/límites nominales como señales EXCLUSIVAMENTE informativas. El
 * diseño es explícito: «Una estimación, el límite nominal de 5 GB, un Aviso de
 * franquicia o el Zero spend budget nunca cambian `deny` a `allow`». Por eso
 * este tipo NO expone ningún veredicto `allow`/`deny` ni participa en la puerta
 * de promoción: solo transporta información para registro y diagnóstico.
 *
 * El Bloqueo de producción es un control INDEPENDIENTE de estas señales
 * (requisito 29.11): la orquestación de `promote` ignora por completo estas
 * señales al decidir si promociona (véase `production-pipeline.ts`).
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Naturaleza de una señal informativa. Ninguna autoriza ni bloquea despliegues. */
export type InformationalSignalKind =
  | "franchise-notice"
  | "zero-spend-budget"
  | "cost-estimate"
  | "nominal-storage-limit";

/**
 * Señal informativa emitida durante la observabilidad del pipeline. Se etiqueta
 * expresamente como informativa (no es un límite duro ni una garantía de corte,
 * requisitos 29.9/29.10) y NUNCA se consulta para calcular el veredicto.
 */
export type InformationalSignal = Readonly<{
  /** Naturaleza de la señal (franquicia, budget, estimación o límite nominal). */
  kind: InformationalSignalKind;
  /** Mensaje humano en es-ES para registro/diagnóstico local. */
  message: string;
  /** Marca inequívoca de que la señal es informativa, no un control de corte. */
  informationalOnly: true;
}>;

/**
 * Construye una señal informativa inmutable. El campo `informationalOnly` queda
 * fijado a `true` para que el tipo haga imposible tratarla como un control de
 * corte o una autorización de promoción.
 *
 * @param kind Naturaleza de la señal.
 * @param message Mensaje en es-ES para registro/diagnóstico.
 * @returns Señal informativa inmutable.
 */
export function createInformationalSignal(
  kind: InformationalSignalKind,
  message: string,
): InformationalSignal {
  return Object.freeze({
    kind,
    message,
    informationalOnly: true,
  });
}
