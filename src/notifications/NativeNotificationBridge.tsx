import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useBlink } from '../state/BlinkProvider';
import { nativeNotificationAdapter } from './adapter';
import { NotificationResponseConsumer } from './responses';
import type { NativeNotificationResponse } from './types';

export function NativeNotificationBridge() {
  const { ready, deadlines, acknowledgeNativeReminder } = useBlink();
  const deadlinesRef = useRef(deadlines);
  const consumerRef = useRef(new NotificationResponseConsumer());

  useEffect(() => {
    deadlinesRef.current = deadlines;
  }, [deadlines]);

  useEffect(() => {
    if (!ready || !nativeNotificationAdapter.supported) return undefined;
    const consume = (response: NativeNotificationResponse) => {
      const target = consumerRef.current.consume(response, deadlinesRef.current);
      if (!target) return;
      nativeNotificationAdapter.clearLastResponse();
      const navigate = () => {
        router.replace({
          pathname: '/(tabs)/deadlines',
          params: {
            notificationId: target.notificationId,
            ...(target.deadlineId ? { deadlineId: target.deadlineId } : {}),
          },
        });
      };
      // Navigation must remain available when persistence is temporarily unavailable,
      // while consuming the rejection so a notification tap cannot create an unhandled promise.
      void acknowledgeNativeReminder(response.deadlineId, response.reminderKey).then(navigate, navigate);
    };
    const coldStartResponse = nativeNotificationAdapter.getLastResponse();
    if (coldStartResponse) consume(coldStartResponse);
    return nativeNotificationAdapter.subscribeToResponses(consume);
  }, [acknowledgeNativeReminder, ready]);

  return null;
}
