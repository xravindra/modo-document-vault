import { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { DocumentCard } from '@/components/DocumentCard';
import { PressableScale } from '@/components/ui';
import { compareMembers, documentMember } from '@/lib/members';
import { documentPages } from '@/lib/pages';
import { isDocKind, KINDS, groupByKind, kindLabel, type VaultDocument } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function LibraryScreen() {
  const vault = useVault();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  useEffect(() => {
    if (kind === 'all' || isDocKind(kind) || vault.categories.some((name) => name === kind)) return;
    setKind('all');
  }, [kind, vault.categories]);

  const documents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vault.documents.filter((doc) => {
      if (kind !== 'all' && doc.kind !== kind) return false;
      if (!needle) return true;
      const haystack = [
        doc.title,
        doc.fileName,
        doc.kind,
        documentMember(doc),
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

  const sections = useMemo(() => {
    const groups = new Map<string, VaultDocument[]>();
    for (const doc of documents) {
      const name = documentMember(doc);
      const list = groups.get(name) ?? [];
      list.push(doc);
      groups.set(name, list);
    }
    return [...groups.keys()]
      .sort(compareMembers)
      .map((title) => ({
        title,
        data: groupByKind(groups.get(title) ?? [], vault.categories).map((category) => ({
          id: `${title}:${category.kind}`,
          kind: category.kind,
          label: category.label,
          documents: category.documents,
        })),
      }));
  }, [documents, vault.categories]);

  return (
    <View style={styles.root}>
      <View style={[styles.column, { paddingTop: insets.top + 18 }]}>
        <Text style={styles.kicker}>Library</Text>
        <Text style={styles.title}>Every sealed file</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, people, and extracted text"
          placeholderTextColor={theme.paperFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
          accessibilityLabel="Search documents"
        />
        <View style={styles.filters}>
          <PressableScale
            onPress={() => setKind('all')}
            style={[styles.chip, styles.chipPlain, kind === 'all' ? styles.chipOn : null]}
          >
            <Text style={[styles.chipText, kind === 'all' ? styles.chipTextOn : null]}>All</Text>
          </PressableScale>
          {KINDS.map((item) => (
            <PressableScale
              key={item.id}
              onPress={() => setKind(item.id)}
              style={[styles.chip, kind === item.id ? styles.chipOn : null]}
            >
              <CategoryAvatar kind={item.id} size={22} />
              <Text style={[styles.chipText, kind === item.id ? styles.chipTextOn : null]}>{item.label}</Text>
            </PressableScale>
          ))}
          {vault.categories.map((name) => (
            <PressableScale
              key={name}
              onPress={() => setKind(name)}
              style={[styles.chip, kind === name ? styles.chipOn : null]}
            >
              <CategoryAvatar kind={name} size={22} />
              <Text style={[styles.chipText, kind === name ? styles.chipTextOn : null]}>{kindLabel(name)}</Text>
            </PressableScale>
          ))}
        </View>
      </View>
      <SectionList
        style={styles.listView}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 124 }]}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {vault.documents.length === 0 ? 'No documents yet.' : 'Nothing matches that search.'}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionRow}>
            <MemberAvatar name={section.title} size={36} />
            <Text numberOfLines={1} style={styles.section}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.categoryRow}>
              <CategoryAvatar kind={item.kind} size={26} />
              <Text numberOfLines={1} style={styles.category}>{item.label}</Text>
            </View>
            {item.documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
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
  chipPlain: { paddingLeft: 12, paddingVertical: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 5,
  },
  chipOn: { backgroundColor: theme.gold, borderColor: theme.gold },
  chipText: { color: theme.paperDim, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 8 },
  section: { flex: 1, minWidth: 0, color: theme.paper, fontFamily: font.displaySoft, fontSize: 22 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  category: {
    flex: 1,
    minWidth: 0,
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  listView: { width: '100%', maxWidth: 560, flex: 1 },
  listContent: { paddingHorizontal: 22 },
  item: { width: '100%' },
  empty: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, marginTop: 20 },
});
