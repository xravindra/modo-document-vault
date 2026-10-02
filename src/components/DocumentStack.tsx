import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DocumentCard } from '@/components/DocumentCard';
import type { VaultDocument } from '@/lib/types';
import { font, theme } from '@/theme';

export function DocumentStack({
  name,
  documents,
  heart = false,
}: {
  name: string;
  documents: VaultDocument[];
  categories?: string[];
  heart?: boolean;
}) {
  if (documents.length === 0) return null;

  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        {heart ? <Text style={styles.heart}>❤️</Text> : null}
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text style={styles.count}>{documents.length}</Text>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {documents.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} showFile />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { width: '100%', marginBottom: 28 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  name: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 22 },
  heart: { fontSize: 16 },
  count: { color: theme.gold, fontFamily: font.medium, fontSize: 13 },
  row: { gap: 12, paddingRight: 8, alignItems: 'flex-start' },
});
