import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme/usePalette';

type Props = {
  definition: string;
  zoom?: number;
  expanded?: boolean;
  onPress?: () => void;
};

export function MermaidRenderer({ definition }: Props) {
  const palette = usePalette();
  return (
    <View style={[styles.box, { backgroundColor: palette.fill }]}>
      <Text style={[styles.title, { color: palette.text }]}>Mermaid graph</Text>
      <Text style={[styles.body, { color: palette.secondaryText }]}>
        Native rendering is reserved for an Expo DOM Component/WebView adapter. The source is saved locally and can render offline on Web.
      </Text>
      <Text style={[styles.source, { color: palette.secondaryText }]} numberOfLines={6}>{definition}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  source: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
