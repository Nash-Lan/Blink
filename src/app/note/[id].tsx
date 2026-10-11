import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MermaidRenderer } from '../../components/MermaidRenderer';
import { VisualBadge } from '../../components/VisualBadge';
import { sanitizeMermaid } from '../../domain/ai';
import { useBlink } from '../../state/BlinkProvider';
import { usePalette } from '../../theme/usePalette';

export default function NoteDetailScreen() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, visualFor, data, saveMermaidVisual, hideVisual, regenerateVisual } = useBlink();
  const note = notes.find((item) => item.id === id);
  const visual = id ? visualFor(id) : undefined;
  const jobs = data.aiJobs.filter((job) => job.recordId === id);
  const [graphDraft, setGraphDraft] = useState<{ visualId: string; editingSource: string; previewSource: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);

  const mermaidVisual = visual?.kind === 'mermaid' ? visual : null;
  const activeGraphDraft = mermaidVisual && graphDraft?.visualId === mermaidVisual.id
    ? graphDraft
    : mermaidVisual ? { visualId: mermaidVisual.id, editingSource: mermaidVisual.definition, previewSource: mermaidVisual.definition } : null;
  const latestJob = useMemo(() => jobs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0], [jobs]);

  if (!note) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.text }}>Note not found.</Text>
      </SafeAreaView>
    );
  }

  async function saveGraph() {
    if (!mermaidVisual) {
      return;
    }
    try {
      const nextSource = activeGraphDraft?.editingSource ?? mermaidVisual.definition;
      sanitizeMermaid(nextSource);
      await saveMermaidVisual(mermaidVisual.id, nextSource);
      setGraphDraft({ visualId: mermaidVisual.id, editingSource: nextSource, previewSource: nextSource });
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mermaid source is invalid.';
      setErrorMessage(message);
      Alert.alert('Graph not saved', message);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={palette.blue} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Note</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <Text style={[styles.title, { color: palette.text }]}>{note.title}</Text>
          <Text style={[styles.body, { color: palette.secondaryText }]}>{note.body}</Text>
          {visual?.kind === 'icon' ? <VisualBadge asset={visual} /> : null}
        </View>

        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>AI Graph</Text>
            {latestJob ? <Text style={[styles.status, { color: palette.secondaryText }]}>{latestJob.status}</Text> : null}
          </View>
          {mermaidVisual ? (
            <>
              <MermaidRenderer definition={mermaidVisual.definition} onPress={() => setExpanded(true)} />
              <View style={styles.toolbar}>
                <Action label="Regenerate" icon="sparkles-outline" onPress={() => void regenerateVisual(note.id)} />
                <Action label="Hide" icon="eye-off-outline" onPress={() => void hideVisual(mermaidVisual.id)} />
              </View>
              <Text style={[styles.label, { color: palette.secondaryText }]}>Mermaid source</Text>
              <TextInput
                accessibilityLabel="Mermaid source"
                multiline
                value={activeGraphDraft?.editingSource ?? ''}
                onChangeText={(value) => {
                  setGraphDraft({
                    visualId: mermaidVisual.id,
                    editingSource: value,
                    previewSource: value,
                  });
                }}
                style={[styles.sourceInput, { color: palette.text, backgroundColor: palette.fill }]}
              />
              {errorMessage ? <Text style={[styles.error, { color: palette.red }]}>{errorMessage}</Text> : null}
              <View style={styles.toolbar}>
                <Action
                  label="Preview"
                  icon="play-outline"
                  onPress={() => setGraphDraft({
                    visualId: mermaidVisual.id,
                    editingSource: activeGraphDraft?.editingSource ?? mermaidVisual.definition,
                    previewSource: activeGraphDraft?.editingSource ?? mermaidVisual.definition,
                  })}
                />
                <Action label="Save" icon="checkmark-outline" onPress={() => void saveGraph()} />
              </View>
              <Text style={[styles.label, { color: palette.secondaryText }]}>Preview</Text>
              <MermaidRenderer definition={activeGraphDraft?.previewSource ?? mermaidVisual.definition} />
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: palette.secondaryText }]}>
                No flowchart is attached. Ordinary notes may only receive an icon; process-like notes can generate Mermaid.
              </Text>
              <Action label="Regenerate" icon="sparkles-outline" onPress={() => void regenerateVisual(note.id)} />
            </>
          )}
        </View>
      </ScrollView>
      <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}>
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close graph" onPress={() => setExpanded(false)}>
              <Ionicons name="chevron-down" size={28} color={palette.blue} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: palette.text }]}>Graph</Text>
            <View style={styles.zoomControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
                <Ionicons name="remove-circle-outline" size={24} color={palette.blue} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((value) => Math.min(2, value + 0.25))}>
                <Ionicons name="add-circle-outline" size={24} color={palette.blue} />
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.fullGraph}>
            {mermaidVisual ? <MermaidRenderer definition={mermaidVisual.definition} zoom={zoom} expanded /> : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Action({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress(): void }) {
  const palette = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: palette.fill, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <Ionicons name={icon} size={16} color={palette.blue} />
      <Text style={[styles.actionText, { color: palette.blue }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  action: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sourceInput: {
    minHeight: 160,
    borderRadius: 14,
    padding: 12,
    fontFamily: Platform.select({ web: 'monospace', default: undefined }),
    fontSize: 13,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 13,
    fontWeight: '700',
  },
  zoomControls: {
    flexDirection: 'row',
    gap: 12,
  },
  fullGraph: {
    padding: 16,
    minHeight: '100%',
  },
});
