import type { Deadline } from './schema';

export type DeadlineBucket = 'overdue' | 'today' | 'future' | 'completed';

export function endOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 0, 0);
  return result;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function bucketDeadline(deadline: Deadline, now = new Date()): DeadlineBucket {
  if (deadline.completedAt) {
    return 'completed';
  }
  const due = new Date(deadline.dueAt);
  if (due.getTime() < now.getTime() && !isSameLocalDay(due, now)) {
    return 'overdue';
  }
  if (isSameLocalDay(due, now)) {
    return due.getTime() < now.getTime() ? 'overdue' : 'today';
  }
  return 'future';
}

export function remainingLabel(deadline: Deadline, now = new Date()): string {
  if (deadline.completedAt) {
    return 'Done';
  }
  const diff = new Date(deadline.dueAt).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const value = minutes < 60 ? `${minutes}m` : hours < 48 ? `${hours}h` : `${days}d`;
  return diff < 0 ? `${value} overdue` : `${value} left`;
}

export function sortDeadlines(a: Deadline, b: Deadline): number {
  return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
}
