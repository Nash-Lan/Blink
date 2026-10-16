import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputChangeEventData } from 'react-native';
import type { Deadline, Note } from '../domain/schema';
import { formatDateInput, formatTimeInput, parseLocalDateTimeStrict } from '../domain/datetime';
import { validateReminderAt } from '../domain/reminders';
import { useBlink } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';
import { DateTimeFields, makeReminderDraft, parseReminderDraft, ReminderFields, type ReminderDraft } from './ReminderFields';

type Props = {
  note?: Note | null;
  deadline?: Deadline | null;
  onClose(): void;
};

type EditForm = {
  targetId: string;
  text: string;
  dateText: string;
  timeText: string;
  reminder: ReminderDraft | null;
  reminderDirty: boolean;
};

export function EditRecordSheet({ note, deadline, onClose }: Props) {
  const palette = usePalette();
  const { data, updateNote, updateDeadline } = useBlink();
  const targetId = note?.id ?? deadline?.id ?? null;
  const initialForm = useMemo(() => {
    if (note) {
      return { text: note.body, dateText: '', timeText: '', reminder: null, reminderDirty: false };
    }
    if (deadline) {
      const due = new Date(deadline.dueAt);
      return {
        text: deadline.title,
        dateText: formatDateInput(due),
        timeText: formatTimeInput(due),
        reminder: makeReminderDraft(due, deadline.reminderAt),
        reminderDirty: false,
      };
    }
    return { text: '', dateText: '', timeText: '', reminder: null, reminderDirty: false };
  }, [note, deadline]);
  const [draft, setDraft] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visible = Boolean(note || deadline);
  const form: EditForm = targetId && draft?.targetId === targetId ? draft : { targetId: targetId ?? '', ...initialForm };
  const parsedFormDue = useMemo(() => parseLocalDateTimeStrict(form.dateText, form.timeText), [form.dateText, form.timeText]);
  const setForm = (patch: Partial<typeof form>) => setDraft({ ...form, ...patch });
  const syncText = (value: string) => setForm({ text: value });
  const syncTextEvent = (event: NativeSyntheticEvent<TextInputChangeEventData>) => setForm({ text: event.nativeEvent.text });

  function close() {
    setDraft(null);
    setErrorMessage(null);
    onClose();
  }

  async function save() {
    if (!form.text.trim() || saving) {
      return;
    }
    let deadlinePatch: { dueAt?: string; reminderAt?: string | null } = {};
    if (deadline) {
      const parsedDue = parseLocalDateTimeStrict(form.dateText, form.timeText);
      if (!parsedDue.ok) {
        setErrorMessage(parsedDue.message);
        return;
      }
      const dueChanged = form.dateText !== formatDateInput(new Date(deadline.dueAt)) || form.timeText !== formatTimeInput(new Date(deadline.dueAt));
      if (dueChanged) {
        deadlinePatch.dueAt = parsedDue.date.toISOString();
      }

      if (!form.reminder) {
        setErrorMessage('Reminder settings are unavailable.');
        return;
      }
      if (form.reminderDirty) {
        const parsedReminder = parseReminderDraft(form.reminder, parsedDue.date);
        if (!parsedReminder.ok) {
          setErrorMessage(parsedReminder.message);
          return;
        }
        const validation = validateReminderAt(parsedReminder.date);
        if (!validation.ok) {
          setErrorMessage(validation.message);
          return;
        }
        deadlinePatch.reminderAt = parsedReminder.date?.toISOString() ?? null;
      } else if (dueChanged && deadline.reminderAt && form.reminder.option !== 'custom') {
        const recalculated = parseReminderDraft(form.reminder, parsedDue.date);
        if (!recalculated.ok) {
          setErrorMessage(recalculated.message);
          return;
        }
        const validation = validateReminderAt(recalculated.date);
        if (!validation.ok) {
          setErrorMessage(validation.message);
          return;
        }
        deadlinePatch.reminderAt = recalculated.date?.toISOString() ?? null;
      }
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      console.info('[Blink save] edit.press', { type: note ? 'note' : 'deadline', textLength: form.text.trim().length });
      if (note) {
        await updateNote(note.id, { title: firstLine(form.text), body: form.text });
      }
      if (deadline) {
        await updateDeadline(deadline.id, { title: form.text.trim(), ...deadlinePatch });
      }
      close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Record could not be saved.';
      console.error('[Blink save] edit.failed', { type: note ? 'note' : 'deadline', message });
      setErrorMessage(message);
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.host}>
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>{note ? 'Edit Note' : 'Edit DDL'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={save} disabled={!form.text.trim() || saving}>
              <Text style={[styles.save, { color: palette.blue, opacity: form.text.trim() && !saving ? 1 : 0.45 }]}>{saving ? 'Saving...' : 'Done'}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <TextInput
              accessibilityLabel={note ? 'Note text' : 'Deadline title'}
              value={form.text}
              onChangeText={syncText}
              onChange={syncTextEvent}
              multiline={Boolean(note)}
              style={[styles.input, note && styles.noteInput, { color: palette.text, backgroundColor: palette.grouped }]}
            />
            {deadline && form.reminder ? (
              <>
                <DateTimeFields label="Due" dateText={form.dateText} timeText={form.timeText} onDateChange={(dateText) => setForm({ dateText })} onTimeChange={(timeText) => setForm({ timeText })} />
                <ReminderFields
                  value={form.reminder}
                  dueAt={parsedFormDue.ok ? parsedFormDue.date : null}
                  completed={Boolean(deadline.completedAt)}
                  systemNotificationsEnabled={Platform.OS === 'ios' && data.settings.nativeNotificationsEnabled}
                  onChange={(reminder) => setForm({ reminder, reminderDirty: true })}
                />
              </>
            ) : null}
            {errorMessage ? <Text style={[styles.error, { color: palette.red }]}>{errorMessage}</Text> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Untitled';
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  host: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
  },
  scroll: { flexGrow: 0 },
  content: { gap: 14, paddingBottom: 28 },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C7C7CC',
  },
  header: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  save: {
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    padding: 14,
    fontSize: 17,
  },
  noteInput: {
    minHeight: 180,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
  },
});
