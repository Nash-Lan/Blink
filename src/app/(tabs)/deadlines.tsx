import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { Deadline } from '../../domain/schema';
import { bucketDeadline, sortDeadlines } from '../../domain/time';
import { EditRecordSheet } from '../../components/EditRecordSheet';
import { DeadlineRow, EmptyState, Section } from '../../components/Rows';
import { Screen } from '../../components/Screen';
import { UndoCompletionBanner } from '../../components/UndoCompletionBanner';
import { useBlink } from '../../state/BlinkProvider';

export default function DeadlinesScreen() {
  const { deadlines, visualFor, toggleDeadline, deleteDeadline } = useBlink();
  const { deadlineId, notificationId } = useLocalSearchParams<{ deadlineId?: string; notificationId?: string }>();
  const [editing, setEditing] = useState<Deadline | null>(null);
  const consumedNotificationRef = useRef<string | null>(null);
  const groups = useMemo(() => ({
    overdue: deadlines.filter((item) => bucketDeadline(item) === 'overdue').sort(sortDeadlines),
    today: deadlines.filter((item) => bucketDeadline(item) === 'today').sort(sortDeadlines),
    future: deadlines.filter((item) => bucketDeadline(item) === 'future').sort(sortDeadlines),
    completed: deadlines.filter((item) => bucketDeadline(item) === 'completed').sort(sortDeadlines),
  }), [deadlines]);

  useEffect(() => {
    if (!notificationId || consumedNotificationRef.current === notificationId) return;
    consumedNotificationRef.current = notificationId;
    setEditing(deadlines.find((item) => item.id === deadlineId) ?? null);
  }, [deadlineId, deadlines, notificationId]);

  return (
    <Screen title="Deadlines" subtitle={`${deadlines.length} tasks`}>
      <UndoCompletionBanner />
      {deadlines.length === 0 ? <EmptyState title="No DDL yet" body="Create a deadline with a date and Blink will keep it visible." /> : null}
      <DeadlineSection title="Overdue" items={groups.overdue} />
      <DeadlineSection title="Today" items={groups.today} />
      <DeadlineSection title="Future" items={groups.future} />
      <DeadlineSection title="Completed" items={groups.completed} />
      <EditRecordSheet deadline={editing} onClose={() => setEditing(null)} />
    </Screen>
  );

  function DeadlineSection({ title, items }: { title: string; items: typeof deadlines }) {
    if (items.length === 0) {
      return null;
    }
    return (
      <Section title={title}>
        {items.map((deadline) => (
          <DeadlineRow
            key={deadline.id}
            deadline={deadline}
            visual={visualFor(deadline.id)}
            onEdit={() => setEditing(deadline)}
            onToggle={() => void toggleDeadline(deadline.id)}
            onDelete={() => void deleteDeadline(deadline.id)}
          />
        ))}
      </Section>
    );
  }
}
