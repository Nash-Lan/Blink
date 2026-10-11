import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/usePalette';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
};

export function IconButton({ name, label, onPress }: Props) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: palette.fill, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Ionicons name={name} size={20} color={palette.blue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
