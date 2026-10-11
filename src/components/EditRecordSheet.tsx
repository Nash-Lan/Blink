import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputChangeEventData } from 'react-native';
import type { Deadline, Note } from '../domain/schema';
import { useBlink } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';

type Props = {
  note?: Note | null;
  deadline?: Deadline | null;
  onClose(): void;
};

export function EditRecordSheet({ note, deadline, onClose }: Props) {
  const palette = usePalette();
  const { updateNote, updateDeadline } = useBlink();
  const targetId = note?.id ?? deadline?.id ?? null;
  const initialForm = useMemo(() => {
    if (note) {
      return { text: note.body, dateText: '', timeText: '' };
    }
    if (deadline) {
      const due = new Date(deadline.dueAt);
      return {
        text: deadline.title,
        dateText: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`,
        timeText: `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`,
      };
    }
    return { text: '', dateText: '', timeText: '' };
  }, [note, deadline]);
  const [draft, setDraft] = useState<{ targetId: string; text: string; dateText: string; timeText: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visible = Boolean(note || deadline);
  const form = targetId && draft?.targetId === targetId ? draft : { targetId: targetId ?? '', ...initialForm };
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
    setSaving(true);
    setErrorMessage(null);
    try {
      console.info('[Blink save] edit.press', { type: note ? 'note' : 'deadline', textLength: form.text.trim().length });
      if (note) {
        await updateNote(note.id, { title: firstLine(form.text), body: form.text });
      }
      if (deadline) {
        const dueAt = parseLocalDateTime(form.dateText, form.timeText)?.toISOString();
        await updateDeadline(deadline.id, { title: form.text.trim(), ...(dueAt ? { dueAt } : {}) });
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
          <TextInput
            value={form.text}
            onChangeText={syncText}
            onChange={syncTextEvent}
            multiline={Boolean(note)}
            style={[styles.input, note && styles.noteInput, { color: palette.text, backgroundColor: palette.grouped }]}
          />
          {deadline ? (
            <View style={styles.dateRow}>
              <TextInput value={form.dateText} onChangeText={(dateText) => setForm({ dateText })} style={[styles.dateInput, { color: palette.text, backgroundColor: palette.grouped }]} />
              <TextInput value={form.timeText} onChangeText={(timeText) => setForm({ timeText })} style={[styles.dateInput, { color: palette.text, backgroundColor: palette.grouped }]} />
            </View>
          ) : null}
          {errorMessage ? <Text style={[styles.error, { color: palette.red }]}>{errorMessage}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Untitled';
}

function parseLocalDateTime(dateText: string, timeText: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const time = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!match || !time) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(time[1]), Number(time[2]), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 14,
  },
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
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
  },
});
