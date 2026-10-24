const DATABASE = "research-tool-offline";
const STORE = "records";
let opening;

function storageError(error) {
  if (error?.name === "QuotaExceededError") {
    return new Error(
      "Device storage is full. This work has not been saved. Keep this screen open and free space before trying again.",
      { cause: error },
    );
  }
  return new Error(
    `Device storage is unavailable. This work may not be saved. ${error?.message || "Check browser storage permissions and try again."}`,
    { cause: error },
  );
}

function database() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("This browser does not support offline storage."));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        if (abandoned) {
          request.result.close();
          return;
        }
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error(
            "Another open Research-Tool tab is blocking offline storage. Close it and try again.",
          ),
        );
      };
    }).catch((error) => {
      opening = undefined;
      throw storageError(error);
    });
  }
  return opening;
}

async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    try {
      tx = db.transaction(STORE, mode);
      const assign = (value) => {
        result = value;
      };
      operation(tx.objectStore(STORE), assign);
    } catch (error) {
      if (tx) {
        try {
          tx.abort();
        } catch {
          /* Transaction may already be inactive. */
        }
      }
      reject(storageError(error));
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(storageError(tx.error));
    tx.onabort = () =>
      reject(
        storageError(
          tx.error || new Error("The storage transaction was interrupted."),
        ),
      );
  });
}

// Resolve writes only after the IndexedDB transaction has committed.
export function get(key) {
  return transaction("readonly", (store, assign) => {
    const request = store.get(key);
    request.onsuccess = () => assign(request.result);
  });
}

export function set(key, value) {
  return transaction("readwrite", (store) => {
    store.put(value, key);
  });
}

export function del(key) {
  return transaction("readwrite", (store) => {
    store.delete(key);
  });
}

// Move an interview into the outbox atomically. A crash must not leave both a
// queued submission and an editable draft that could be submitted a second time.
export async function queueDraft(userId, formId, entry) {
  const submissionId = entry?.payload?.id;
  if (!userId || !formId || typeof submissionId !== "string" || !submissionId) {
    throw new Error(
      "Cannot queue an interview without its user, questionnaire, and submission ID.",
    );
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    let conflict;
    let tx;
    try {
      tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = `${userId}.outbox.${submissionId}`;
      const request = store.get(key);
      request.onsuccess = () => {
        const existing = request.result;
        if (
          existing &&
          JSON.stringify(existing.payload) !== JSON.stringify(entry.payload)
        ) {
          conflict = new Error(
            "This interview ID is already queued with different answers. The existing submission and draft were preserved.",
          );
          tx.abort();
          return;
        }
        if (!existing) store.put(entry, key);
        store.delete(`${userId}.draft.${formId}`);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error));
      tx.onabort = () =>
        reject(
          conflict ||
            storageError(
              tx.error || new Error("Queuing the interview was interrupted."),
            ),
        );
    } catch (error) {
      if (tx) {
        try {
          tx.abort();
        } catch {
          /* The transaction may already be inactive. */
        }
      }
      reject(storageError(error));
    }
  });
}

export function all(prefix = "") {
  return transaction("readonly", (store, assign) => {
    const result = [];
    const request = store.openCursor(IDBKeyRange.lowerBound(prefix));
    request.onsuccess = () => {
      const cursor = request.result;
      if (
        cursor &&
        typeof cursor.key === "string" &&
        cursor.key.startsWith(prefix)
      ) {
        result.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      } else {
        assign(result);
      }
    };
  });
}

export function clearUser(userId) {
  const prefix = `${userId}.`;
  return transaction("readwrite", (store) => {
    const request = store.openCursor(IDBKeyRange.lowerBound(prefix));
    request.onsuccess = () => {
      const cursor = request.result;
      if (
        cursor &&
        typeof cursor.key === "string" &&
        cursor.key.startsWith(prefix)
      ) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}
