import { openDB } from 'idb';
import type { AppData } from '../domain/schema';
import { parseAppSnapshot } from './snapshot';
import type { NotificationBindingStore, StorageAdapter } from './types';

const DB_NAME = 'blink-local';
const STORE_NAME = 'snapshots';
const DATA_KEY = 'app';

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

export const storage: StorageAdapter = {
  async load() {
    const db = await database();
    const raw = await db.get(STORE_NAME, DATA_KEY);
    if (!raw) {
      debugLog('indexeddb.load.empty');
      return null;
    }
    const parsed = parseAppSnapshot(raw);
    debugLog('indexeddb.load.success', { notes: parsed.notes.length, deadlines: parsed.deadlines.length });
    return parsed;
  },
  async save(data: AppData) {
    const db = await database();
    const parsed = parseAppSnapshot(data);
    debugLog('indexeddb.save.validated', { notes: parsed.notes.length, deadlines: parsed.deadlines.length });
    await db.put(STORE_NAME, parsed, DATA_KEY);
    debugLog('indexeddb.save.success', { notes: parsed.notes.length, deadlines: parsed.deadlines.length });
  },
};

export const notificationBindingStore: NotificationBindingStore = {
  async load() { return []; },
  async save() {},
};

function debugLog(event: string, details: Record<string, unknown> = {}) {
  if (__DEV__) {
    console.info(`[Blink save] ${event}`, details);
  }
}
