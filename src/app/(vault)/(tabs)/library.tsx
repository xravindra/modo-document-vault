import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocumentCard } from '@/components/DocumentCard';
import { PressableScale } from '@/components/ui';
import { documentPages } from '@/lib/pages';
import { KINDS, type DocKind } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function LibraryScreen() {
  const vault = useVault();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<DocKind | 'all'>('all');

  const documents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vault.documents.filter((doc) => {
      if (kind !== 'all' && doc.kind !== kind) return false;
      if (!needle) return true;
      const haystack = [
        doc.title,
        doc.fileName,
        doc.kind,
        doc.extraction.text,
        ...doc.extraction.fields.map((field) => `${field.label} ${field.value}`),
        ...documentPages(doc).flatMap((page) => [
          page.fileName,
          page.extraction?.text ?? '',
          ...(page.extraction?.fields ?? []).map((field) => `${field.label} ${field.value}`),
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [kind, query, vault.documents]);

  return (
    <View style={styles.root}>
      <View style={[styles.column, { paddingTop: insets.top + 18 }]}>
        <Text style={styles.kicker}>Library</Text>
        <Text style={styles.title}>Every sealed file</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles and extracted text"
          placeholderTextColor={theme.paperFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
          accessibilityLabel="Search documents"
        />
        <View style={styles.filters}>
          <PressableScale onPress={() => setKind('all')} style={[styles.chip, kind === 'all' ? styles.chipOn : null]}>
            <Text style={[styles.chipText, kind === 'all' ? styles.chipTextOn : null]}>All</Text>
          </PressableScale>
          {KINDS.map((item) => (
            <PressableScale
              key={item.id}
              onPress={() => setKind(item.id)}
              style={[styles.chip, kind === item.id ? styles.chipOn : null]}
            >
              <Text style={[styles.chipText, kind === item.id ? styles.chipTextOn : null]}>{item.label}</Text>
            </PressableScale>
          ))}
        </View>
      </View>
      <FlatList
        style={styles.listView}
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 124 }]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {vault.documents.length === 0 ? 'No documents yet.' : 'Nothing matches that search.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <DocumentCard doc={item} />
          </View>
        )}
        initialNumToRender={8}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.ink, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, paddingHorizontal: 22 },
  kicker: { color: theme.gold, fontFamily: font.semibold, letterSpacing: 2, fontSize: 12, textTransform: 'uppercase' },
  title: { color: theme.paper, fontFamily: font.display, fontSize: 36, marginTop: 6, marginBottom: 16 },
  search: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: theme.gold, borderColor: theme.gold },
  chipText: { color: theme.paperDim, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  listView: { width: '100%', maxWidth: 560, flex: 1 },
  listContent: { paddingHorizontal: 22 },
  item: { width: '100%' },
  empty: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, marginTop: 20 },
});
