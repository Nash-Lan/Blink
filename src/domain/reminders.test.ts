import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../storage/backup';
import {
  findDueReminder,
  inferReminderOption,
  markReminderShown,
  nextReminderDelay,
  reminderAtForOption,
  resolveActiveReminder,
  validateReminderAt,
  type ReminderEvent,
  type ReminderOption,
} from './reminders';
import { appDataSchema, defaultAppData, type AppData, type Deadline } from './schema';

const now = new Date('2026-10-15T12:00:00.000Z');

function deadline(patch: Partial<Deadline> = {}): Deadline {
  return {
    id: 'ddl_1',
    title: 'Submit proposal',
    notes: 'Keep the original deadline',
    dueAt: '2026-10-15T12:15:00.000Z',
    reminderAt: now.toISOString(),
    completedAt: null,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
    contentVersion: 1,
    allowAI: true,
    ...patch,
  };
}

function appData(record = deadline()): AppData {
  return { ...defaultAppData(), deadlines: [record] };
}

function dueEvent(data = appData()): ReminderEvent {
  const event = findDueReminder(data.deadlines, data.reminderHistory, now);
  if (!event) throw new Error('Expected a due reminder');
  return event;
}

describe('reminder time configuration', () => {
  it.each<[Exclude<ReminderOption, 'none' | 'custom'>, string]>([
    ['at-due', '2026-10-15T12:00:00.000Z'],
    ['5m', '2026-10-15T11:55:00.000Z'],
    ['10m', '2026-10-15T11:50:00.000Z'],
    ['15m', '2026-10-15T11:45:00.000Z'],
    ['30m', '2026-10-15T11:30:00.000Z'],
    ['1h', '2026-10-15T11:00:00.000Z'],
    ['1d', '2026-10-14T12:00:00.000Z'],
  ])('calculates and preserves the %s selection, including legacy 10-minute values', (option, expected) => {
    const due = new Date(now);
    const reminder = reminderAtForOption(due, option);
    expect(reminder?.toISOString()).toBe(expected);
    expect(inferReminderOption(due.toISOString(), expected)).toBe(option);
    expect(due.toISOString()).toBe(now.toISOString());
  });

  it.each<[string, Exclude<ReminderOption, 'custom'>, string]>([
    ['2026-10-15T00:05:00.000Z', '15m', '2026-10-14T23:50:00.000Z'],
    ['2026-03-01T00:05:00.000Z', '30m', '2026-02-28T23:35:00.000Z'],
    ['2027-01-01T08:00:00.000Z', '1d', '2026-12-31T08:00:00.000Z'],
  ])('subtracts across calendar boundaries from %s', (dueAt, option, expected) => {
    expect(reminderAtForOption(new Date(dueAt), option)?.toISOString()).toBe(expected);
  });

  it('uses a single nullable reminder timestamp when reminders are removed', () => {
    expect(reminderAtForOption(now, 'none')).toBeNull();
    expect(inferReminderOption(now.toISOString(), null)).toBe('none');
  });

  it('recognizes a custom time without silently replacing it with the due time', () => {
    expect(inferReminderOption('2026-10-15T13:00:00.000Z', '2026-10-15T12:23:00.000Z')).toBe('custom');
  });

  it('accepts a valid future reminder and disabling a reminder', () => {
    expect(validateReminderAt(new Date(now.getTime() + 1), { now })).toEqual({ ok: true });
    expect(validateReminderAt(null, { now })).toEqual({ ok: true });
  });

  it.each([
    new Date('invalid'),
    new Date(now.getTime() - 1),
    now,
  ])('rejects invalid, past, or current reminder input: %s', (reminderAt) => {
    expect(validateReminderAt(reminderAt, { now }).ok).toBe(false);
  });

  it('allows an unchanged historical reminder only when the caller preserves the original schedule', () => {
    const previousReminderAt = '2026-10-14T12:00:00.123Z';
    const reminderAt = new Date(previousReminderAt);
    expect(validateReminderAt(reminderAt, { now, previousReminderAt, preserveExisting: true }).ok).toBe(true);
    expect(validateReminderAt(reminderAt, { now, previousReminderAt }).ok).toBe(false);
    expect(validateReminderAt(new Date('2026-10-14T12:00:00.000Z'), { now, previousReminderAt, preserveExisting: true }).ok).toBe(false);
  });
});

