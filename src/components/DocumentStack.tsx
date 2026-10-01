import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { DocumentCard } from '@/components/DocumentCard';
import { PressableScale } from '@/components/ui';
import { groupByKind, type VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

const STEP = 8;

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
  const [all, setAll] = useState(false);
  const latest = documents[0];
  const depth = Math.min(Math.max(documents.length - 1, 1), 3);
  const count = documents.length;
  if (!latest) return null;

  return (
    <View style={styles.category}>
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
        {open && count > 1 ? (
          <PressableScale
            accessibilityLabel={all ? `Show ${label} as a stack` : `Show every file in ${label}`}
            onPress={() => setAll((value) => !value)}
          >
            <Text style={styles.count}>{all ? 'Stack' : 'All'}</Text>
          </PressableScale>
        ) : (
          <Text style={styles.count}>{count}</Text>
        )}
      </View>
      {open ? (
        all ? (
          documents.map((doc) => <DocumentCard key={doc.id} doc={doc} showFile swipe />)
        ) : (
          <View style={styles.pile}>
            <View style={{ height: depth * STEP }} />
            <View style={styles.front}>
              {Array.from({ length: depth }, (_, index) => (
                <View
                  key={index}
                  pointerEvents="none"
                  style={[
                    styles.sheet,
                    {
                      top: -((depth - index) * STEP),
                      left: index * STEP,
                      right: (depth - index) * STEP,
                      backgroundColor: index === depth - 1 ? theme.inkSoft : theme.inkRaised,
                    },
                  ]}
                />
              ))}
              <View style={{ marginLeft: depth * STEP }}>
                <DocumentCard doc={latest} showFile swipe />
              </View>
            </View>
          </View>
        )
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
  pile: { width: '100%' },
  front: { width: '100%', position: 'relative' },
  sheet: {
    position: 'absolute',
    height: 260,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
  },
});
