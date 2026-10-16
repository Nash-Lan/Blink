import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBlink } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';

export function InAppReminderBanner() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { activeReminder, dismissActiveReminder } = useBlink();

  if (!activeReminder) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 10 }]}>
      <View style={[styles.banner, { backgroundColor: palette.card }]}>
        <Ionicons name="alarm-outline" size={22} color={palette.orange} />
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>DDL reminder</Text>
          <Text style={[styles.body, { color: palette.secondaryText }]} numberOfLines={2}>{activeReminder.title}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss reminder ${activeReminder.title}`} hitSlop={10} onPress={dismissActiveReminder}>
          <Ionicons name="close-circle" size={24} color={palette.secondaryText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 20,
  },
  banner: {
    minHeight: 64,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
});
