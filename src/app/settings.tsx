import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBlink } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';

export default function SettingsScreen() {
  const palette = usePalette();
  const { data, updateSettings, backup, restore } = useBlink();
  const [restoreText, setRestoreText] = useState('');
  const [backupText, setBackupText] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);

  async function restoreBackup() {
    try {
      await restore(restoreText);
      setRestoreText('');
      Alert.alert('Restored', 'Backup imported successfully.');
    } catch (error) {
      Alert.alert('Restore rejected', error instanceof Error ? error.message : 'Backup is invalid.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={26} color={palette.blue} />
        </Pressable>
        <Text style={[styles.title, { color: palette.text }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { backgroundColor: palette.card }]}>
          <SettingRow
            title="Visual AI"
            body="Analyze new notes and deadlines after local save. Real mode sends record text to DeepSeek through your configured adapter."
            value={data.settings.aiEnabled}
            onValueChange={(value) => {
              if (value && !data.settings.aiMockMode && !data.settings.aiConsentGranted) {
                setShowPrivacy(true);
                return;
              }
              void updateSettings({ aiEnabled: value });
            }}
          />
          <SettingRow title="Mock AI mode" body="Use local deterministic icons and Mermaid samples for testing without a key." value={data.settings.aiMockMode} onValueChange={(value) => void updateSettings({ aiMockMode: value })} />
          {showPrivacy || (!data.settings.aiMockMode && !data.settings.aiConsentGranted) ? (
            <View style={[styles.privacyBox, { backgroundColor: palette.fill }]}>
              <Text style={[styles.label, { color: palette.text }]}>DeepSeek Privacy</Text>
              <Text style={[styles.body, { color: palette.secondaryText }]}>
                Real Visual AI sends note and DDL text to DeepSeek for icon selection. Local records work without AI. You can keep Mock AI enabled, turn AI off, or prevent individual records from AI analysis later.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enable real Visual AI"
                style={[styles.action, { backgroundColor: palette.card }]}
                onPress={() => void updateSettings({ aiConsentGranted: true, aiEnabled: true })}
              >
                <Text style={[styles.actionText, { color: palette.blue }]}>Enable Real AI</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.modelRow, { borderTopColor: palette.separator }]}>
            <Text style={[styles.label, { color: palette.text }]}>DeepSeek model</Text>
            <TextInput value={data.settings.deepSeekModel} onChangeText={(deepSeekModel) => void updateSettings({ deepSeekModel })} style={[styles.modelInput, { color: palette.text, backgroundColor: palette.fill }]} />
          </View>
          <View style={[styles.modelRow, { borderTopColor: palette.separator }]}>
            <Text style={[styles.label, { color: palette.text }]}>Web proxy URL</Text>
            <TextInput value={data.settings.deepSeekProxyUrl} onChangeText={(deepSeekProxyUrl) => void updateSettings({ deepSeekProxyUrl })} style={[styles.modelInput, { color: palette.text, backgroundColor: palette.fill }]} />
          </View>
        </View>
        <View style={[styles.group, { backgroundColor: palette.card }]}>
          <Text style={[styles.label, { color: palette.text }]}>Backup</Text>
          <Pressable style={[styles.action, { backgroundColor: palette.fill }]} onPress={() => setBackupText(backup())}>
            <Text style={[styles.actionText, { color: palette.blue }]}>Generate JSON Backup</Text>
          </Pressable>
          {backupText ? <TextInput multiline value={backupText} onChangeText={setBackupText} style={[styles.textArea, { color: palette.text, backgroundColor: palette.fill }]} /> : null}
          <Text style={[styles.label, { color: palette.text }]}>Restore JSON</Text>
          <TextInput multiline value={restoreText} onChangeText={setRestoreText} placeholder="Paste backup JSON" placeholderTextColor={palette.secondaryText} style={[styles.textArea, { color: palette.text, backgroundColor: palette.fill }]} />
          <Pressable style={[styles.action, { backgroundColor: palette.fill, opacity: restoreText.trim() ? 1 : 0.5 }]} disabled={!restoreText.trim()} onPress={restoreBackup}>
            <Text style={[styles.actionText, { color: palette.blue }]}>Validate and Restore</Text>
          </Pressable>
        </View>
        <Text style={[styles.footer, { color: palette.secondaryText }]}>
          {Platform.OS === 'web' ? 'Web stores data in IndexedDB. API keys are intentionally not stored in the browser.' : 'Native persistence uses SQLite. Secure key entry is prepared but not verified on iPhone yet.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ title, body, value, onValueChange }: { title: string; body: string; value: boolean; onValueChange(value: boolean): void }) {
  const palette = usePalette();
  return (
    <View style={[styles.settingRow, { borderBottomColor: palette.separator }]}>
      <View style={styles.settingText}>
        <Text style={[styles.label, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.secondaryText }]}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  group: {
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  settingRow: {
    minHeight: 76,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  modelRow: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  privacyBox: {
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  modelInput: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  action: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 120,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
