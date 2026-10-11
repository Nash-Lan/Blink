import { backupSchema, type AppData, type BackupData } from '../domain/schema';

export function exportBackup(data: AppData): string {
  const backup: BackupData = {
    ...data,
    exportedAt: new Date().toISOString(),
    settings: {
      ...data.settings,
      hasDeepSeekKey: false,
    },
  };
  return JSON.stringify(backupSchema.parse(backup), null, 2);
}

export function importBackup(raw: string): AppData {
  const parsed = backupSchema.parse(JSON.parse(raw));
  const { exportedAt: _exportedAt, ...data } = parsed;
  return data;
}
