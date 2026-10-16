import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { formatDateInput, formatTimeInput, parseLocalDateTimeStrict } from '../domain/datetime';
import { inferReminderOption, reminderAtForOption, reminderOptions, type ReminderOption } from '../domain/reminders';
import { usePalette } from '../theme/usePalette';

export type ReminderDraft = {
  enabled: boolean;
  option: Exclude<ReminderOption, 'none'>;
  dateText: string;
  timeText: string;
};

export function makeReminderDraft(dueAt: Date, reminderAt: string | null = null): ReminderDraft {
  const date = reminderAt ? new Date(reminderAt) : dueAt;
  const option = inferReminderOption(dueAt.toISOString(), reminderAt);
  return {
    enabled: Boolean(reminderAt),
    option: option === 'none' ? 'at-due' : option,
    dateText: formatDateInput(date),
    timeText: formatTimeInput(date),
  };
}

export function parseReminderDraft(draft: ReminderDraft, dueAt: Date): { ok: true; date: Date | null } | { ok: false; message: string } {
  if (!draft.enabled) {
    return { ok: true, date: null };
  }
  return draft.option === 'custom'
    ? parseLocalDateTimeStrict(draft.dateText, draft.timeText)
    : { ok: true, date: reminderAtForOption(dueAt, draft.option) };
}

type ReminderProps = {
  value: ReminderDraft;
  dueAt: Date | null;
  completed?: boolean;
  systemNotificationsEnabled?: boolean;
  onChange(value: ReminderDraft): void;
};

export function ReminderFields({ value, dueAt, completed = false, systemNotificationsEnabled = false, onChange }: ReminderProps) {
  const palette = usePalette();
  const preview = dueAt ? parseReminderDraft(value, dueAt) : null;

  function selectOption(option: Exclude<ReminderOption, 'none'>) {
    const current = preview?.ok ? preview.date : null;
    onChange({
      ...value,
      option,
      ...(option === 'custom' && current ? { dateText: formatDateInput(current), timeText: formatTimeInput(current) } : {}),
    });
  }

  return (
    <View style={[styles.reminder, { backgroundColor: palette.grouped }]}>
      <View style={styles.heading}>
        <Text style={[styles.headingText, { color: palette.text }]}>Reminder</Text>
        <Switch accessibilityLabel="Reminder enabled" value={value.enabled} onValueChange={(enabled) => onChange({ ...value, enabled })} trackColor={{ true: palette.blue }} />
      </View>
      {value.enabled ? (
        <>
          <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Reminder timing">
            {reminderOptions.filter((option) => option.value !== 'none' && (option.value !== '10m' || value.option === '10m')).map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: value.option === option.value }}
                aria-checked={value.option === option.value}
                onPress={() => option.value !== 'none' && selectOption(option.value)}
                style={[styles.option, { backgroundColor: value.option === option.value ? palette.blue : palette.fill }]}
              >
                <Text style={[styles.optionText, { color: value.option === option.value ? '#FFFFFF' : palette.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {value.option === 'custom' ? (
            <DateTimeFields
              label="Reminder"
              dateText={value.dateText}
              timeText={value.timeText}
              onDateChange={(dateText) => onChange({ ...value, dateText })}
              onTimeChange={(timeText) => onChange({ ...value, timeText })}
            />
          ) : null}
          <Text style={[styles.hint, { color: palette.secondaryText }]}>
            {preview?.ok && preview.date ? `Remind at ${formatDateInput(preview.date)} ${formatTimeInput(preview.date)} (local time)` : 'Enter a valid date and time to preview the reminder.'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove reminder" onPress={() => onChange({ ...value, enabled: false, option: 'at-due' })} style={styles.remove}>
            <Text style={[styles.removeText, { color: palette.red }]}>Remove reminder</Text>
          </Pressable>
        </>
      ) : null}
      <Text style={[styles.hint, { color: palette.secondaryText }]}>
        {completed
          ? 'Completed deadlines do not show reminders.'
          : value.enabled && systemNotificationsEnabled
            ? 'Shown in Blink and scheduled by iOS when permission allows.'
            : value.enabled
              ? 'Shown while Blink is open. Enable system notifications in Settings for background alerts.'
              : 'Off. No reminder will be scheduled.'}
      </Text>
    </View>
  );
}

type DateTimeProps = {
  label: 'Due' | 'Reminder';
  dateText: string;
  timeText: string;
  onDateChange(value: string): void;
  onTimeChange(value: string): void;
};

export function DateTimeFields({ label, dateText, timeText, onDateChange, onTimeChange }: DateTimeProps) {
  const palette = usePalette();
  return (
    <View style={styles.dateRow}>
      <View style={[styles.dateField, { backgroundColor: palette.grouped }]}>
        <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>{label} date</Text>
        <TextInput accessibilityLabel={`${label} date`} value={dateText} onChangeText={onDateChange} onChange={(event) => onDateChange(event.nativeEvent.text)} autoCorrect={false} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={palette.secondaryText} style={[styles.fieldInput, { color: palette.text }]} />
      </View>
      <View style={[styles.dateField, { backgroundColor: palette.grouped }]}>
        <Text style={[styles.fieldLabel, { color: palette.secondaryText }]}>{label} time</Text>
        <TextInput accessibilityLabel={`${label} time`} value={timeText} onChangeText={onTimeChange} onChange={(event) => onTimeChange(event.nativeEvent.text)} autoCorrect={false} autoCapitalize="none" placeholder="HH:mm" placeholderTextColor={palette.secondaryText} style={[styles.fieldInput, { color: palette.text }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reminder: { borderRadius: 14, padding: 12, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  headingText: { fontSize: 16, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  optionText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  remove: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  removeText: { fontSize: 14, fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateField: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  fieldInput: { fontSize: 17, minHeight: 36, paddingVertical: 4 },
});
