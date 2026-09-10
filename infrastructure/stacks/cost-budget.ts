/**
 * Zero spend budget y Avisos de franquicia incluidos
 * (Tarea 24.2, requisitos 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8).
 *
 * El diseño (§Despliegue y §Evidencia de despliegue) permite como única
 * observabilidad de coste/consumo:
 *
 * - los Avisos de franquicia incluidos en el Plan Gratuito CloudFront al 50 %,
 *   80 % y 100 % de la Franquicia del plan (requisitos 29.2-29.4), y
 * - un Zero spend budget de AWS Budgets que notifica por correo verificable
 *   cuando el gasto supera los límites gratuitos (requisitos 29.5, 29.6),
 *
 * sin métricas adicionales, consultas, almacenamiento de registros ni canales
 * de entrega no incluidos sin coste (requisitos 29.7, 29.8). Las notificaciones
 * son informativas y NO constituyen un límite duro ni una garantía de corte.
 *
 * Este módulo DECLARA esas alertas como estructuras inmutables para que las
 * pruebas de IaC (Tarea 24.3) puedan afirmarlas y el preflight (Tarea 25) pueda
 * comprobarlas. No despliega ni envía correos.
 *
 * FRONTERA DE CAPAS: pertenece a `infrastructure/` (código de despliegue). La
 * PWA NUNCA lo importa y no contiene secretos.
 */

/** Tipo de recurso CloudFormation del presupuesto de AWS Budgets. */
export const BUDGET_RESOURCE_TYPE = "AWS::Budgets::Budget" as const;

/** Umbrales de los Avisos de franquicia incluidos, en porcentaje. */
export const FRANCHISE_NOTICE_THRESHOLDS = Object.freeze([
  50, 80, 100,
] as const);

/** Umbral individual admitido para un Aviso de franquicia. */
export type FranchiseNoticeThreshold =
  (typeof FRANCHISE_NOTICE_THRESHOLDS)[number];

/**
 * Aviso de franquicia incluido en el Plan Gratuito CloudFront. Es informativo,
 * no un límite duro (requisitos 29.2-29.4, 29.9).
 */
export type FranchiseNotice = Readonly<{
  /** Porcentaje de la Franquicia del plan que dispara el aviso. */
  thresholdPercent: FranchiseNoticeThreshold;
  /** Correo verificable destinatario del aviso (requisito 29.1). */
  recipientEmail: string;
  /** Los avisos son informativos, nunca un límite duro (requisito 29.9). */
  informationalOnly: true;
}>;

/**
 * Zero spend budget: notifica por correo verificable cuando el gasto supera los
 * límites gratuitos aplicables (requisitos 29.5, 29.6). Presupuesto de coste de
 * 0 USD; la notificación es informativa, no un corte.
 */
export type ZeroSpendBudget = Readonly<{
  resourceType: typeof BUDGET_RESOURCE_TYPE;
  /** Tipo de presupuesto de coste. */
  budgetType: "COST";
  /** Límite de gasto comprometido, en USD (siempre 0). */
  limitAmountUsd: 0;
  /** Correo verificable destinatario de la notificación (requisito 29.5). */
  recipientEmail: string;
  /**
   * La notificación se dispara cuando el gasto REAL supera el límite gratuito
   * (umbral > 0 %). Base para el `AWS::Budgets::Budget` `Notification`.
   */
  notifyWhenActualExceedsPercent: number;
  /** La alerta es informativa, no un corte de servicio (requisito 29.9). */
  informationalOnly: true;
}>;

/**
 * Declaración de monitorización de coste cero: Zero spend budget + Avisos de
 * franquicia al 50/80/100 %, ambos con destinatario de correo verificable.
 */
export type CostMonitoringDeclaration = Readonly<{
  zeroSpendBudget: ZeroSpendBudget;
  franchiseNotices: readonly FranchiseNotice[];
}>;

/** Error lanzado cuando el correo del destinatario no es verificable/válido. */
export class CostMonitoringConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CostMonitoringConfigError";
  }
}

/**
 * Comprobación mínima de forma de un correo electrónico. No verifica la
 * titularidad (eso lo confirma AWS/el destinatario), solo que sea un valor no
 * vacío con forma `local@dominio.tld` para evitar destinatarios ausentes.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Construye la declaración de monitorización de coste cero para un correo
 * verificable dado. Valida que haya un destinatario con forma de correo antes
 * de declarar el presupuesto y los avisos (requisitos 29.1, 29.5).
 *
 * @param recipientEmail Correo verificable para avisos y presupuesto.
 * @returns Declaración inmutable de Zero spend budget y Avisos de franquicia.
 * @throws {CostMonitoringConfigError} Si el correo no tiene forma válida.
 */
export function createCostMonitoringDeclaration(
  recipientEmail: string,
): CostMonitoringDeclaration {
  const email = recipientEmail.trim();
  if (!isPlausibleEmail(email)) {
    throw new CostMonitoringConfigError(
      "El Zero spend budget y los Avisos de franquicia requieren un correo " +
        "electrónico verificable con forma válida (requisitos 29.1, 29.5).",
    );
  }

  const zeroSpendBudget: ZeroSpendBudget = Object.freeze({
    resourceType: BUDGET_RESOURCE_TYPE,
    budgetType: "COST",
    limitAmountUsd: 0,
    recipientEmail: email,
    // Cualquier gasto real por encima del límite gratuito de 0 USD dispara la
    // notificación informativa (requisito 29.6).
    notifyWhenActualExceedsPercent: 0,
    informationalOnly: true,
  });

  const franchiseNotices: readonly FranchiseNotice[] = Object.freeze(
    FRANCHISE_NOTICE_THRESHOLDS.map((thresholdPercent) =>
      Object.freeze({
        thresholdPercent,
        recipientEmail: email,
        informationalOnly: true as const,
      }),
    ),
  );

  return Object.freeze({
    zeroSpendBudget,
    franchiseNotices,
  });
}
