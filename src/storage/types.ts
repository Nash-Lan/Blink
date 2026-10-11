import type { AppData } from '../domain/schema';

export type StorageAdapter = {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
};