describe('foreground reminder scheduling and history', () => {
  it('becomes due exactly at its configured time and reports the next timer delay', () => {
    const data = appData();
    const before = new Date(now.getTime() - 750);
    expect(findDueReminder(data.deadlines, [], before)).toBeNull();
    expect(nextReminderDelay(data.deadlines, [], before)).toBe(750);
    expect(dueEvent(data).deadlineId).toBe('ddl_1');
    expect(nextReminderDelay(data.deadlines, [], now)).toBe(0);
    expect(nextReminderDelay(data.deadlines, [], new Date(now.getTime() + 750))).toBe(0);
  });

  it('chooses the oldest unseen reminder without mutating deadline order', () => {
    const earlier = deadline({ id: 'ddl_2', reminderAt: '2026-10-15T11:00:00.000Z' });
    const data = { ...appData(), deadlines: [deadline(), earlier] };
    const first = dueEvent(data);
    expect(first.deadlineId).toBe('ddl_2');
    const shown = markReminderShown(data, first, now);
    expect(dueEvent(shown).deadlineId).toBe('ddl_1');
    expect(data.deadlines[0]?.id).toBe('ddl_1');
  });

  it('suppresses repeated checks after display or banner dismissal and writes history once', () => {
    const data = appData();
    const event = dueEvent(data);
    const shown = markReminderShown(data, event, now);
    expect(shown.reminderHistory).toHaveLength(1);
    expect(shown.reminderHistory[0]?.shownAt).toBe(now.toISOString());
    expect(markReminderShown(shown, event, new Date(now.getTime() + 1_000))).toBe(shown);
    expect(findDueReminder(shown.deadlines, shown.reminderHistory, new Date(now.getTime() + 60_000))).toBeNull();
    expect(nextReminderDelay(shown.deadlines, shown.reminderHistory, now)).toBeNull();
    expect(data.reminderHistory).toHaveLength(0);
  });

  it.each<Partial<Deadline>>([
    { reminderAt: '2026-10-15T12:01:00.000Z' },
    { dueAt: '2026-10-15T13:00:00.000Z' },
    { reminderAt: null },
    { completedAt: now.toISOString() },
    { dueAt: 'invalid' },
    { reminderAt: 'invalid' },
  ])('invalidates stale active events and queued history writes after a schedule change: %j', (patch) => {
    const data = appData();
    const event = dueEvent(data);
    const changed = { ...data, deadlines: [{ ...data.deadlines[0]!, ...patch }] };
    expect(resolveActiveReminder(event, changed.deadlines)).toBeNull();
    expect(markReminderShown(changed, event, now)).toBe(changed);
  });

  it('invalidates a deleted deadline without recording stale history', () => {
    const event = dueEvent();
    const deleted = defaultAppData();
    expect(resolveActiveReminder(event, deleted.deadlines)).toBeNull();
    expect(markReminderShown(deleted, event, now)).toBe(deleted);
    expect(findDueReminder(deleted.deadlines, [], now)).toBeNull();
  });

  it('retains the deadline when its reminder is disabled', () => {
    const data = appData(deadline({ reminderAt: null }));
    expect(findDueReminder(data.deadlines, [], now)).toBeNull();
    expect(nextReminderDelay(data.deadlines, [], now)).toBeNull();
    expect(data.deadlines[0]?.title).toBe('Submit proposal');
    expect(data.deadlines[0]?.notes).toBe('Keep the original deadline');
  });

  it('uses the latest title for an active event without creating a new reminder', () => {
    const data = appData();
    const event = dueEvent(data);
    const shown = markReminderShown(data, event, now);
    const changed = { ...shown, deadlines: [deadline({ title: 'Updated proposal title' })] };
    expect(resolveActiveReminder(event, changed.deadlines)?.title).toBe('Updated proposal title');
    expect(findDueReminder(changed.deadlines, changed.reminderHistory, now)).toBeNull();
  });

  it('recalculates edited reminder times while preserving history of the old schedule', () => {
    const data = appData();
    const first = dueEvent(data);
    const shown = markReminderShown(data, first, now);
    const changed = { ...shown, deadlines: [deadline({ reminderAt: '2026-10-15T12:05:00.000Z' })] };
    expect(findDueReminder(changed.deadlines, changed.reminderHistory, now)).toBeNull();
    const later = new Date('2026-10-15T12:05:00.000Z');
    const second = findDueReminder(changed.deadlines, changed.reminderHistory, later);
    expect(second?.key).not.toBe(first.key);
    if (!second) throw new Error('Expected the edited reminder');
    expect(markReminderShown(changed, second, later).reminderHistory).toHaveLength(2);
  });

  it('does not mark a future event as shown before its time', () => {
    const data = appData();
    expect(markReminderShown(data, dueEvent(data), new Date(now.getTime() - 1))).toBe(data);
  });

  it('suppresses completed deadlines and restores an unseen candidate after Undo', () => {
    const completed = appData(deadline({ completedAt: now.toISOString() }));
    expect(findDueReminder(completed.deadlines, [], now)).toBeNull();
    expect(nextReminderDelay(completed.deadlines, [], now)).toBeNull();
    const undone = { ...completed, deadlines: completed.deadlines.map((item) => ({ ...item, completedAt: null })) };
    expect(dueEvent(undone).deadlineId).toBe('ddl_1');
  });

  it('keeps shown history across complete and Undo so it does not show the same reminder again', () => {
    const data = appData();
    const event = dueEvent(data);
    const shown = markReminderShown(data, event, now);
    const completed = { ...shown, deadlines: [deadline({ completedAt: now.toISOString() })] };
    expect(resolveActiveReminder(event, completed.deadlines)).toBeNull();
    const undone = { ...completed, deadlines: [deadline()] };
    expect(findDueReminder(undone.deadlines, undone.reminderHistory, now)).toBeNull();
    expect(undone.reminderHistory).toEqual(shown.reminderHistory);
  });

  it('skips malformed persisted schedules instead of triggering or blocking valid reminders', () => {
    const deadlines = [
      deadline({ id: 'bad_due', dueAt: 'invalid', reminderAt: '2020-01-01T00:00:00.000Z' }),
      deadline({ id: 'bad_reminder', reminderAt: 'invalid' }),
      deadline(),
    ];
    expect(findDueReminder(deadlines, [], now)?.deadlineId).toBe('ddl_1');
    expect(nextReminderDelay(deadlines, [], now)).toBe(0);
  });
});

