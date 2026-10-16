import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  BLINK_NOTIFICATION_KIND,
  type NativeNotificationAdapter,
  type NativeNotificationPermission,
  type NativeNotificationResponse,
} from './types';

let foregroundHandlerConfigured = false;

function permissionFrom(status: Notifications.NotificationPermissionsStatus): NativeNotificationPermission {
  switch (status.ios?.status) {
    case Notifications.IosAuthorizationStatus.AUTHORIZED:
      return 'granted';
    case Notifications.IosAuthorizationStatus.PROVISIONAL:
      return 'provisional';
    case Notifications.IosAuthorizationStatus.EPHEMERAL:
      return 'ephemeral';
    case Notifications.IosAuthorizationStatus.DENIED:
      return 'denied';
    case Notifications.IosAuthorizationStatus.NOT_DETERMINED:
      return 'undetermined';
    default:
      return status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied';
  }
}

function responseFromNotification(notification: Notifications.Notification): NativeNotificationResponse | null {
  const data = notification.request.content.data;
  return data?.kind === BLINK_NOTIFICATION_KIND
    && typeof data.deadlineId === 'string'
    && typeof data.reminderKey === 'string'
    ? {
        notificationId: notification.request.identifier,
        deadlineId: data.deadlineId,
        reminderKey: data.reminderKey,
      }
    : null;
}

export const nativeNotificationAdapter: NativeNotificationAdapter = {
  supported: Platform.OS === 'ios',

  configureForegroundHandler() {
    if (Platform.OS !== 'ios' || foregroundHandlerConfigured) {
      return;
    }
    foregroundHandlerConfigured = true;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const isBlinkReminder = notification.request.content.data?.kind === BLINK_NOTIFICATION_KIND;
        return {
          shouldShowBanner: !isBlinkReminder,
          shouldShowList: !isBlinkReminder,
          shouldPlaySound: !isBlinkReminder,
          shouldSetBadge: false,
        };
      },
    });
  },

  async getPermissionStatus() {
    if (Platform.OS !== 'ios') return 'unsupported';
    return permissionFrom(await Notifications.getPermissionsAsync());
  },

  async requestPermission() {
    if (Platform.OS !== 'ios') return 'unsupported';
    return permissionFrom(await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    }));
  },

  async listScheduled() {
    if (Platform.OS !== 'ios') return [];
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications.flatMap((request) => {
      const data = request.content.data;
      return data?.kind === BLINK_NOTIFICATION_KIND
        && typeof data.deadlineId === 'string'
        && typeof data.reminderKey === 'string'
        ? [{
            notificationId: request.identifier,
            deadlineId: data.deadlineId,
            reminderKey: data.reminderKey,
            ...(request.content.title ? { title: request.content.title } : {}),
          }]
        : [];
    });
  },

  async schedule(input) {
    if (Platform.OS !== 'ios') throw new Error('Native deadline notifications are only supported on iOS.');
    return Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: 'Your deadline reminder is due.',
        sound: 'default',
        data: {
          kind: BLINK_NOTIFICATION_KIND,
          deadlineId: input.deadlineId,
          reminderKey: input.reminderKey,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.reminderAt,
      },
    });
  },

  async cancel(notificationId) {
    if (Platform.OS === 'ios') {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
  },

  getLastResponse() {
    if (Platform.OS !== 'ios') return null;
    const response = Notifications.getLastNotificationResponse();
    return response ? responseFromNotification(response.notification) : null;
  },

  clearLastResponse() {
    if (Platform.OS === 'ios') {
      Notifications.clearLastNotificationResponse();
    }
  },

  subscribeToResponses(listener) {
    if (Platform.OS !== 'ios') return () => undefined;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const parsed = responseFromNotification(response.notification);
      if (parsed) listener(parsed);
    });
    return () => subscription.remove();
  },
};
