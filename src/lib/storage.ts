export type Theme = 'system' | 'light' | 'dark'
export type Preferences = {
  voice: string
  speed: number
  theme: Theme
}
export type Progress = {
  fingerprint: string
  chunkIndex: number
  chunkId?: string
  pageNumber?: number
  updatedAt: number
}
export type HistoryEntry = {
  fingerprint: string
  name: string
  chunkIndex: number
  totalChunks: number
  updatedAt: number
}
export type Bookmark = {
  chunkId: string
  pageNumber: number
  text: string
  createdAt: number
}
export function availableProgressIndex(
  savedIndex: number,
  availableChunks: number,
) {
  if (!availableChunks) return undefined
  return Math.min(savedIndex, availableChunks - 1)
}
const DB = 'readlocal'
const STORE = 'local'

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function getLocal<T>(key: string): Promise<T | undefined> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}
export async function setLocal<T>(key: string, value: T): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE, 'readwrite')
      .objectStore(STORE)
      .put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
export async function clearLocal(): Promise<void> {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE, 'readwrite')
      .objectStore(STORE)
      .clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