describe('reminder persistence compatibility', () => {
  it('restores custom reminder settings and shown history through a JSON snapshot', () => {
    const data = appData(deadline({ reminderAt: '2026-10-15T11:57:00.123Z' }));
    const shown = markReminderShown(data, dueEvent(data), now);
    const restored = appDataSchema.parse(JSON.parse(JSON.stringify(shown)));
    expect(restored.deadlines).toEqual(shown.deadlines);
    expect(restored.reminderHistory).toEqual(shown.reminderHistory);
    expect(findDueReminder(restored.deadlines, restored.reminderHistory, now)).toBeNull();
  });

  it('restores reminder history and disabled settings through backup export/import', () => {
    const data = appData();
    const shown = markReminderShown(data, dueEvent(data), now);
    const disabled = { ...shown, deadlines: [deadline({ reminderAt: null })] };
    const restored = importBackup(exportBackup(disabled));
    expect(restored.deadlines[0]?.reminderAt).toBeNull();
    expect(restored.reminderHistory).toEqual(shown.reminderHistory);
    expect(findDueReminder(restored.deadlines, restored.reminderHistory, now)).toBeNull();
  });

  it('loads older snapshots and backups without reminder history', () => {
    const current = appData();
    const legacySettings: Record<string, unknown> = { ...current.settings };
    delete legacySettings.nativeNotificationsEnabled;
    const legacy: Record<string, unknown> = { ...current, settings: legacySettings };
    delete legacy.reminderHistory;
    const restored = appDataSchema.parse(JSON.parse(JSON.stringify(legacy)));
    const backup = importBackup(JSON.stringify({ ...legacy, exportedAt: now.toISOString() }));
    expect(restored.reminderHistory).toEqual([]);
    expect(backup.reminderHistory).toEqual([]);
    expect(restored.settings.nativeNotificationsEnabled).toBe(false);
    expect(backup.settings.nativeNotificationsEnabled).toBe(false);
    expect(dueEvent(restored).deadlineId).toBe('ddl_1');
  });
});
