import { useState, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FloatingAddButton } from './FloatingAddButton';
import { IconButton } from './IconButton';
import { QuickCreateSheet } from './QuickCreateSheet';
import { usePalette } from '../theme/usePalette';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  onSettings?: () => void;
}>;

export function Screen({ title, subtitle, onSettings, children }: Props) {
  const palette = usePalette();
  const [creating, setCreating] = useState(false);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: palette.secondaryText }]}>{subtitle}</Text> : null}
        </View>
        {onSettings ? <IconButton name="ellipsis-horizontal-circle" label="Settings" onPress={onSettings} /> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <FloatingAddButton onPress={() => setCreating(true)} />
      <QuickCreateSheet visible={creating} onClose={() => setCreating(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: 14,
  },
});
