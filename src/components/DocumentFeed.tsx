import { memo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { CategoryIcon } from '@/components/Avatar';
import { DocumentPreview } from '@/components/DocumentPreview';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui';
import { documentMember } from '@/lib/members';
import { documentPages } from '@/lib/pages';
import { kindLabel, type VaultDocument } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export type FeedLayout = 'list' | 'grid';

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function sectionName(ms: number, now: number): string {
  const today = startOfDay(now);
  if (ms >= today) return 'Today';
  if (ms >= today - DAY) return 'Yesterday';
  if (ms >= today - 6 * DAY) return 'This week';
  const date = new Date(ms);
  const current = new Date(now);
  if (date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth()) return 'Earlier this month';
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: date.getFullYear() === current.getFullYear() ? undefined : 'numeric',
  }).format(ms);
}

function shortWhen(ms: number, now: number): string {
  const today = startOfDay(now);
  if (ms >= today) return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms);
  if (ms >= today - 6 * DAY) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(ms);
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' }).format(ms);
}

export function groupByDate(documents: VaultDocument[], now = Date.now()) {
  const sections: { name: string; documents: VaultDocument[] }[] = [];
  for (const doc of documents) {
    const name = sectionName(doc.createdAt, now);
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.documents.push(doc);
    else sections.push({ name, documents: [doc] });
  }
  return sections;
}

function pageCount(doc: VaultDocument) {
  return documentPages(doc).length;
}

function open(doc: VaultDocument) {
  router.push(`/document/${doc.id}` as Href);
}

const Row = memo(function Row({ doc, first, now }: { doc: VaultDocument; first: boolean; now: number }) {
  const pages = pageCount(doc);
  return (
    <PressableScale accessibilityLabel={`Open ${doc.title}`} onPress={() => open(doc)} style={[styles.row, first ? null : styles.rowDivider]}>
      <View style={styles.rowThumb}>
        <DocumentPreview doc={doc} faceHeight={60} maxWidth={46} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {doc.title}
        </Text>
        <View style={styles.rowMeta}>
          <CategoryIcon kind={doc.kind} size={20} />
          <Text numberOfLines={1} style={styles.rowMetaText}>
            {documentMember(doc)} · {kindLabel(doc.kind)}
            {pages > 1 ? ` · ${pages} pages` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowWhen}>{shortWhen(doc.createdAt, now)}</Text>
        {doc.favourite ? <Icon color={theme.danger} filled name="heart" size={14} /> : null}
      </View>
    </PressableScale>
  );
});

const Tile = memo(function Tile({ doc, width }: { doc: VaultDocument; width: number }) {
  const vault = useVault();
  const faceHeight = Math.round(width * 1.25);
  return (
    <View style={[styles.tile, { width }]}>
      <PressableScale accessibilityLabel={`Open ${doc.title}`} onPress={() => open(doc)} style={styles.tileOpen}>
        <View style={[styles.tileFace, { height: faceHeight }]}>
          <DocumentPreview doc={doc} faceHeight={faceHeight - 16} maxWidth={width - 16} />
        </View>
        <View style={styles.tileCopy}>
          <Text numberOfLines={1} style={styles.tileTitle}>
            {doc.title}
          </Text>
          <Text numberOfLines={1} style={styles.tileMeta}>
            {documentMember(doc)} · {kindLabel(doc.kind)}
          </Text>
        </View>
      </PressableScale>
      <PressableScale
        accessibilityLabel={doc.favourite ? `Remove ${doc.title} from favourites` : `Mark ${doc.title} as a favourite`}
        onPress={() => void vault.toggleFavourite(doc.id)}
        style={styles.tileHeart}
      >
        <Icon color={doc.favourite ? theme.danger : theme.paperDim} filled={!!doc.favourite} name="heart" size={16} />
      </PressableScale>
    </View>
  );
});

function useColumnWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width > 0 ? width : 390, 560) - 44;
}

/** One rounded card of compact rows. */
export function DocumentRows({ documents }: { documents: VaultDocument[] }) {
  const now = Date.now();
  if (documents.length === 0) return null;
  return (
    <View style={styles.group}>
      {documents.map((doc, index) => (
        <Row key={doc.id} doc={doc} first={index === 0} now={now} />
      ))}
    </View>
  );
}

export function FavouriteStrip({ documents }: { documents: VaultDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <ScrollView horizontal contentContainerStyle={styles.strip} showsHorizontalScrollIndicator={false}>
      {documents.map((doc) => (
        <Tile key={doc.id} doc={doc} width={132} />
      ))}
    </ScrollView>
  );
}

export function DocumentFeed({ documents, layout }: { documents: VaultDocument[]; layout: FeedLayout }) {
  const column = useColumnWidth();
  const tileWidth = Math.floor((column - 12) / 2);
  const sections = groupByDate(documents);
  return (
    <View>
      {sections.map((section) => (
        <View key={section.name} style={styles.section}>
          <Text style={styles.sectionName}>{section.name}</Text>
          {layout === 'list' ? (
            <DocumentRows documents={section.documents} />
          ) : (
            <View style={styles.grid}>
              {section.documents.map((doc) => (
                <Tile key={doc.id} doc={doc} width={tileWidth} />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionName: {
    color: theme.paperFaint,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingHorizontal: 12, paddingVertical: 8 },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.line },
  rowThumb: {
    width: 46,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.sheet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMetaText: { flex: 1, minWidth: 0, color: theme.paperDim, fontFamily: font.body, fontSize: 13 },
  rowEnd: { alignItems: 'flex-end', gap: 6, minWidth: 44 },
  rowWhen: { color: theme.paperFaint, fontFamily: font.medium, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  strip: { gap: 12, paddingRight: 8 },
  tile: { position: 'relative' },
  tileOpen: { width: '100%' },
  tileFace: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileCopy: { paddingHorizontal: 4, paddingTop: 8 },
  tileTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 14 },
  tileMeta: { color: theme.paperDim, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  tileHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
});
