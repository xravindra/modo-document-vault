import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { DocumentCard } from '@/components/DocumentCard';
import { PressableScale, useScreenScroll } from '@/components/ui';
import { groupByKind, type VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

export function DocumentStack({
  name,
  documents,
  categories = [],
  heart = false,
}: {
  name: string;
  documents: VaultDocument[];
  categories?: string[];
  heart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scroll = useScreenScroll();
  const node = useRef<View>(null);
  const groups = groupByKind(documents, categories);
  if (documents.length === 0) return null;

  function reveal() {
    const content = scroll.contentRef.current;
    const target = node.current;
    if (!content || !target) return;
    target.measureLayout(
      content,
      (_x, y) => scroll.scrollTo(y),
      () => undefined,
    );
  }

  return (
    <View ref={node} style={styles.stack}>
      <View style={styles.head}>
        <PressableScale
          accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${name}`}
          onPress={() => {
            setOpen((value) => !value);
            setTimeout(reveal, 60);
          }}
          style={styles.identity}
        >
          {heart ? <Text style={styles.heart}>❤️</Text> : <MemberAvatar name={name} size={44} />}
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <Text style={styles.count}>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</Text>
          </View>
          <Text style={styles.chevron}>{open ? '–' : '+'}</Text>
        </PressableScale>
      </View>
      {open
        ? groups.map((category) => (
            <CategoryStack key={category.kind} documents={category.documents} kind={category.kind} label={category.label} />
          ))
        : null}
    </View>
  );
}

function CategoryStack({ kind, label, documents }: { kind: string; label: string; documents: VaultDocument[] }) {
  const [open, setOpen] = useState(false);
  const scroll = useScreenScroll();
  const node = useRef<View>(null);
  if (documents.length === 0) return null;

  function reveal() {
    const content = scroll.contentRef.current;
    const target = node.current;
    if (!content || !target) return;
    target.measureLayout(
      content,
      (_x, y) => scroll.scrollTo(y),
      () => undefined,
    );
  }

  return (
    <View ref={node} style={styles.category}>
      <View style={styles.categoryHead}>
        <PressableScale
          accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${label}`}
          onPress={() => {
            setOpen((value) => !value);
            setTimeout(reveal, 60);
          }}
          style={styles.identity}
        >
          <CategoryAvatar kind={kind} size={28} />
          <Text numberOfLines={1} style={styles.categoryName}>{label}</Text>
          <Text style={styles.categoryCount}>{documents.length}</Text>
          <Text style={styles.chevronSmall}>{open ? '–' : '+'}</Text>
        </PressableScale>
      </View>
      {open ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {documents.map((doc) => (
            <DocumentCard key={doc.id} carousel doc={doc} showFile />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
    marginBottom: 12,
    borderRadius: 28,
    backgroundColor: theme.inkRaised,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  head: { marginBottom: 8 },
  identity: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityCopy: { flex: 1, minWidth: 0 },
  name: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 24 },
  heart: { fontSize: 28 },
  count: { color: theme.paperFaint, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    lineHeight: 32,
    overflow: 'hidden',
    color: theme.ink,
    backgroundColor: theme.paper,
    fontFamily: font.medium,
    fontSize: 20,
  },
  category: { width: '100%', marginBottom: 8, marginLeft: -4 },
  categoryHead: { marginBottom: 8 },
  chevronSmall: { color: theme.paperDim, fontFamily: font.medium, fontSize: 18, width: 18, textAlign: 'center' },
  categoryName: {
    color: theme.paper,
    fontFamily: font.medium,
    fontSize: 15,
    flex: 1,
    minWidth: 0,
  },
  categoryCount: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 13 },
  row: { gap: 12, paddingRight: 8, paddingBottom: 6, alignItems: 'flex-start' },
});
