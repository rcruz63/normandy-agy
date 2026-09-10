/**
 * `HostingStack`: stack CDK del alojamiento seguro de la PWA (Tarea 24.1,
 * requisitos 27.1–27.8 y 27.12, diseño §«Despliegue»).
 *
 * Declara, de forma puramente declarativa (sin desplegar), la infraestructura
 * mínima aprobada por el diseño:
 *
 * - Origen privado S3 Standard con acceso público BLOQUEADO y propiedad de
 *   objetos SIN ACL (27.3); cifrado administrado por S3 (nunca KMS) y versionado
 *   de objetos para conservar versiones retirables (27.8/27.12).
 * - Distribución CloudFront servida EXCLUSIVAMENTE por HTTPS (27.1), usando solo
 *   el Dominio CloudFront asignado `*.cloudfront.net` SIN alias ni dominio propio
 *   (27.2). No hay Route 53, ACM ni alias configurados.
 * - Origin Access Control (OAC) para que la distribución aprobada lea del origen
 *   (27.4) y política de bucket LIMITADA a esa distribución/OAC que rechaza el
 *   acceso directo no autorizado (27.5).
 * - CloudFront Function asociada al evento `viewer-request` (Control de acceso),
 *   cuyo código se inyecta desde {@link AccessVerifierRenderer} (Tarea 23.1).
 * - Roles SEPARADOS: uno de síntesis/despliegue (administra los artefactos y la
 *   publicación) y otro de lectura del origen para la distribución, cada uno con
 *   acciones y recursos MÍNIMOS (27.6, 27.7).
 *
 * Versionado y reversión (27.8/27.12): los Recursos estáticos se publican con
 * claves de objeto inmutables con hash de contenido y el bucket conserva
 * versiones; el despliegue sube primero una versión completa, valida y solo
 * después cambia el puntero publicado (parámetro `publishedVersion`). Ante fallo
 * de publicación, los objetos y el puntero de la última versión válida
 * permanecen disponibles: nada de este stack borra versiones anteriores.
 *
 * EXCLUSIONES (diseño §«Despliegue», reqs 28/29): este stack NO introduce KMS,
 * Lambda@Edge, DNSSEC, dominios registrados/Route 53, ni logs facturables de
 * CloudFront. El plan CloudFront FREE, el presupuesto y las alertas se declaran
 * en el stack de la Tarea 24.2, fuera de este archivo.
 *
 * FRONTERA DE CAPAS: módulo de `infrastructure/` (despliegue). La PWA no lo
 * importa. No contiene secretos: el material verificador incrustado en la
 * función es versionado y no recuperable.
 */
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

import type { RenderedAccessFunction } from "../access/index.js";

/**
 * Propiedades del `HostingStack`. El código de la función `viewer-request` se
 * inyecta ya renderizado por {@link AccessVerifierRenderer.render} durante el
 * despliegue (solo material verificador no recuperable, sin credencial).
 */
export type HostingStackProps = Readonly<
  StackProps & {
    /**
     * Función `viewer-request` ya renderizada (Tarea 23.1). Se usa su `code`
     * (runtime 2.0) para asociarla al Control de acceso de la distribución.
     */
    accessFunction: RenderedAccessFunction;
    /**
     * Identificador inmutable de la versión publicada (p. ej. hash de
     * contenido). Selecciona el «puntero publicado» del prefijo de origen; al
     * cambiarlo se publica otra versión sin borrar la anterior (27.8/27.12).
     */
    publishedVersion: string;
    /**
     * Cabecera de índice por defecto servida por CloudFront. No expone alias ni
     * dominio propio: la distribución conserva el Dominio CloudFront asignado.
     */
    readonly defaultRootObject?: string;
  }
>;

/**
 * Comentario de la CloudFront Function del Control de acceso (no sensible).
 */
const ACCESS_FUNCTION_COMMENT =
  "Control de acceso HTTP Basic en viewer-request (Tarea 23.1)." as const;

/**
 * Duración de caché inmutable para Recursos estáticos con hash de contenido.
 * Un año permite reutilización desde Caché sin invalidaciones (28.8) mientras
 * el puntero de versión gobierna la publicación.
 */
const IMMUTABLE_MAX_AGE = Duration.days(365);

export class HostingStack extends Stack {
  /** Origen privado S3 Standard (acceso público bloqueado, sin ACL). */
  public readonly originBucket: s3.Bucket;

  /** Distribución CloudFront solo HTTPS con Dominio `*.cloudfront.net`. */
  public readonly distribution: cloudfront.Distribution;

  /** Rol de síntesis/despliegue: administra artefactos y publica versiones. */
  public readonly deploymentRole: iam.Role;

  /** Rol de lectura del origen para la distribución (mínimo privilegio). */
  public readonly originReadRole: iam.Role;

