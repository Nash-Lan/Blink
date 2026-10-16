import { appDataSchema, type AppData } from '../domain/schema';

export function parseAppSnapshot(raw: unknown): AppData {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return appDataSchema.parse(value);
}

export function serializeAppSnapshot(data: AppData): string {
  return JSON.stringify(appDataSchema.parse(data));
}
