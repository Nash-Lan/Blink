import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Deadline, Note, VisualAsset } from '../domain/schema';
import { remainingLabel } from '../domain/time';
import { usePalette } from '../theme/usePalette';
import { VisualBadge } from './VisualBadge';

type NoteProps = {
  note: Note;
  visual?: VisualAsset;
  onOpen(): void;
  onEdit(): void;
  onDelete(): void;
};

export function NoteRow({ note, visual, onOpen, onEdit, onDelete }: NoteProps) {
  const palette = usePalette();
  return (
    <View style={[styles.row, { backgroundColor: palette.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open note ${note.title}`} onPress={onOpen} style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>{note.title}</Text>
        <Text style={[styles.body, { color: palette.secondaryText }]} numberOfLines={2}>{note.body}</Text>
        <VisualBadge asset={visual} />
      </Pressable>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit note ${note.title}`} hitSlop={10} onPress={onEdit}>
          <Ionicons name="create-outline" size={20} color={palette.blue} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete note ${note.title}`} hitSlop={10} onPress={onDelete}>
          <Ionicons name="trash-outline" size={20} color={palette.red} />
        </Pressable>
      </View>
    </View>
  );
}

type DeadlineProps = {
  deadline: Deadline;
  visual?: VisualAsset;
  onEdit(): void;
  onToggle(): void;
  onDelete(): void;
};

export function DeadlineRow({ deadline, visual, onEdit, onToggle, onDelete }: DeadlineProps) {
  const palette = usePalette();
  const done = Boolean(deadline.completedAt);
  return (
    <View style={[styles.row, { backgroundColor: palette.card, opacity: done ? 0.62 : 1 }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${done ? 'Reopen' : 'Complete'} deadline ${deadline.title}`} accessibilityState={{ checked: done }} aria-checked={done} onPress={onToggle} hitSlop={10}>
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? palette.green : palette.secondaryText} />
      </Pressable>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: palette.text, textDecorationLine: done ? 'line-through' : 'none' }]} numberOfLines={2}>{deadline.title}</Text>
        <Text style={[styles.body, { color: palette.secondaryText }]}>{formatDue(deadline.dueAt)} · {remainingLabel(deadline)}</Text>
        <VisualBadge asset={visual} />
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit deadline ${deadline.title}`} hitSlop={10} onPress={onEdit}>
          <Ionicons name="create-outline" size={20} color={palette.blue} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete deadline ${deadline.title}`} hitSlop={10} onPress={onDelete}>
          <Ionicons name="trash-outline" size={20} color={palette.red} />
        </Pressable>
      </View>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.empty, { backgroundColor: palette.card }]}>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.body, { color: palette.secondaryText, textAlign: 'center' }]}>{body}</Text>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.secondaryText }]}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function formatDue(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionContent: {
    gap: 10,
  },
  row: {
    minHeight: 72,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowMain: {
    flex: 1,
    gap: 6,
  },
  actions: {
    gap: 14,
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
});
