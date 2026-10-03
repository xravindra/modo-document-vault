import { StyleSheet, Text, View } from 'react-native';

import { DocumentRows } from '@/components/DocumentFeed';
import { Icon } from '@/components/Icon';
import type { VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

export function DocumentStack({
  name,
  documents,
  heart = false,
}: {
  name: string;
  documents: VaultDocument[];
  heart?: boolean;
}) {
  if (documents.length === 0) return null;

  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        {heart ? <Icon color={theme.danger} filled name="heart" size={18} /> : null}
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text style={styles.count}>{documents.length}</Text>
      </View>
      <DocumentRows documents={documents} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { width: '100%', marginBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  name: { flexShrink: 1, color: theme.paper, fontFamily: font.semibold, fontSize: 18 },
  count: {
    color: theme.paperDim,
    fontFamily: font.semibold,
    fontSize: 12,
    backgroundColor: theme.inkSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
