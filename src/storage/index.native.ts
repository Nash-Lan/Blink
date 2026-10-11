import * as SQLite from 'expo-sqlite';
import { appDataSchema, type AppData } from '../domain/schema';
import type { StorageAdapter } from './types';

type SnapshotRow = { value: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  dbPromise ??= SQLite.openDatabaseAsync('blink.db').then(async (db) => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS snapshots (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
    return db;
  });
  return dbPromise;
}

export const storage: StorageAdapter = {
  async load() {
    const db = await database();
    const row = await db.getFirstAsync<SnapshotRow>('SELECT value FROM snapshots WHERE key = ?', ['app']);
    if (!row) {
      return null;
    }
    return appDataSchema.parse(JSON.parse(row.value));
  },
  async save(data: AppData) {
    const db = await database();
    await db.runAsync('INSERT OR REPLACE INTO snapshots (key, value) VALUES (?, ?)', ['app', JSON.stringify(appDataSchema.parse(data))]);
  },
};
