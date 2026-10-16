import { describe, expect, it, vi } from 'vitest';
import { defaultAppData, type Deadline } from '../domain/schema';
import { reminderKey } from '../domain/reminders';
import { NativeNotificationCoordinator } from './coordinator';
import type {
  NativeNotificationAdapter,
  NativeNotificationPermission,
  NativeScheduledNotification,
  NotificationBinding,
  NotificationBindingStore,
  ScheduleNativeNotificationInput,
} from './types';

const now = new Date('2026-10-15T12:00:00.000Z');

function deadline(patch: Partial<Deadline> = {}): Deadline {
  return {
    id: 'ddl-1',
    title: 'Submit proposal',
    notes: '',
    dueAt: '2026-10-15T14:00:00.000Z',
    reminderAt: '2026-10-15T13:00:00.000Z',
    completedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    contentVersion: 1,
    allowAI: true,
    ...patch,
  };
}

function fakeStore(initial: NotificationBinding[] = []): NotificationBindingStore & { bindings: NotificationBinding[] } {
  return {
    bindings: [...initial],
    async load() { return [...this.bindings]; },
    async save(bindings) { this.bindings = [...bindings]; },
  };
}

function fakeAdapter(permission: NativeNotificationPermission = 'granted') {
  let nextId = 1;
  const adapter: NativeNotificationAdapter & { scheduled: NativeScheduledNotification[] } = {
    supported: true,
    scheduled: [],
    configureForegroundHandler: vi.fn(),
    getPermissionStatus: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    listScheduled: vi.fn(async () => [...adapter.scheduled]),
    schedule: vi.fn(async (input: ScheduleNativeNotificationInput) => {
      const notificationId = `native-${nextId++}`;
      adapter.scheduled.push({ notificationId, deadlineId: input.deadlineId, reminderKey: input.reminderKey, title: input.title });
      return notificationId;
    }),
    cancel: vi.fn(async (notificationId: string) => {
      adapter.scheduled = adapter.scheduled.filter((item) => item.notificationId !== notificationId);
    }),
    getLastResponse: vi.fn(() => null),
    clearLastResponse: vi.fn(),
    subscribeToResponses: vi.fn(() => () => undefined),
  };
  return adapter;
}

function coordinator(adapter = fakeAdapter(), store = fakeStore()) {
  const instance = new NativeNotificationCoordinator(adapter, store, () => now);
  return { instance, adapter, store };
}

