/**
 * Punto de entrada de las declaraciones de infraestructura de despliegue.
 *
 * Compone el alojamiento seguro (Tarea 24.1) y las declaraciones de coste cero
 * (Tarea 24.2): Plan Gratuito CloudFront con WAF incluido, Zero spend budget
 * con Avisos de franquicia y denylist de recursos excluidos. Módulo de
 * `infrastructure/`: la PWA no lo importa y no contiene secretos.
 */
export { HostingStack } from "./hosting-stack.js";
export type { HostingStackProps } from "./hosting-stack.js";

export * from "./cost-index.js";
