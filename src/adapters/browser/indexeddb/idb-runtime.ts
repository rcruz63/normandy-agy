/**
 * Envoltorios asíncronos de bajo nivel sobre la API de IndexedDB basada en
 * eventos (Tarea 15.1). Convierten `IDBRequest`/`IDBTransaction` en promesas y
 * abren/crean la base con los seis object stores mediante un upgrade NO
 * destructivo.
 *
 * FRONTERA DE CAPAS: este módulo SÍ usa IndexedDB, por lo que vive en el
 * adaptador de navegador. La `IDBFactory` se INYECTA (constructor/parámetro),
 * de modo que las pruebas usan `fake-indexeddb` sin depender de
 * `globalThis.indexedDB`. No usa reloj ni `Math.random`.
 */
import {
  ALL_OBJECT_STORES,
  DATABASE_NAME,
  DATABASE_VERSION,
  OBJECT_STORE_KEY_PATHS,
  type ObjectStoreName,
} from "./schema.js";

/** Motivos tipados de fallo del subsistema IndexedDB. */
export type IndexedDbFailureReason =
  | "open-blocked"
  | "open-failed"
  | "request-failed"
  | "transaction-aborted"
  | "transaction-failed";

/** Error tipado del subsistema IndexedDB. Fail-fast, sin `catch` vacíos. */
export class IndexedDbError extends Error {
  public readonly reason: IndexedDbFailureReason;
  public readonly underlyingCause: unknown;

  public constructor(reason: IndexedDbFailureReason, detail: string, underlyingCause?: unknown) {
    super(`Fallo de IndexedDB (${reason}): ${detail}.`);
    this.name = "IndexedDbError";
    this.reason = reason;
    this.underlyingCause = underlyingCause;
  }
}

/**
 * Abre (o crea/actualiza) la base de datos aplicando el esquema. El upgrade es
 * NO destructivo: solo crea los object stores que aún no existen con su
 * `keyPath`; nunca borra datos existentes.
 */
export function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (): void => {
      createMissingStores(request.result);
    };
    request.onblocked = (): void => {
      reject(new IndexedDbError("open-blocked", "apertura bloqueada por otra conexión"));
    };
    request.onerror = (): void => {
      reject(new IndexedDbError("open-failed", "no se pudo abrir la base", request.error));
    };
    request.onsuccess = (): void => {
      resolve(request.result);
    };
  });
}

/** Crea los object stores ausentes con su `keyPath` canónico (idempotente). */
function createMissingStores(database: IDBDatabase): void {
  for (const storeName of ALL_OBJECT_STORES) {
    if (database.objectStoreNames.contains(storeName)) {
      continue;
    }
    const keyPath = OBJECT_STORE_KEY_PATHS[storeName];
    database.createObjectStore(storeName, { keyPath: keyPath as string | string[] });
  }
}

/** Convierte un `IDBRequest<T>` en una promesa que resuelve con su resultado. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(new IndexedDbError("request-failed", "operación de store fallida", request.error));
    };
  });
}

/**
 * Ejecuta `work` dentro de una transacción sobre los stores indicados y
 * resuelve cuando la transacción se COMPLETA (garantía de atomicidad). Si la
 * transacción aborta o falla, la promesa se rechaza con {@link IndexedDbError}
 * y IndexedDB revierte los cambios.
 */
export function runTransaction<T>(
  database: IDBDatabase,
  storeNames: readonly ObjectStoreName[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeNames as string[], mode);
    let workValue: T;
    let workSettled = false;

    transaction.oncomplete = (): void => {
      if (workSettled) {
        resolve(workValue);
      }
    };
    transaction.onabort = (): void => {
      reject(new IndexedDbError("transaction-aborted", "transacción abortada", transaction.error));
    };
    transaction.onerror = (): void => {
      reject(new IndexedDbError("transaction-failed", "transacción fallida", transaction.error));
    };

    work(transaction)
      .then((value) => {
        workValue = value;
        workSettled = true;
      })
      .catch((cause: unknown) => {
        safeAbort(transaction);
        reject(toIndexedDbError(cause));
      });
  });
}

/** Aborta una transacción ignorando el estado ya terminado (idempotente). */
function safeAbort(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch (_cause: unknown) {
    // La transacción ya estaba terminada; el rechazo se propaga por `work`.
  }
}

/** Normaliza cualquier causa a {@link IndexedDbError} sin tragar el detalle. */
function toIndexedDbError(cause: unknown): Error {
  if (cause instanceof IndexedDbError) {
    return cause;
  }
  if (cause instanceof Error) {
    return cause;
  }
  return new IndexedDbError("transaction-failed", "fallo desconocido en la transacción", cause);
}
