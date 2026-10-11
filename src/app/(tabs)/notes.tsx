import { useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import type { Note } from '../../domain/schema';
import { EditRecordSheet } from '../../components/EditRecordSheet';
import { EmptyState, NoteRow, Section } from '../../components/Rows';
import { Screen } from '../../components/Screen';
import { useBlink } from '../../state/BlinkProvider';
import { usePalette } from '../../theme/usePalette';

export default function NotesScreen() {
  const palette = usePalette();
  const { notes, visualFor, deleteNote } = useBlink();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return notes;
    }
    return notes.filter((note) => `${note.title}\n${note.body}\n${note.tags.join(' ')}`.toLowerCase().includes(needle));
  }, [notes, query]);

  return (
    <Screen title="Notes" subtitle={`${notes.length} saved`}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search notes"
        placeholderTextColor={palette.secondaryText}
        style={[styles.search, { backgroundColor: palette.card, color: palette.text }]}
      />
      {filtered.length === 0 ? (
        <EmptyState title={query ? 'No matches' : 'No notes yet'} body="Use the plus button to capture a blink-fast thought." />
      ) : (
        <Section title="All Notes">
          {filtered.map((note) => (
            <NoteRow key={note.id} note={note} visual={visualFor(note.id)} onOpen={() => router.push(`/note/${note.id}`)} onEdit={() => setEditing(note)} onDelete={() => void deleteNote(note.id)} />
          ))}
        </Section>
      )}
      <EditRecordSheet note={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 17,
  },
});
