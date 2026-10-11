import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import type { Deadline } from '../../domain/schema';
import { bucketDeadline, isSameLocalDay, sortDeadlines } from '../../domain/time';
import { useBlink } from '../../state/BlinkProvider';
import { usePalette } from '../../theme/usePalette';
import { EditRecordSheet } from '../../components/EditRecordSheet';
import { DeadlineRow, EmptyState, Section } from '../../components/Rows';
import { Screen } from '../../components/Screen';
import { UndoCompletionBanner } from '../../components/UndoCompletionBanner';

export default function TodayScreen() {
  const palette = usePalette();
  const { deadlines, visualFor, toggleDeadline, deleteDeadline } = useBlink();
  const [editing, setEditing] = useState<Deadline | null>(null);
  const today = new Date();
  const dueToday = deadlines.filter((item) => !item.completedAt && isSameLocalDay(new Date(item.dueAt), today) && bucketDeadline(item, today) === 'today').sort(sortDeadlines);
  const overdue = deadlines.filter((item) => bucketDeadline(item, today) === 'overdue').sort(sortDeadlines);

  return (
    <Screen
      title="Today"
      subtitle={new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(today)}
      onSettings={() => router.push('/settings')}
    >
      <UndoCompletionBanner />
      {overdue.length === 0 && dueToday.length === 0 ? (
        <EmptyState title="Clear for today" body="No overdue or due-today deadlines. Capture only what matters." />
      ) : null}
      {overdue.length > 0 ? (
        <Section title="Overdue">
          {overdue.map((deadline) => (
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
      ) : null}
      {dueToday.length > 0 ? (
        <Section title="Due Today">
          {dueToday.map((deadline) => (
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
      ) : null}
      <Text style={{ color: palette.secondaryText, fontSize: 12, paddingHorizontal: 4 }}>
        Notes stay out of Today to keep this screen quiet.
      </Text>
      <EditRecordSheet deadline={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}
