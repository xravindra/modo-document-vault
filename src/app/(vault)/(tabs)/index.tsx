import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { EveryoneFigure, PersonFigure } from '@/components/Avatar';
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
      {people.length > 0 ? (
        <ScrollView horizontal contentContainerStyle={styles.filters} showsHorizontalScrollIndicator={false}>
          <PressableScale accessibilityLabel="Everyone" onPress={() => setPerson('all')} style={styles.person}>
            <EveryoneFigure selected={person === 'all'} />
            <Text numberOfLines={1} style={[styles.nameText, person === 'all' ? styles.nameOn : null]}>
              All
            </Text>
          </PressableScale>
          {people.map((name) => (
            <PressableScale key={name} accessibilityLabel={name} onPress={() => setPerson(name)} style={styles.person}>
              <PersonFigure name={name} selected={person === name} />
              <Text numberOfLines={1} style={[styles.nameText, person === name ? styles.nameOn : null]}>
                {name}
              </Text>
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
          {favourites.length > 0 && person === 'all' ? <DocumentStack documents={favourites} heart name="Favourites" /> : null}
          <DocumentStack documents={documents} name={person === 'all' ? 'All' : person} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, minWidth: 0 },
  brand: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1.2 },
  lock: {
    marginTop: 8,
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    alignItems: 'center',
  },
  lockText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  title: { color: theme.paper, fontFamily: font.display, fontSize: 36, lineHeight: 40, marginTop: 6 },
  count: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, marginTop: 6 },
  search: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  filters: { flexDirection: 'row', gap: 14, paddingTop: 18, paddingRight: 8 },
  person: { width: 72, alignItems: 'center', gap: 6 },
  nameText: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12, textAlign: 'center', maxWidth: 72 },
  nameOn: { color: theme.gold },
  list: { marginTop: 26 },
  empty: { marginTop: 48 },
  emptyTitle: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 28 },
  emptyBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 16, lineHeight: 24, marginTop: 8 },
  sample: { color: theme.paper, fontFamily: font.semibold, fontSize: 16, marginTop: 20 },
});
