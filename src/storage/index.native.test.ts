import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAppData } from '../domain/schema';

const sqlite = vi.hoisted(() => ({
  openDatabaseAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => sqlite);

type FakeDatabase = {
  execAsync: ReturnType<typeof vi.fn>;
  getFirstAsync: ReturnType<typeof vi.fn>;
  runAsync: ReturnType<typeof vi.fn>;
};

function fakeDatabase(): FakeDatabase {
  return {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    runAsync: vi.fn().mockResolvedValue(undefined),
  };
}

async function nativeStorage() {
  return (await import('./index.native')).storage;
}

async function nativeNotificationBindings() {
  return (await import('./index.native')).notificationBindingStore;
}

describe('native SQLite storage', () => {
  beforeEach(() => {
    vi.resetModules();
    sqlite.openDatabaseAsync.mockReset();
  });

  it('initializes the snapshot table and returns null when no snapshot exists', async () => {
    const db = fakeDatabase();
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeStorage()).load()).resolves.toBeNull();

    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith('blink.db');
    expect(db.execAsync).toHaveBeenCalledOnce();
    expect(db.getFirstAsync).toHaveBeenCalledWith('SELECT value FROM snapshots WHERE key = ?', ['app']);
  });

  it('loads a legacy snapshot without reminder history', async () => {
    const db = fakeDatabase();
    const legacy = { ...defaultAppData() } as Record<string, unknown>;
    delete legacy.reminderHistory;
    db.getFirstAsync.mockResolvedValue({ value: JSON.stringify(legacy) });
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeStorage()).load()).resolves.toMatchObject({ reminderHistory: [] });
  });

  it('round-trips persisted reminder history', async () => {
    const db = fakeDatabase();
    const data = defaultAppData();
    data.reminderHistory.push({
      key: 'ddl-1:2026-10-15T10:00:00.000Z:2026-10-15T09:45:00.000Z',
      deadlineId: 'ddl-1',
      dueAt: '2026-10-15T10:00:00.000Z',
      reminderAt: '2026-10-15T09:45:00.000Z',
      shownAt: '2026-10-15T09:45:00.000Z',
    });
    sqlite.openDatabaseAsync.mockResolvedValue(db);
    const storage = await nativeStorage();

    await storage.save(data);
    const written = db.runAsync.mock.calls[0]?.[1] as [string, string];
    db.getFirstAsync.mockResolvedValue({ value: written[1] });

    await expect(storage.load()).resolves.toEqual(data);
  });

  it.each([
    ['malformed JSON', '{broken'],
    ['schema-invalid JSON', JSON.stringify({ version: 1 })],
  ])('rejects %s instead of replacing it with empty data', async (_label, value) => {
    const db = fakeDatabase();
    db.getFirstAsync.mockResolvedValue({ value });
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeStorage()).load()).rejects.toThrow();
  });

  it('propagates a SQLite read failure', async () => {
    const db = fakeDatabase();
    db.getFirstAsync.mockRejectedValue(new Error('read failed'));
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeStorage()).load()).rejects.toThrow('read failed');
  });

  it('propagates a SQLite write failure', async () => {
    const db = fakeDatabase();
    db.runAsync.mockRejectedValue(new Error('disk full'));
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeStorage()).save(defaultAppData())).rejects.toThrow('disk full');
  });

  it('retries database initialization after an open failure', async () => {
    const db = fakeDatabase();
    sqlite.openDatabaseAsync
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(db);
    const storage = await nativeStorage();

    await expect(storage.load()).rejects.toThrow('database unavailable');
    await expect(storage.load()).resolves.toBeNull();
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it('persists device-only native notification bindings separately from app data', async () => {
    const db = fakeDatabase();
    sqlite.openDatabaseAsync.mockResolvedValue(db);
    const store = await nativeNotificationBindings();
    const bindings = [{ deadlineId: 'ddl-1', notificationId: 'native-1', reminderKey: 'key-1' }];

    await store.save(bindings);
    const written = db.runAsync.mock.calls[0]?.[1] as [string, string];
    expect(written[0]).toBe('native-notification-bindings');
    db.getFirstAsync.mockResolvedValue({ value: written[1] });
    await expect(store.load()).resolves.toEqual(bindings);
  });

  it('recovers from a damaged notification binding cache without affecting the app snapshot', async () => {
    const db = fakeDatabase();
    db.getFirstAsync.mockResolvedValue({ value: '{damaged' });
    sqlite.openDatabaseAsync.mockResolvedValue(db);

    await expect((await nativeNotificationBindings()).load()).resolves.toEqual([]);
  });
});