  public constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    this.originBucket = this.createOriginBucket();
    const accessFunctionResource = this.createAccessFunction(
      props.accessFunction,
    );
    this.distribution = this.createDistribution(
      this.originBucket,
      accessFunctionResource,
      props.defaultRootObject ?? "index.html",
    );
    this.deploymentRole = this.createDeploymentRole(
      this.originBucket,
      props.publishedVersion,
    );
    this.originReadRole = this.createOriginReadRole(this.originBucket);
  }

  /**
   * Crea el Origen privado S3 Standard (27.3): bloqueo público total, propiedad
   * de objetos SIN ACL, cifrado administrado por S3 (nunca KMS), transporte
   * seguro obligatorio y versionado para conservar versiones retirables
   * (27.8/27.12). No se elimina el contenido al destruir el stack.
   */
  private createOriginBucket(): s3.Bucket {
    return new s3.Bucket(this, "OriginBucket", {
      // 27.3: acceso público bloqueado en su totalidad.
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      // Propiedad de objetos sin ACL: solo la política de bucket concede acceso.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // Cifrado administrado por S3 (SSE-S3); NUNCA KMS (excluido por diseño).
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Rechaza transporte no cifrado hacia el propio origen.
      enforceSSL: true,
      // 27.8/27.12: versiones inmutables retirables sin tocar Partidas locales.
      versioned: true,
      // Conservar el bucket y sus versiones: la reversión depende de ellas.
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
  }

  /**
   * Declara la CloudFront Function `viewer-request` del Control de acceso a
   * partir del código ya renderizado (Tarea 23.1). No incluye la credencial.
   */
  private createAccessFunction(
    accessFunction: RenderedAccessFunction,
  ): cloudfront.Function {
    return new cloudfront.Function(this, "AccessViewerRequest", {
      code: cloudfront.FunctionCode.fromInline(accessFunction.code),
      // Runtime 2.0 según la función generada por AccessVerifierRenderer.
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: ACCESS_FUNCTION_COMMENT,
    });
  }

  /**
   * Crea la distribución CloudFront (27.1, 27.2, 27.4, 27.5): solo HTTPS, sin
   * alias/dominio propio (conserva `*.cloudfront.net`), origen S3 con OAC y
   * política de bucket limitada a esta distribución, y función de acceso en
   * `viewer-request`.
   */
  private createDistribution(
    bucket: s3.Bucket,
    accessFunction: cloudfront.Function,
    defaultRootObject: string,
  ): cloudfront.Distribution {
    // OAC (27.4): CloudFront firma las lecturas al origen; el L2 escribe la
    // política de bucket LIMITADA a esta distribución (27.5) automáticamente.
    const origin = origins.S3BucketOrigin.withOriginAccessControl(bucket, {
      originAccessLevels: [cloudfront.AccessLevel.READ],
    });

    return new cloudfront.Distribution(this, "Distribution", {
      // 27.2: sin `domainNames`/`certificate` → se usa el Dominio CloudFront
      // asignado `*.cloudfront.net`. No hay Route 53 ni ACM.
      defaultRootObject,
      // Solo caché estándar HTTP/HTTPS incluida en el plan (sin extras de pago).
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin,
        // 27.1: servir exclusivamente por HTTPS (redirigir HTTP a HTTPS).
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Control de acceso HTTP Basic antes de tocar el origen.
        functionAssociations: [
          {
            function: accessFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }

  /**
   * Rol de síntesis/despliegue (27.6, 27.7): administra los artefactos de
   * origen (subir/versionar Recursos estáticos) y publicar la versión indicada.
   * Permisos MÍNIMOS acotados al bucket y a las claves de la versión; NO puede
   * leer como la distribución ni administra CloudFront desde este rol.
   */
  private createDeploymentRole(
    bucket: s3.Bucket,
    publishedVersion: string,
  ): iam.Role {
    const role = new iam.Role(this, "DeploymentRole", {
      // El pipeline de despliegue asume este rol (cuenta/servicio del pipeline).
      assumedBy: new iam.AccountRootPrincipal(),
      description:
        "Rol de despliegue: sube y versiona Recursos estáticos y publica versiones (mínimo privilegio).",
    });

    const versionPrefix = `${publishedVersion}/*`;

    // Listar/consultar el bucket para validar una versión completa antes de
    // cambiar el puntero publicado.
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "ListOriginBucket",
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket", "s3:GetBucketVersioning"],
        resources: [bucket.bucketArn],
      }),
    );

    // Escribir/versionar solo los objetos de la versión que se publica; leer las
    // versiones para validarlas. No concede borrado masivo: la reversión
    // conserva versiones anteriores (27.12).
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "WriteVersionedObjects",
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetObjectVersion",
        ],
        resources: [
          `${bucket.bucketArn}/${versionPrefix}`,
          // Puntero publicado (documento pequeño que referencia la versión).
          `${bucket.bucketArn}/published.json`,
        ],
      }),
    );

    return role;
  }

  /**
   * Rol de lectura del origen usado por la distribución (27.6, 27.7): solo
   * `s3:GetObject` sobre los objetos del bucket, separado del rol de despliegue.
   * El acceso efectivo lo ejerce CloudFront vía OAC; este rol documenta y acota
   * el mínimo privilegio de lectura de origen.
   */
  private createOriginReadRole(bucket: s3.Bucket): iam.Role {
    const role = new iam.Role(this, "OriginReadRole", {
      assumedBy: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
      description:
        "Rol de lectura del origen para la distribución (solo GetObject, mínimo privilegio).",
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadOriginObjects",
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      }),
    );

    return role;
  }

  /** Edad máxima de caché inmutable expuesta para pruebas/documentación. */
  public static get immutableMaxAge(): Duration {
    return IMMUTABLE_MAX_AGE;
  }
}
