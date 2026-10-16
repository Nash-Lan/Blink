import { z } from 'zod';

export const BLINK_NOTIFICATION_KIND = 'blink.deadline-reminder';

export type NativeNotificationPermission = 'unsupported' | 'undetermined' | 'denied' | 'granted' | 'provisional' | 'ephemeral';

export const notificationBindingSchema = z.object({
  deadlineId: z.string(),
  notificationId: z.string(),
  reminderKey: z.string(),
});

export const notificationBindingsSchema = z.array(notificationBindingSchema);

export type NotificationBinding = z.infer<typeof notificationBindingSchema>;

export type NativeScheduledNotification = NotificationBinding & {
  /** Current system notification title, when the platform exposes it. */
  title?: string;
};

export type NativeNotificationResponse = NotificationBinding;

export type ScheduleNativeNotificationInput = {
  deadlineId: string;
  reminderKey: string;
  title: string;
  reminderAt: Date;
};

export type NativeNotificationAdapter = {
  supported: boolean;
  configureForegroundHandler(): void;
  getPermissionStatus(): Promise<NativeNotificationPermission>;
  requestPermission(): Promise<NativeNotificationPermission>;
  listScheduled(): Promise<NativeScheduledNotification[]>;
  schedule(input: ScheduleNativeNotificationInput): Promise<string>;
  cancel(notificationId: string): Promise<void>;
  getLastResponse(): NativeNotificationResponse | null;
  clearLastResponse(): void;
  subscribeToResponses(listener: (response: NativeNotificationResponse) => void): () => void;
};

export type NotificationBindingStore = {
  load(): Promise<NotificationBinding[]>;
  save(bindings: NotificationBinding[]): Promise<void>;
};
