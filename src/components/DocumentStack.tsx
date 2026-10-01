import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { DocumentCard } from '@/components/DocumentCard';
import { PressableScale } from '@/components/ui';
import { groupByKind, type VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

export function DocumentStack({
  name,
  documents,
  categories = [],
}: {
  name: string;
  documents: VaultDocument[];
  categories?: string[];
}) {
  const [open, setOpen] = useState(false);
  const groups = groupByKind(documents, categories);
  if (documents.length === 0) return null;

  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        <PressableScale
          accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${name}`}
          onPress={() => setOpen((value) => !value)}
          style={styles.identity}
        >
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <MemberAvatar name={name} size={42} />
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
        </PressableScale>
        <Text style={styles.count}>{documents.length}</Text>
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
  const [width, setWidth] = useState(0);
  const count = documents.length;
  const cardWidth = width > 0 ? Math.max(220, Math.round(width * 0.84)) : 280;
  if (count === 0) return null;

  return (
    <View
      style={styles.category}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
    >
      <View style={styles.categoryHead}>
        <PressableScale
          accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${label}`}
          onPress={() => setOpen((value) => !value)}
          style={styles.identity}
        >
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <CategoryAvatar kind={kind} size={28} />
          <Text numberOfLines={1} style={styles.categoryName}>{label}</Text>
        </PressableScale>
        <Text style={styles.count}>{count}</Text>
      </View>
      {open ? (
        <ScrollView
          horizontal
          decelerationRate="fast"
          disableIntervalMomentum
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={cardWidth + 12}
          contentContainerStyle={styles.carousel}
        >
          {documents.map((doc) => (
            <View key={doc.id} style={{ width: cardWidth }}>
              <DocumentCard carousel doc={doc} showFile />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { width: '100%', marginBottom: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 26, flex: 1, minWidth: 0 },
  count: { color: theme.gold, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.4, marginLeft: 12 },
  category: { width: '100%', paddingLeft: 8, marginBottom: 6 },
  categoryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  chevron: { color: theme.gold, fontFamily: font.semibold, fontSize: 14, width: 14 },
  categoryName: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
    minWidth: 0,
  },
  carousel: { gap: 12, paddingRight: 4 },
});
