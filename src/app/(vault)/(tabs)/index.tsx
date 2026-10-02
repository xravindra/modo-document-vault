import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { DocumentStack } from '@/components/DocumentStack';
import { PressableScale, Screen } from '@/components/ui';
import { compareMembers, documentMember } from '@/lib/members';
import { kindLabel } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function HomeScreen() {
  const vault = useVault();
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('all');
  const count = vault.documents.length;
  const people = useMemo(() => {
    const names = new Set(vault.documents.map((doc) => documentMember(doc)));
    return [...names].sort(compareMembers);
  }, [vault.documents]);
  const documents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...vault.documents]
      .filter((doc) => {
        if (person !== 'all' && documentMember(doc) !== person) return false;
        if (!needle) return true;
        return [doc.title, doc.fileName, documentMember(doc), kindLabel(doc.kind)].join(' ').toLowerCase().includes(needle);
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [person, query, vault.documents]);
  const favourites = documents.filter((doc) => doc.favourite);
  const stacks = useMemo(() => {
    const groups = new Map<string, typeof documents>();
    for (const doc of documents) {
      const name = documentMember(doc);
      const list = groups.get(name) ?? [];
      list.push(doc);
      groups.set(name, list);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => compareMembers(left, right))
      .map(([name, items]) => ({ name, documents: items }));
  }, [documents]);

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.heading}>
          <Text style={styles.brand}>MODO</Text>
          <Text style={styles.title}>Documents</Text>
          <Text style={styles.count}>{count === 0 ? 'Nothing saved yet' : `${count} on this phone`}</Text>
        </View>
        <PressableScale accessibilityLabel="Lock vault" onPress={() => void vault.lock()} style={styles.lock}>
          <Text style={styles.lockText}>Lock</Text>
        </PressableScale>
      </View>
      <TextInput
        accessibilityLabel="Search documents"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Search names or files"
        placeholderTextColor={theme.paperFaint}
        style={styles.search}
        value={query}
      />
      {people.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <PressableScale onPress={() => setPerson('all')} style={[styles.chip, person === 'all' ? styles.chipOn : null]}>
            <Text style={[styles.chipText, person === 'all' ? styles.chipTextOn : null]}>Everyone</Text>
          </PressableScale>
          {people.map((name) => (
            <PressableScale key={name} onPress={() => setPerson(name)} style={[styles.chip, person === name ? styles.chipOn : null]}>
              <Text style={[styles.chipText, person === name ? styles.chipTextOn : null]}>{name}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}
      {documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{count === 0 ? 'Your vault is empty' : 'No matches'}</Text>
          <Text style={styles.emptyBody}>
            {count === 0 ? 'Add a file with the button below. It stays on this phone.' : 'Try a different name.'}
          </Text>
          {count === 0 ? (
            <PressableScale accessibilityLabel="Try the sample passport" onPress={() => router.push('/add?sample=1' as Href)}>
              <Text style={styles.sample}>Try a sample passport</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {favourites.length > 0 ? (
            <DocumentStack categories={vault.categories} documents={favourites} heart name="Favourites" />
          ) : null}
          {stacks.map((stack) => (
            <DocumentStack key={stack.name} categories={vault.categories} documents={stack.documents} name={stack.name} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, minWidth: 0 },
  brand: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 2.4 },
  lock: {
    marginTop: 8,
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    alignItems: 'center',
  },
  lockText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  title: { color: theme.paper, fontFamily: font.display, fontSize: 44, lineHeight: 48, marginTop: 8 },
  count: { color: theme.paperDim, fontFamily: font.body, fontSize: 16, marginTop: 8 },
  search: {
    marginTop: 22,
    borderRadius: 999,
    backgroundColor: theme.inkRaised,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filters: { flexDirection: 'row', gap: 8, marginTop: 16, paddingRight: 8 },
  chip: { borderRadius: 999, backgroundColor: theme.inkRaised, paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { backgroundColor: theme.paper },
  chipText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  chipTextOn: { color: theme.ink },
  list: { marginTop: 22, gap: 4 },
  empty: { marginTop: 48 },
  emptyTitle: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 28 },
  emptyBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 16, lineHeight: 24, marginTop: 8 },
  sample: { color: theme.paper, fontFamily: font.semibold, fontSize: 16, marginTop: 20 },
});
