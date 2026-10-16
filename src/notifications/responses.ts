import type { Deadline } from '../domain/schema';
import type { NativeNotificationResponse } from './types';

export type NotificationNavigationTarget = {
  deadlineId?: string;
  notificationId: string;
};

export class NotificationResponseConsumer {
  private lastConsumed: string | null = null;

  consume(response: NativeNotificationResponse, deadlines: Deadline[]): NotificationNavigationTarget | null {
    const consumptionKey = `${response.notificationId}:${response.reminderKey}`;
    if (this.lastConsumed === consumptionKey) return null;
    this.lastConsumed = consumptionKey;
    return deadlines.some((item) => item.id === response.deadlineId)
      ? { deadlineId: response.deadlineId, notificationId: response.notificationId }
      : { notificationId: response.notificationId };
  }
}
