#!/usr/bin/env node
/**
 * Punto de entrada de síntesis CDK del alojamiento seguro (Tarea 24.1).
 *
 * Ensambla la `App` de CDK y el {@link HostingStack}. Renderiza la CloudFront
 * Function `viewer-request` del Control de acceso (Tarea 23.1) a partir de una
 * credencial EFÍMERA y una sal recibidas por variables de entorno del proceso
 * de despliegue; ni la credencial ni la sal se persisten y solo se usan para
 * derivar material verificador NO recuperable (reqs 26.x). El puntero de la
 * versión publicada llega por variable/contexto (27.8/27.12).
 *
 * Este archivo NO despliega: `cdk synth`/`cdk deploy` los ejecuta el pipeline
 * (Tarea 25). Sin las variables requeridas, la síntesis se detiene con un error
 * claro en vez de emitir infraestructura incompleta.
 *
 * FRONTERA DE CAPAS: módulo de `infrastructure/` (despliegue). La PWA no lo
 * importa. No escribe la credencial en artefactos: solo material derivado.
 */
import { App } from "aws-cdk-lib";

import { AccessVerifierRenderer } from "./access/index.js";
import { HostingStack } from "./stacks/index.js";

/** Lee una variable de entorno obligatoria o detiene la síntesis. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno obligatoria «${name}» para la síntesis de despliegue.`,
    );
  }
  return value;
}

function main(): void {
  const app = new App();

  // Credencial y sal EFÍMERAS del proceso de despliegue (no se persisten).
  const username = requireEnv("FON_ACCESS_USERNAME");
  const key = requireEnv("FON_ACCESS_KEY");
  const salt = requireEnv("FON_ACCESS_SALT");
  const publishedVersion = requireEnv("FON_PUBLISHED_VERSION");

  const renderer = new AccessVerifierRenderer(salt);
  const accessFunction = renderer.render({ username, key });

  new HostingStack(app, "FieldsOfNormandyHosting", {
    accessFunction,
    publishedVersion,
    // Cuenta/región resueltas por el pipeline (variables estándar de CDK).
    env: {
      account: process.env["CDK_DEFAULT_ACCOUNT"],
      region: process.env["CDK_DEFAULT_REGION"],
    },
  });

  app.synth();
}

main();
