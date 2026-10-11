import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBlink } from '../state/BlinkProvider';
import { usePalette } from '../theme/usePalette';

export function UndoCompletionBanner() {
  const palette = usePalette();
  const { lastCompletedDeadline, undoLastCompletedDeadline } = useBlink();

  if (!lastCompletedDeadline) {
    return null;
  }

  return (
    <View style={[styles.banner, { backgroundColor: palette.card }]}>
      <View style={styles.message}>
        <Ionicons name="checkmark-circle" size={20} color={palette.green} />
        <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
          Completed {lastCompletedDeadline.title}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Undo complete ${lastCompletedDeadline.title}`} hitSlop={10} onPress={() => void undoLastCompletedDeadline()}>
        <Text style={[styles.undo, { color: palette.blue }]}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  message: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  undo: {
    fontSize: 16,
    fontWeight: '700',
  },
});