describe('native notification reconciliation', () => {
  it('schedules a new future reminder and persists its device binding', async () => {
    const { instance, adapter, store } = coordinator();
    instance.updatePlan([deadline()], true);

    await instance.reconcileAll();

    expect(adapter.schedule).toHaveBeenCalledOnce();
    expect(adapter.scheduled).toMatchObject(store.bindings);
    expect(store.bindings[0]).toMatchObject({ deadlineId: 'ddl-1', reminderKey: reminderKey(deadline()) });
  });

  it('is idempotent when the matching system notification already exists', async () => {
    const existing = { deadlineId: 'ddl-1', notificationId: 'native-existing', reminderKey: reminderKey(deadline())! };
    const adapter = fakeAdapter();
    adapter.scheduled = [existing];
    const store = fakeStore([existing]);
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], true);

    await instance.reconcileAll();
    await instance.reconcileAll();

    expect(adapter.schedule).not.toHaveBeenCalled();
    expect(adapter.cancel).not.toHaveBeenCalled();
    expect(store.bindings).toEqual([existing]);
  });

  it('cancels the old notification and schedules the edited reminder', async () => {
    const { instance, adapter, store } = coordinator();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    const oldId = store.bindings[0]!.notificationId;
    const edited = deadline({ reminderAt: '2026-10-15T13:30:00.000Z' });

    instance.updatePlan([edited], true);
    await instance.reconcileAll();

    expect(adapter.cancel).toHaveBeenCalledWith(oldId);
    expect(adapter.schedule).toHaveBeenCalledTimes(2);
    expect(store.bindings[0]?.reminderKey).toBe(reminderKey(edited));
  });

  it('replaces a matching schedule when the deadline title changed', async () => {
    const { instance, adapter, store } = coordinator();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    const oldId = store.bindings[0]!.notificationId;

    instance.updatePlan([deadline({ title: 'Updated proposal' })], true);
    await instance.reconcileAll();

    expect(adapter.cancel).toHaveBeenCalledWith(oldId);
    expect(adapter.schedule).toHaveBeenCalledTimes(2);
    expect(adapter.scheduled[0]?.title).toBe('Updated proposal');
  });

  it.each([
    ['completed', [deadline({ completedAt: now.toISOString() })]],
    ['deleted', []],
    ['disabled reminder', [deadline({ reminderAt: null })]],
  ])('cancels a notification when its deadline is %s', async (_label, deadlines) => {
    const { instance, adapter, store } = coordinator();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    const oldId = store.bindings[0]!.notificationId;

    instance.updatePlan(deadlines, true);
    await instance.reconcileAll();

    expect(adapter.cancel).toHaveBeenCalledWith(oldId);
    expect(store.bindings).toEqual([]);
  });

  it('reschedules after Undo only while the reminder is still in the future', async () => {
    const { instance, adapter } = coordinator();
    instance.updatePlan([deadline({ completedAt: now.toISOString() })], true);
    await instance.reconcileAll();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    expect(adapter.schedule).toHaveBeenCalledOnce();

    instance.updatePlan([deadline({ id: 'ddl-past', reminderAt: '2026-10-15T11:59:59.000Z' })], true);
    await instance.reconcileAll();
    expect(adapter.schedule).toHaveBeenCalledOnce();
  });

  it('does not schedule when permission is denied and clears stale Blink notifications', async () => {
    const adapter = fakeAdapter('denied');
    adapter.scheduled = [{ deadlineId: 'ddl-1', notificationId: 'native-old', reminderKey: reminderKey(deadline())! }];
    const store = fakeStore(adapter.scheduled);
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], true);

    await expect(instance.reconcileAll()).resolves.toBe('denied');
    expect(adapter.schedule).not.toHaveBeenCalled();
    expect(adapter.cancel).toHaveBeenCalledWith('native-old');
    expect(store.bindings).toEqual([]);
  });

  it('drops an orphaned local mapping without cancelling an unverified system ID', async () => {
    const adapter = fakeAdapter('denied');
    const store = fakeStore([{ deadlineId: 'ddl-1', notificationId: 'unverified-id', reminderKey: reminderKey(deadline())! }]);
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], false);

    await instance.reconcileAll();

    expect(adapter.cancel).not.toHaveBeenCalled();
    expect(store.bindings).toEqual([]);
  });

  it('leaves no successful binding after scheduling fails and retries later', async () => {
    const { instance, adapter, store } = coordinator();
    vi.mocked(adapter.schedule).mockRejectedValueOnce(new Error('native schedule failed'));
    instance.updatePlan([deadline()], true);

    await expect(instance.reconcileAll()).rejects.toThrow('native schedule failed');
    expect(store.bindings).toEqual([]);
    await expect(instance.reconcileAll()).resolves.toBe('granted');
    expect(adapter.schedule).toHaveBeenCalledTimes(2);
    expect(store.bindings).toHaveLength(1);
  });

  it('cancels a newly-created notification when binding persistence fails', async () => {
    const adapter = fakeAdapter();
    const store = fakeStore();
    const save = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('mapping write failed'));
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], true);

    await expect(instance.reconcileAll()).rejects.toThrow('mapping write failed');
    expect(adapter.cancel).toHaveBeenCalledWith('native-1');
    save.mockRestore();
    await instance.reconcileAll();
    expect(store.bindings).toHaveLength(1);
  });

  it('recovers a missing device mapping from Blink notification metadata after restart', async () => {
    const adapter = fakeAdapter();
    const existing = { deadlineId: 'ddl-1', notificationId: 'native-restored', reminderKey: reminderKey(deadline())! };
    adapter.scheduled = [existing];
    const store = fakeStore();
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], true);

    await instance.reconcileAll();

    expect(adapter.schedule).not.toHaveBeenCalled();
    expect(store.bindings).toEqual([existing]);
  });

  it('reconciles restored backup deadlines without carrying old device IDs', async () => {
    const { instance, adapter, store } = coordinator();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    const oldId = store.bindings[0]!.notificationId;
    const restored = deadline({ id: 'ddl-restored', reminderAt: '2026-10-15T13:45:00.000Z' });

    instance.updatePlan([restored], true);
    await instance.reconcileAll();

    expect(adapter.cancel).toHaveBeenCalledWith(oldId);
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0]?.deadlineId).toBe('ddl-restored');
  });

  it('cancels an asynchronously scheduled stale result during a rapid edit', async () => {
    const adapter = fakeAdapter();
    let finishFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    vi.mocked(adapter.schedule).mockImplementationOnce(async (input) => {
      await firstGate;
      adapter.scheduled.push({ notificationId: 'native-stale', deadlineId: input.deadlineId, reminderKey: input.reminderKey, title: input.title });
      return 'native-stale';
    });
    const store = fakeStore();
    const { instance } = coordinator(adapter, store);
    instance.updatePlan([deadline()], true);
    const first = instance.reconcileAll();
    await vi.waitFor(() => expect(adapter.schedule).toHaveBeenCalledOnce());
    const edited = deadline({ reminderAt: '2026-10-15T13:30:00.000Z' });
    instance.updatePlan([edited], true);
    const second = instance.reconcileAll();
    finishFirst();

    await Promise.all([first, second]);
    expect(adapter.cancel).toHaveBeenCalledWith('native-stale');
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0]?.reminderKey).toBe(reminderKey(edited));
  });

  it('keeps reminder history separate from system scheduling state', async () => {
    const data = defaultAppData();
    data.reminderHistory.push({ key: 'shown', deadlineId: 'old', dueAt: now.toISOString(), reminderAt: now.toISOString(), shownAt: now.toISOString() });
    const { instance, store } = coordinator();
    instance.updatePlan([deadline()], true);
    await instance.reconcileAll();
    expect(data.reminderHistory).toHaveLength(1);
    expect(store.bindings).toHaveLength(1);
  });
});
