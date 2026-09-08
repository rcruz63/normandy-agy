/**
 * Punto de entrada del dominio de Fields of Normandy.
 *
 * El dominio contiene tipos inmutables (`Readonly`) y funciones puras. No
 * importa DOM, React, IndexedDB, Cache API, `Date`, `Math.random` ni SDK de
 * AWS. Reexporta la identidad opaca y los puertos.
 */
export * from "./identity/index.js";
export * from "./ports/index.js";
