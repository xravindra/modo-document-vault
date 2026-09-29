import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { PressableScale } from '@/components/ui';
import { engineLabel, formatBytes, formatWhen } from '@/lib/format';
import { kindLabel, type VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

function Card({ doc }: { doc: VaultDocument }) {
  return (
    <PressableScale
      accessibilityLabel={`Open ${doc.title}`}
      onPress={() => router.push(`/document/${doc.id}` as Href)}
      style={styles.card}
    >
      <View style={styles.rule} />
      <View style={styles.copy}>
        <Text style={styles.kind}>
          {kindLabel(doc.kind)}
          {doc.favorite ? '  ·  Kept' : ''}
        </Text>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.meta}>
          {formatWhen(doc.createdAt)} · {formatBytes(doc.byteLength)} · {engineLabel(doc.extraction.engine)}
        </Text>
      </View>
    </PressableScale>
  );
}

export const DocumentCard = memo(Card);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: theme.inkRaised,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    overflow: 'hidden',
    marginBottom: 12,
  },
  rule: { width: 4, backgroundColor: theme.goldDeep },
  copy: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  kind: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 22, marginTop: 4 },
  meta: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 6 },
});
