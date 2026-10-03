import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { CategoryIcon, PersonIcon } from '@/components/Avatar';
import { DocumentStack } from '@/components/DocumentStack';
import { Icon, type IconName } from '@/components/Icon';
import { PlanBanner } from '@/components/PlanBanner';
import { IconButton, PressableScale, Screen, SectionTitle } from '@/components/ui';
import { compareMembers, documentMember } from '@/lib/members';
import { documentPages } from '@/lib/pages';
import { groupByKind, kindLabel } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const vault = useVault();
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('all');
  const [kind, setKind] = useState('all');
  const count = vault.documents.length;
  const needle = query.trim().toLowerCase();

  const people = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of vault.documents) {
      const name = documentMember(doc);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.keys()].sort(compareMembers).map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [vault.documents]);

  const scoped = useMemo(
    () => vault.documents.filter((doc) => person === 'all' || documentMember(doc) === person),
    [person, vault.documents],
  );

  const categories = useMemo(() => groupByKind(scoped, vault.categories), [scoped, vault.categories]);

  const documents = useMemo(() => {
    return [...scoped]
      .filter((doc) => {
        if (kind !== 'all' && doc.kind !== kind) return false;
        if (!needle) return true;
        return [
          doc.title,
          doc.fileName,
          documentMember(doc),
          kindLabel(doc.kind),
          doc.extraction.text,
          ...doc.extraction.fields.map((field) => `${field.label} ${field.value}`),
          ...documentPages(doc).map((page) => page.extraction?.text ?? ''),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [kind, needle, scoped]);

  const filtered = person !== 'all' || kind !== 'all';
  const favourites = !needle && !filtered ? documents.filter((doc) => doc.favourite) : [];
  const listName = needle
    ? `Results for “${query.trim()}”`
    : kind !== 'all'
      ? kindLabel(kind)
      : person !== 'all'
        ? `${person}’s documents`
        : 'Recent';

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.heading}>
          <Text style={styles.hello}>{greeting()}</Text>
          <Text style={styles.title}>Your vault</Text>
        </View>
        <IconButton label="Lock vault" name="lock" onPress={() => void vault.lock()} />
      </View>

      <PlanBanner />

      <View style={styles.searchBox}>
        <Icon color={theme.paperFaint} name="search" size={20} />
        <TextInput
          accessibilityLabel="Search documents"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search names, numbers, or text"
          placeholderTextColor={theme.paperFaint}
          returnKeyType="search"
          style={styles.search}
          value={query}
        />
        {query ? (
          <PressableScale accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
            <Icon color={theme.paperDim} name="close" size={18} />
          </PressableScale>
        ) : null}
      </View>

      {count === 0 ? (
        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>Keep every family document in one safe place</Text>
          <Text style={styles.welcomeBody}>Scan a card, pick a photo, or choose a PDF. Files are encrypted and never leave this phone.</Text>
          <View style={styles.starts}>
            <Start icon="camera" label="Scan" onPress={() => router.push('/add?source=camera' as Href)} />
            <Start icon="image" label="Photo" onPress={() => router.push('/add?source=photos' as Href)} />
            <Start icon="file" label="File" onPress={() => router.push('/add?source=files' as Href)} />
          </View>
          <PressableScale accessibilityLabel="Try the sample passport" onPress={() => router.push('/add?sample=1' as Href)} style={styles.sampleHit}>
            <Text style={styles.sample}>Or try a sample passport</Text>
          </PressableScale>
        </View>
      ) : (
        <>
          {!needle && people.length > 0 ? (
            <>
              <SectionTitle action={{ label: 'See all', onPress: () => router.push('/library' as Href) }}>Family</SectionTitle>
              <ScrollView horizontal contentContainerStyle={styles.people} showsHorizontalScrollIndicator={false}>
                <PersonChip count={count} label="All" on={person === 'all'} onPress={() => setPerson('all')} />
                {people.map((entry) => (
                  <PersonChip
                    key={entry.name}
                    count={entry.count}
                    label={entry.name}
                    name={entry.name}
                    on={person === entry.name}
                    onPress={() => setPerson((current) => (current === entry.name ? 'all' : entry.name))}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {!needle && categories.length > 0 ? (
            <>
              <SectionTitle action={kind !== 'all' ? { label: 'Show all', onPress: () => setKind('all') } : undefined}>
                Categories
              </SectionTitle>
              <ScrollView horizontal contentContainerStyle={styles.people} showsHorizontalScrollIndicator={false}>
                {categories.map((group) => {
                  const on = kind === group.kind;
                  return (
                    <Chip
                      key={group.kind}
                      count={group.documents.length}
                      icon={<CategoryIcon kind={group.kind} selected={on} size={36} />}
                      label={group.label}
                      on={on}
                      onPress={() => setKind(on ? 'all' : group.kind)}
                    />
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <View style={styles.list}>
            {favourites.length > 0 ? <DocumentStack documents={favourites} heart name="Favourites" /> : null}
            {documents.length > 0 ? (
              <DocumentStack documents={documents} name={listName} />
            ) : (
              <View style={styles.none}>
                <Text style={styles.noneTitle}>Nothing found</Text>
                <Text style={styles.noneBody}>Try another word, or clear the filters.</Text>
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

function PersonChip({ name, ...rest }: { label: string; name?: string; count: number; on: boolean; onPress: () => void }) {
  return <Chip {...rest} icon={<PersonIcon name={name} selected={rest.on} size={36} />} />;
}

function Chip({
  label,
  icon,
  count,
  on,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityLabel={`${label}, ${count} documents`} onPress={onPress} style={[styles.person, on ? styles.personOn : null]}>
      {icon}
      <View style={styles.personCopy}>
        <Text numberOfLines={1} style={[styles.personName, on ? styles.personNameOn : null]}>
          {label}
        </Text>
        <Text style={styles.personCount}>{count === 1 ? '1 doc' : `${count} docs`}</Text>
      </View>
    </PressableScale>
  );
}

function Start({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={styles.start}>
      <View style={styles.startIcon}>
        <Icon color={theme.gold} name={icon} size={26} />
      </View>
      <Text style={styles.startLabel}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  heading: { flex: 1, minWidth: 0 },
  hello: { color: theme.paperDim, fontFamily: font.medium, fontSize: 15 },
  title: { color: theme.paper, fontFamily: font.display, fontSize: 32, lineHeight: 38, marginTop: 2 },
  searchBox: {
    marginTop: 20,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    paddingLeft: 14,
    paddingRight: 6,
  },
  search: { flex: 1, minWidth: 0, color: theme.paper, fontFamily: font.body, fontSize: 16, paddingVertical: 14 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  people: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.inkRaised,
    backgroundColor: theme.inkRaised,
  },
  personOn: { borderColor: theme.gold, backgroundColor: 'rgba(180, 83, 26, 0.06)' },
  personCopy: { maxWidth: 120 },
  personName: { color: theme.paper, fontFamily: font.semibold, fontSize: 14 },
  personNameOn: { color: theme.gold },
  personCount: { color: theme.paperDim, fontFamily: font.medium, fontSize: 12 },
  list: { marginTop: 28 },
  none: { paddingVertical: 32, alignItems: 'center' },
  noneTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 18 },
  noneBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, marginTop: 6 },
  welcome: { marginTop: 28, borderRadius: 24, backgroundColor: theme.inkRaised, borderWidth: 1, borderColor: theme.line, padding: 20 },
  welcomeTitle: { color: theme.paper, fontFamily: font.display, fontSize: 24, lineHeight: 30 },
  welcomeBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  starts: { flexDirection: 'row', gap: 10, marginTop: 20 },
  start: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 18, backgroundColor: theme.ink },
  startIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 83, 26, 0.10)',
  },
  startLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  sampleHit: { alignSelf: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center' },
  sample: { color: theme.gold, fontFamily: font.semibold, fontSize: 15 },
});
