export type DateTimeParseResult = {
  ok: true;
  date: Date;
} | {
  ok: false;
  message: string;
};

export function formatDateInput(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function parseLocalDateTimeStrict(dateText: string, timeText: string): DateTimeParseResult {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!dateMatch) {
    return { ok: false, message: 'Use date format YYYY-MM-DD.' };
  }

  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!timeMatch) {
    return { ok: false, message: 'Use time format HH:mm.' };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (year < 1) {
    return { ok: false, message: 'Year must be between 0001 and 9999.' };
  }
  if (month < 1 || month > 12) {
    return { ok: false, message: 'Month must be between 01 and 12.' };
  }
  if (hour < 0 || hour > 23) {
    return { ok: false, message: 'Hour must be between 00 and 23.' };
  }
  if (minute < 0 || minute > 59) {
    return { ok: false, message: 'Minute must be between 00 and 59.' };
  }

  // setFullYear avoids the Date constructor's special handling of years 00–99.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, 0, 0);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
  ) {
    return { ok: false, message: 'Date does not exist.' };
  }

  return { ok: true, date };
}
