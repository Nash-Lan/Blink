import { describe, expect, it } from 'vitest';
import type { Deadline } from '../domain/schema';
import { NotificationResponseConsumer } from './responses';

const deadline = { id: 'ddl-1' } as Deadline;

describe('notification response routing', () => {
  it('routes a cold-start response to its existing deadline and consumes it once', () => {
    const consumer = new NotificationResponseConsumer();
    const response = { notificationId: 'native-1', deadlineId: 'ddl-1', reminderKey: 'key-1' };
    expect(consumer.consume(response, [deadline])).toEqual({ deadlineId: 'ddl-1', notificationId: 'native-1' });
    expect(consumer.consume(response, [deadline])).toBeNull();
  });

  it('falls back safely to the deadlines page when the record was deleted', () => {
    const consumer = new NotificationResponseConsumer();
    expect(consumer.consume({ notificationId: 'native-2', deadlineId: 'missing', reminderKey: 'key-2' }, []))
      .toEqual({ notificationId: 'native-2' });
  });
});
