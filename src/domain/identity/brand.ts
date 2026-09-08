/**
 * Tipos opacos (branded types) del dominio.
 *
 * Un {@link Brand} adorna un tipo base con una marca nominal en tiempo de
 * compilación para impedir cruces accidentales entre identificadores que
 * comparten la misma representación (todos son `string`). La marca no existe en
 * tiempo de ejecución: es una propiedad fantasma.
 *
 * Diseño: los tipos de dominio son `Readonly` y se construyen mediante funciones
 * que validan invariantes. Este módulo pertenece a `domain/` y, por tanto, no
 * importa DOM, IndexedDB, red, reloj ni SDK de AWS.
 */
export type Brand<T, Name extends string> = T & { readonly __brand: Name };
