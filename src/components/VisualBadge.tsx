import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VisualAsset } from '../domain/schema';
import { usePalette } from '../theme/usePalette';

type Props = {
  asset?: VisualAsset;
};

export function VisualBadge({ asset }: Props) {
  const palette = usePalette();
  if (!asset || asset.kind === 'none') {
    return null;
  }
  if (asset.kind === 'icon') {
    return (
      <View style={[styles.badge, { backgroundColor: palette.fill }]}>
        <Ionicons name={asset.icon as keyof typeof Ionicons.glyphMap} size={16} color={palette.blue} />
        <Text style={[styles.badgeText, { color: palette.secondaryText }]} numberOfLines={1}>{asset.label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: palette.fill }]}>
      <Ionicons name="git-network-outline" size={16} color={palette.blue} />
      <Text style={[styles.badgeText, { color: palette.secondaryText }]} numberOfLines={1}>{asset.kind}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
