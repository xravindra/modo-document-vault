import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { PersonFigure } from '@/components/Avatar';
import { DocumentStack } from '@/components/DocumentStack';
import { Icon } from '@/components/Icon';
import { PressableScale, Quiet, Screen } from '@/components/ui';
import { compareMembers, documentMember, sameMember, SELF } from '@/lib/members';
import { groupByKind } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function FamilyScreen() {
  const vault = useVault();
  const people = useMemo(() => {
    const names = new Set<string>([SELF, ...vault.members]);
    for (const doc of vault.documents) names.add(documentMember(doc));
    return [...names].sort(compareMembers).map((name) => ({
      name,
      documents: vault.documents.filter((doc) => sameMember(documentMember(doc), name)),
    }));
  }, [vault.documents, vault.members]);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (chosen && !people.some((person) => person.name === chosen)) setChosen(null);
  }, [chosen, people]);

  const selected = people.find((person) => person.name === chosen) ?? null;
  const groups = useMemo(
    () =>
      selected
        ? groupByKind(
            [...selected.documents].sort((left, right) => right.createdAt - left.createdAt),
            vault.categories,
          )
        : [],
    [selected, vault.categories],
  );

  return (
    <Screen>
      <Text style={styles.title}>Family</Text>
      <Quiet>Each person keeps their own shelf. Tap someone to see what is filed for them.</Quiet>
      <View style={styles.grid}>
        {people.map((person) => {
          const on = person.name === chosen;
          return (
            <PressableScale
              key={person.name}
              accessibilityLabel={`${person.name}, ${person.documents.length} documents`}
              onPress={() => setChosen(on ? null : person.name)}
              style={[styles.card, on ? styles.cardOn : null]}
            >
              <PersonFigure name={person.name} selected={on} size={56} />
              <View style={styles.cardCopy}>
                <Text numberOfLines={1} style={styles.name}>
                  {person.name}
                </Text>
                <Text style={styles.count}>
                  {person.documents.length === 0
                    ? 'No documents'
                    : `${person.documents.length} ${person.documents.length === 1 ? 'document' : 'documents'}`}
                </Text>
              </View>
            </PressableScale>
          );
        })}
        <PressableScale accessibilityLabel="Add a document for someone new" onPress={() => router.push('/add' as Href)} style={[styles.card, styles.addCard]}>
          <View style={styles.addMark}>
            <Icon color={theme.gold} name="plus" size={24} weight={2.2} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.name}>Add</Text>
            <Text style={styles.count}>A document for anyone</Text>
          </View>
        </PressableScale>
      </View>

      {selected ? (
        <View style={styles.shelf}>
          <Text style={styles.shelfTitle}>{selected.name}</Text>
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nothing filed for {selected.name} yet.</Text>
              <PressableScale accessibilityLabel={`Add a document for ${selected.name}`} onPress={() => router.push('/add' as Href)} style={styles.emptyButton}>
                <Icon color={theme.ink} name="plus" size={18} weight={2.2} />
                <Text style={styles.emptyButtonText}>Add a document</Text>
              </PressableScale>
            </View>
          ) : (
            groups.map((group) => <DocumentStack key={group.kind} documents={group.documents} name={group.label} />)
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.paper, fontFamily: font.display, fontSize: 32, lineHeight: 38 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  card: {
    width: '48%',
    flexGrow: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    padding: 12,
  },
  cardOn: { borderColor: theme.gold, backgroundColor: 'rgba(180, 83, 26, 0.08)' },
  cardCopy: { flex: 1, minWidth: 0 },
  name: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  count: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  addCard: { borderStyle: 'dashed' },
  addMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 83, 26, 0.10)',
  },
  shelf: { marginTop: 28 },
  shelfTitle: { color: theme.paper, fontFamily: font.display, fontSize: 24, marginBottom: 14 },
  empty: { alignItems: 'flex-start', gap: 14 },
  emptyText: { color: theme.paperDim, fontFamily: font.body, fontSize: 15 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: theme.gold,
  },
  emptyButtonText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
});
