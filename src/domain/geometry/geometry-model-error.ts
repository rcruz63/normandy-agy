/**
 * Error compartido por los constructores validadores de la geometría (Tarea 5.1).
 *
 * Vive en su propio módulo para que los submódulos de geometría (Mapa, Ficha y
 * Segunda revisión visual) compartan un único tipo de error sin crear
 * dependencias circulares entre ellos. Módulo puro de `domain/`: no importa DOM,
 * IndexedDB, red, reloj ni SDK de AWS.
 */

/** Error lanzado por los constructores de los modelos de geometría ante datos inválidos. */
export class InvalidGeometryModelError extends Error {
  public readonly field: string;
  public readonly detail: string;

  public constructor(field: string, detail: string) {
    super(`Modelo de geometría inválido en «${field}»: ${detail}.`);
    this.name = "InvalidGeometryModelError";
    this.field = field;
    this.detail = detail;
  }
}
