import * as SQLite from 'expo-sqlite';
import type { AppData } from '../domain/schema';
import { parseAppSnapshot, serializeAppSnapshot } from './snapshot';
import { notificationBindingsSchema } from '../notifications/types';
import type { NotificationBindingStore, StorageAdapter } from './types';

type SnapshotRow = { value: string };
const NOTIFICATION_BINDINGS_KEY = 'native-notification-bindings';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  if (dbPromise) {
    return dbPromise;
  }
  const opening = SQLite.openDatabaseAsync('blink.db').then(async (db) => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS snapshots (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    return db;
  });
  dbPromise = opening;
  try {
    return await opening;
  } catch (error) {
    if (dbPromise === opening) {
      dbPromise = null;
    }
    throw error;
  }
}

export const storage: StorageAdapter = {
  async load() {
    const db = await database();
    const row = await db.getFirstAsync<SnapshotRow>('SELECT value FROM snapshots WHERE key = ?', ['app']);
    if (!row) {
      return null;
    }
    return parseAppSnapshot(row.value);
  },
  async save(data: AppData) {
    const snapshot = serializeAppSnapshot(data);
    const db = await database();
    await db.runAsync('INSERT OR REPLACE INTO snapshots (key, value) VALUES (?, ?)', ['app', snapshot]);
  },
};

export const notificationBindingStore: NotificationBindingStore = {
  async load() {
    const db = await database();
    const row = await db.getFirstAsync<SnapshotRow>('SELECT value FROM snapshots WHERE key = ?', [NOTIFICATION_BINDINGS_KEY]);
    if (!row) return [];
    try {
      return notificationBindingsSchema.parse(JSON.parse(row.value));
    } catch {
      return [];
    }
  },
  async save(bindings) {
    const value = JSON.stringify(notificationBindingsSchema.parse(bindings));
    const db = await database();
    await db.runAsync('INSERT OR REPLACE INTO snapshots (key, value) VALUES (?, ?)', [NOTIFICATION_BINDINGS_KEY, value]);
  },
};
