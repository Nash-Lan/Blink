import type { AppData, Deadline, ReminderHistoryItem } from './schema';

export type ReminderOption = 'none' | 'at-due' | '5m' | '10m' | '15m' | '30m' | '1h' | '1d' | 'custom';

export type ReminderEvent = {
  key: string;
  deadlineId: string;
  title: string;
  dueAt: string;
  reminderAt: string;
};

export const reminderOptions: { value: ReminderOption; label: string }[] = [
  { value: 'none', label: 'No reminder' },
  { value: 'at-due', label: 'At due time' },
  { value: '5m', label: '5 min before' },
  { value: '10m', label: '10 min before' },
  { value: '15m', label: '15 min before' },
  { value: '30m', label: '30 min before' },
  { value: '1h', label: '1 hour before' },
  { value: '1d', label: '1 day before' },
  { value: 'custom', label: 'Choose date & time' },
];

const reminderOffsets: Record<Exclude<ReminderOption, 'none' | 'custom'>, number> = {
  'at-due': 0,
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

export function reminderAtForOption(dueAt: Date, option: Exclude<ReminderOption, 'custom'>): Date | null {
  if (option === 'none') {
    return null;
  }
  return new Date(dueAt.getTime() - reminderOffsets[option]);
}

export function inferReminderOption(dueAt: string, reminderAt: string | null): ReminderOption {
  if (!reminderAt) {
    return 'none';
  }
  const diff = new Date(dueAt).getTime() - new Date(reminderAt).getTime();
  const match = Object.entries(reminderOffsets).find(([, offset]) => offset === diff);
  return (match?.[0] as ReminderOption | undefined) ?? 'custom';
}

export type ReminderValidationResult = { ok: true } | { ok: false; message: string };

export function validateReminderAt(
  reminderAt: Date | null,
  { now = new Date(), previousReminderAt, preserveExisting = false }: {
    now?: Date;
    previousReminderAt?: string | null;
    preserveExisting?: boolean;
  } = {},
): ReminderValidationResult {
  if (reminderAt === null) {
    return { ok: true };
  }
  const timestamp = reminderAt.getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(now.getTime())) {
    return { ok: false, message: 'Choose a valid reminder date and time.' };
  }
  // Callers preserve an existing time only when the deadline's due time is also unchanged.
  if (preserveExisting && previousReminderAt && timestamp === new Date(previousReminderAt).getTime()) {
    return { ok: true };
  }
  if (timestamp <= now.getTime()) {
    return { ok: false, message: 'Reminder time must be in the future.' };
  }
  return { ok: true };
}

export function reminderKey(deadline: Pick<Deadline, 'id' | 'dueAt' | 'reminderAt'>): string | null {
  if (!deadline.reminderAt) {
    return null;
  }
  return `${deadline.id}:${deadline.dueAt}:${deadline.reminderAt}`;
}

export function resolveActiveReminder(event: ReminderEvent | null, deadlines: Deadline[]): ReminderEvent | null {
  if (!event) {
    return null;
  }
  const deadline = deadlines.find((item) => item.id === event.deadlineId);
  if (
    !deadline
    || deadline.completedAt
    || !deadline.reminderAt
    || deadline.dueAt !== event.dueAt
    || deadline.reminderAt !== event.reminderAt
    || reminderKey(deadline) !== event.key
    || !Number.isFinite(new Date(deadline.dueAt).getTime())
    || !Number.isFinite(new Date(deadline.reminderAt).getTime())
  ) {
    return null;
  }
  return deadline.title === event.title ? event : { ...event, title: deadline.title };
}

function findNextReminder(deadlines: Deadline[], history: ReminderHistoryItem[]): ReminderEvent | null {
  const shown = new Set(history.map((item) => item.key));
  let next: ReminderEvent | null = null;
  let nextTimestamp = Infinity;
  for (const deadline of deadlines) {
    const key = reminderKey(deadline);
    if (!key || !deadline.reminderAt || deadline.completedAt || shown.has(key) || !Number.isFinite(new Date(deadline.dueAt).getTime())) {
      continue;
    }
    const timestamp = new Date(deadline.reminderAt).getTime();
    if (Number.isFinite(timestamp) && timestamp < nextTimestamp) {
      nextTimestamp = timestamp;
      next = {
        key,
        deadlineId: deadline.id,
        title: deadline.title,
        dueAt: deadline.dueAt,
        reminderAt: deadline.reminderAt,
      };
    }
  }
  return next;
}

export function findDueReminder(deadlines: Deadline[], history: ReminderHistoryItem[], now = new Date()): ReminderEvent | null {
  const next = findNextReminder(deadlines, history);
  return next && new Date(next.reminderAt).getTime() <= now.getTime() ? next : null;
}

export function nextReminderDelay(deadlines: Deadline[], history: ReminderHistoryItem[], now = new Date()): number | null {
  const next = findNextReminder(deadlines, history);
  if (!next || !Number.isFinite(now.getTime())) {
    return null;
  }
  return Math.max(0, new Date(next.reminderAt).getTime() - now.getTime());
}

export function markReminderShown(data: AppData, event: ReminderEvent, now = new Date()): AppData {
  if (
    !resolveActiveReminder(event, data.deadlines)
    || !Number.isFinite(now.getTime())
    || new Date(event.reminderAt).getTime() > now.getTime()
    || data.reminderHistory.some((item) => item.key === event.key)
  ) {
    return data;
  }
  return {
    ...data,
    reminderHistory: [
      ...data.reminderHistory,
      {
        key: event.key,
        deadlineId: event.deadlineId,
        dueAt: event.dueAt,
        reminderAt: event.reminderAt,
        shownAt: now.toISOString(),
      },
    ],
  };
}
