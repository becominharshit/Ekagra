// Files kept on this device (Demo Mode's PDFs), in the browser's IndexedDB: it can hold much more
// than localStorage, which is only a few MB. Nothing is uploaded.

const DB_NAME = 'ekagra-files'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the storage on this device.'))
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('The storage on this device refused the file.'))
    })
  } finally {
    db.close()
  }
}

export const deviceFiles = {
  async put(key: string, file: Blob): Promise<void> {
    try {
      await run('readwrite', (store) => store.put(file, key))
    } catch (error) {
      const full = error instanceof DOMException && error.name === 'QuotaExceededError'
      throw new Error(full ? 'There is no space left for files on this device.' : 'The file could not be saved on this device.')
    }
  },

  async get(key: string): Promise<Blob | null> {
    const file: unknown = await run('readonly', (store) => store.get(key))
    return file instanceof Blob ? file : null
  },

  async remove(key: string): Promise<void> {
    await run('readwrite', (store) => store.delete(key))
  },

  /** Deletes every file this app kept on the device. */
  async clear(): Promise<void> {
    await run('readwrite', (store) => store.clear())
  },
}
