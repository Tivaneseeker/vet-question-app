import type { Question } from './types';

const DB_NAME = 'vet-question-db';
const DB_VERSION = 1;
const QUESTION_STORE = 'questions';
const WRONG_STORE = 'wrongQuestions';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUESTION_STORE)) {
        const store = db.createObjectStore(QUESTION_STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains(WRONG_STORE)) {
        db.createObjectStore(WRONG_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = run(store);
        let result: T | undefined;
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export async function saveQuestions(questions: Question[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(QUESTION_STORE, 'readwrite');
    const store = transaction.objectStore(QUESTION_STORE);
    questions.forEach((question) => store.put(question));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getQuestions(): Promise<Question[]> {
  return ((await tx<Question[]>(QUESTION_STORE, 'readonly', (store) => store.getAll())) ?? []).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export async function getWrongIds(): Promise<string[]> {
  const rows = (await tx<{ id: string; addedAt: number }[]>(WRONG_STORE, 'readonly', (store) => store.getAll())) ?? [];
  return rows.sort((a, b) => a.addedAt - b.addedAt).map((row) => row.id);
}

export async function addWrongQuestion(id: string): Promise<void> {
  await tx(WRONG_STORE, 'readwrite', (store) => store.put({ id, addedAt: Date.now() }));
}

export async function removeWrongQuestion(id: string): Promise<void> {
  await tx(WRONG_STORE, 'readwrite', (store) => store.delete(id));
}

export async function clearQuestions(): Promise<void> {
  const db = await openDb();
  await Promise.all(
    [QUESTION_STORE, WRONG_STORE].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(name, 'readwrite');
          transaction.objectStore(name).clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        }),
    ),
  );
}
