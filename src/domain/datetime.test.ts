import { describe, expect, it } from 'vitest';
import { formatDateInput, formatTimeInput, parseLocalDateTimeStrict } from './datetime';

describe('strict local date and time input', () => {
  it('round-trips local leap-day input without changing its time zone', () => {
    const parsed = parseLocalDateTimeStrict('2028-02-29', '00:05');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.date.getFullYear()).toBe(2028);
    expect(parsed.date.getMonth()).toBe(1);
    expect(parsed.date.getDate()).toBe(29);
    expect(parsed.date.getHours()).toBe(0);
    expect(parsed.date.getMinutes()).toBe(5);
    expect(parsed.date.getSeconds()).toBe(0);
    expect(formatDateInput(parsed.date)).toBe('2028-02-29');
    expect(formatTimeInput(parsed.date)).toBe('00:05');
  });

  it('accepts harmless surrounding whitespace', () => {
    const parsed = parseLocalDateTimeStrict(' 2026-10-15 ', ' 23:59 ');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(formatTimeInput(parsed.date)).toBe('23:59');
  });

  it('handles four-digit years below 0100 without changing the century', () => {
    const parsed = parseLocalDateTimeStrict('0099-01-01', '12:00');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(formatDateInput(parsed.date)).toBe('0099-01-01');
  });

  it.each([
    ['2026-02-29', '12:00'],
    ['2026-04-31', '12:00'],
    ['2026-01-00', '12:00'],
    ['2026-01-32', '12:00'],
    ['2026-00-10', '12:00'],
    ['2026-13-10', '12:00'],
    ['0000-01-01', '12:00'],
    ['26-10-15', '12:00'],
    ['2026-1-15', '12:00'],
    ['2026/10/15', '12:00'],
    ['2026-10-15', '24:00'],
    ['2026-10-15', '23:60'],
    ['2026-10-15', '9:00'],
    ['2026-10-15', '09:0'],
    ['2026-10-15', '09:00:00'],
    ['2026-10-15', '09:00Z'],
    ['2026-10-15', '-1:00'],
    ['', ''],
  ])('rejects invalid input %s %s instead of normalizing it', (dateText, timeText) => {
    expect(parseLocalDateTimeStrict(dateText, timeText).ok).toBe(false);
  });
});
