import type { AppData } from '../domain/schema';
import type { NotificationBindingStore } from '../notifications/types';

export type StorageAdapter = {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
};

export type { NotificationBindingStore };
