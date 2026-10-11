import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type TextInputChangeEventData } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBlink } from '../state/BlinkProvider';
import { endOfLocalDay } from '../domain/time';
import { usePalette } from '../theme/usePalette';

type Props = {
  visible: boolean;
  onClose(): void;
};

type Mode = 'note' | 'deadline';

export function QuickCreateSheet({ visible, onClose }: Props) {
  const palette = usePalette();
  const { data, saveDraft, createNote, createDeadline } = useBlink();
  const [mode, setMode] = useState<Mode>(data.settings.draftMode);
  const [text, setText] = useState(data.settings.draftText);
  const [dateText, setDateText] = useState(formatDateInput(new Date()));
  const [timeText, setTimeText] = useState('23:59');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const wasVisibleRef = useRef(false);
  const syncText = (value: string) => setText(value);
  const syncTextEvent = (event: NativeSyntheticEvent<TextInputChangeEventData>) => setText(event.nativeEvent.text);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setMode(data.settings.draftMode);
      setText(data.settings.draftText);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    wasVisibleRef.current = visible;
  }, [visible, data.settings.draftMode, data.settings.draftText]);

  useEffect(() => {
    if (visible) {
      const timeout = setTimeout(() => saveDraft(text, mode), 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [text, mode, saveDraft, visible]);

  const canSave = text.trim().length > 0 && !saving;
  const dueDate = useMemo(() => parseLocalDateTime(dateText, timeText), [dateText, timeText]);

  async function save() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      console.info('[Blink save] quick-create.press', { mode, textLength: text.trim().length });
      if (mode === 'note') {
        await createNote(text.trim(), parseTags(text));
      } else {
        await createDeadline({ title: text.trim(), dueDate: dueDate ?? endOfLocalDay(new Date()) });
      }
      setText('');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Record could not be saved.';
      console.error('[Blink save] quick-create.failed', { mode, message });
      setErrorMessage(message);
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetHost}>
        <View style={[styles.sheet, { backgroundColor: palette.card }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>New Blink</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Save" disabled={!canSave} onPress={save} style={[styles.saveButton, { opacity: canSave ? 1 : 0.45 }]}>
              <Text style={[styles.saveText, { color: palette.blue }]}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
          <View style={[styles.segment, { backgroundColor: palette.fill }]}>
            <Segment label="Note" icon="document-text-outline" active={mode === 'note'} onPress={() => setMode('note')} />
            <Segment label="DDL" icon="flag-outline" active={mode === 'deadline'} onPress={() => setMode('deadline')} />
          </View>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={syncText}
            onChange={syncTextEvent}
            placeholder={mode === 'note' ? 'Capture a thought...' : 'What is due?'}
            placeholderTextColor={palette.secondaryText}
            multiline
            style={[styles.input, { color: palette.text, backgroundColor: palette.grouped }]}
          />
          {mode === 'deadline' ? (
            <View style={styles.dateRow}>
              <View style={[styles.dateField, { backgroundColor: palette.grouped }]}>
                <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>Date</Text>
                <TextInput value={dateText} onChangeText={setDateText} style={[styles.fieldInput, { color: palette.text }]} placeholder="YYYY-MM-DD" />
              </View>
              <View style={[styles.dateField, { backgroundColor: palette.grouped }]}>
                <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>Time</Text>
                <TextInput value={timeText} onChangeText={setTimeText} style={[styles.fieldInput, { color: palette.text }]} placeholder="23:59" />
              </View>
            </View>
          ) : null}
          {errorMessage ? <Text style={[styles.error, { color: palette.red }]}>{errorMessage}</Text> : null}
          <Text style={[styles.hint, { color: palette.secondaryText }]}>
            {data.settings.aiEnabled ? 'Saved locally first. Visual AI runs after save.' : 'AI is off. Local capture still works.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Segment({ label, icon, active, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress(): void }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} style={[styles.segmentItem, active && { backgroundColor: palette.card }]}>
      <Ionicons name={icon} size={16} color={active ? palette.blue : palette.secondaryText} />
      <Text style={[styles.segmentText, { color: active ? palette.text : palette.secondaryText }]}>{label}</Text>
    </Pressable>
  );
}

function parseTags(value: string): string[] {
  const matches = value.match(/#[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(matches.map((tag) => tag.slice(1)))];
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  sheetHost: {
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
    marginBottom: 2,
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
  saveButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
  },
  segment: {
    height: 38,
    borderRadius: 10,
    padding: 3,
    flexDirection: 'row',
  },
  segmentItem: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 120,
    maxHeight: 220,
    borderRadius: 14,
    padding: 14,
    fontSize: 17,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldInput: {
    fontSize: 17,
    paddingVertical: 4,
  },
  hint: {
    fontSize: 13,
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
  },
});
