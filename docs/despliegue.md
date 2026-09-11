# Despliegue

Cómo se aloja la PWA en AWS, qué requisitos tiene y qué falta antes de poder
desplegar de verdad.

## Índice

- [Estado actual](#estado-actual)
- [Arquitectura de alojamiento](#arquitectura-de-alojamiento)
- [Requisitos previos](#requisitos-previos)
- [Cuenta y credenciales](#cuenta-y-credenciales)
- [Lo que falta antes de desplegar](#lo-que-falta-antes-de-desplegar)
- [Pasos de despliegue (objetivo)](#pasos-de-despliegue-objetivo)
- [Bloqueo de producción y coste cero](#bloqueo-de-produccion-y-coste-cero)
- [Reversión](#reversion)

## Estado actual

El proyecto **no está desplegado**. No existe el stack en la cuenta y no se ha
sintetizado infraestructura (`cdk.out` no existe). Por eso nunca se pidieron
credenciales de despliegue.

La infraestructura está escrita como código (AWS CDK) y su `typecheck` pasa,
pero todavía **no se puede ejecutar `cdk synth`/`cdk deploy`** sin los ajustes
descritos en [Lo que falta antes de desplegar](#lo-que-falta-antes-de-desplegar).

## Arquitectura de alojamiento

Definida en `infrastructure/` (ver [`arquitectura.md`](arquitectura.md) para el
detalle por archivo).

- **S3 privado (origen).** Bucket con acceso público bloqueado, sin ACL, cifrado
  gestionado por S3 (nunca KMS), versionado para poder revertir. Nada de este
  stack borra versiones anteriores.
- **CloudFront (distribución).** Solo HTTPS, con el dominio asignado
  `*.cloudfront.net` (sin dominio propio ni Route 53/ACM). Lee del bucket
  mediante Origin Access Control (OAC).
- **Control de acceso.** Una CloudFront Function en `viewer-request` valida
  HTTP Basic antes de tocar el origen. El material verificador se inyecta en
  despliegue; la credencial no se guarda en el repo, S3 ni el bundle.
- **Coste cero.** Plan CloudFront FREE declarado, Zero spend budget por correo y
  avisos de franquicia. Un bloqueo de producción impide desplegar sin evidencia
  de coste 0 € verificada.

Stack principal: `FieldsOfNormandyHosting` (`infrastructure/stacks/hosting-stack.ts`),
ensamblado en `infrastructure/app.ts`.

## Requisitos previos

- **Node.js ≥ 20** (el repo usa Node 24 en desarrollo).
- **AWS CDK CLI.** No está instalado como dependencia del proyecto; instálalo
  con `npm i -D aws-cdk` o de forma global (`npm i -g aws-cdk`).
- **Credenciales de la cuenta personal** (perfil `casa`, ver abajo).
- **Bootstrap de CDK** en la cuenta/región de destino (`cdk bootstrap`) la
  primera vez.

## Cuenta y credenciales

Este proyecto usa **siempre** el perfil AWS `casa` (cuenta personal). La cuenta
personal está verificada: `233934538296`, usuario `RauldelaCruz`.

```bash
AWS_PROFILE=casa aws sts get-caller-identity
```

No usar credenciales profesionales. Si el token de `casa` no funciona,
actualízalo; el proyecto no hace fallback a otro perfil.

La síntesis exige estas variables de entorno efímeras (no se persisten; solo
derivan material verificador no recuperable para el control de acceso):

| Variable | Uso |
|---|---|
| `FON_ACCESS_USERNAME` | Usuario de HTTP Basic |
| `FON_ACCESS_KEY` | Clave de alta entropía de HTTP Basic |
| `FON_ACCESS_SALT` | Sal para derivar el verificador |
| `FON_PUBLISHED_VERSION` | Identificador inmutable de la versión publicada |
| `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` | Cuenta y región de destino |

## Lo que falta antes de desplegar

Dos bloqueos reales, en orden:

1. **No hay artefacto web que subir.** `HostingStack` publica recursos estáticos
   versionados en S3 y sirve `index.html`, pero el repositorio no genera ese
   sitio: no hay `index.html`, ni bundler (Vite/esbuild/webpack), ni manifiesto
   PWA, ni registro del service worker. La UI existe como módulos TypeScript en
   `src/ui`, sin empaquetar. Hay que añadir el empaquetado web antes de que el
   despliegue tenga contenido que servir. Ver [`estado.md`](estado.md).

2. **La ejecución de CDK necesita ajuste de arranque.** `cdk.json` invoca
   `node --experimental-strip-types infrastructure/app.ts`, pero los `import`
   usan extensión `.js` (correcta al compilar a ESM). Node no resuelve esos
   `.js` al ejecutar los `.ts` directamente, así que la síntesis falla con
   `Cannot find module .../index.js`. Opciones:
   - Compilar la infraestructura a JS y apuntar `cdk.json` al `.js` compilado.
   - Ejecutar con un loader TS (p. ej. `tsx`) que resuelva las extensiones.
   - Ajustar la resolución de módulos para que los `.js` de los imports mapeen a
     los `.ts` de origen.

   El `typecheck:infra` compila correctamente, así que el código de infra es
   válido: el problema es solo cómo se arranca.

## Pasos de despliegue (objetivo)

Estos son los pasos previstos una vez resueltos los dos bloqueos anteriores. El
despliegue lo orquesta el pipeline por fases (`infrastructure/pipeline/`), no un
`cdk deploy` manual a producción.

```bash
# 1. Instalar dependencias y el CLI de CDK
npm install
npm i -D aws-cdk

# 2. Bootstrap (solo la primera vez en la cuenta/región)
AWS_PROFILE=casa npx cdk bootstrap

# 3. Construir el artefacto web (PENDIENTE: no existe todavía el empaquetado)
#    npm run build:web   → genera el sitio estático servible

# 4. Sintetizar la infraestructura con las variables de acceso
AWS_PROFILE=casa \
FON_ACCESS_USERNAME=... \
FON_ACCESS_KEY=... \
FON_ACCESS_SALT=... \
FON_PUBLISHED_VERSION=... \
  npx cdk synth

# 5. Desplegar por el pipeline (fail-closed). Solo la fase `promote`
#    crea/actualiza producción, y solo con evidencia de coste cero de la misma
#    ejecución.
```

El pipeline ejecuta estas fases en orden; una fase fallida impide las
siguientes:

`build-content` → `test` → `synth` → `preflight` → `deploy-staging` →
`verify-staging` → `promote`

## Bloqueo de producción y coste cero

El coste autorizado es **0 €**. La fase `preflight` genera una evidencia de
producción (`infrastructure/evidence/`, `infrastructure/preflight/`) que solo
permite promover si:

- Cada categoría de operación S3 y el 100 % del almacenamiento están cubiertos a
  coste 0 € con evidencia **vigente** y elegibilidad de cuenta comprobada.
- Todas las comprobaciones de seguridad pasan (S3 privado, OAC, solo HTTPS,
  permisos mínimos, recursos excluidos ausentes, acceso sin exponer secretos).

Regla clave: cualquier comprobación en estado `unknown` equivale a `fail`. Un
aviso de franquicia o el Zero spend budget **no** cuentan como prueba de coste;
son informativos y no cambian un `deny` a `allow`.

## Reversión

El bucket conserva versiones y el despliegue cambia un puntero de versión
publicada solo tras validar. Ante fallo, la última versión válida y sus objetos
permanecen disponibles. Ninguna operación del stack borra versiones anteriores
ni toca las partidas locales del dispositivo.
