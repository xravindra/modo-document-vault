import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { PersonIcon } from '@/components/Avatar';
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
      <View style={styles.list}>
        {people.map((person, index) => {
          const on = person.name === chosen;
          const total = person.documents.length;
          return (
            <View key={person.name}>
              <PressableScale
                accessibilityLabel={`${person.name}, ${total} documents`}
                onPress={() => setChosen(on ? null : person.name)}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
              >
                <PersonIcon name={person.name} selected={on} size={44} />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={[styles.name, on ? styles.nameOn : null]}>
                    {person.name}
                  </Text>
                  <Text style={styles.count}>{total === 0 ? 'No documents yet' : `${total} ${total === 1 ? 'document' : 'documents'}`}</Text>
                </View>
                {total > 0 ? <Text style={[styles.badge, on ? styles.badgeOn : null]}>{total}</Text> : null}
                <View style={on ? styles.chevronOpen : null}>
                  <Icon color={on ? theme.gold : theme.paperFaint} name="chevron" size={18} />
                </View>
              </PressableScale>
              {on && selected ? (
                <View style={styles.shelf}>
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
            </View>
          );
        })}
        <PressableScale accessibilityLabel="Add a document for someone new" onPress={() => router.push('/add' as Href)} style={[styles.row, styles.rowDivider]}>
          <View style={styles.addMark}>
            <Icon color={theme.gold} name="plus" size={22} weight={2.2} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.name, styles.nameOn]}>Add someone</Text>
            <Text style={styles.count}>File a document under a new name</Text>
          </View>
        </PressableScale>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.paper, fontFamily: font.display, fontSize: 32, lineHeight: 38 },
  list: {
    marginTop: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.line },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  nameOn: { color: theme.gold },
  count: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  badge: {
    minWidth: 28,
    textAlign: 'center',
    color: theme.paperDim,
    fontFamily: font.semibold,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: theme.inkSoft,
  },
  badgeOn: { color: theme.ink, backgroundColor: theme.gold },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  addMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(180, 83, 26, 0.45)',
  },
  shelf: { paddingHorizontal: 14, paddingBottom: 16, backgroundColor: theme.ink, borderTopWidth: 1, borderTopColor: theme.line },
  empty: { alignItems: 'flex-start', gap: 14, paddingTop: 16 },
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
