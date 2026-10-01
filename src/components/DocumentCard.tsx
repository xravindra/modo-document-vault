import { memo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ActionIcon } from '@/components/ActionIcon';
import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { DocumentPreview } from '@/components/DocumentPreview';
import { PressableScale } from '@/components/ui';
import { deliverFile, shareDocument } from '@/lib/deliver';
import { engineLabel, formatBytes, formatWhen } from '@/lib/format';
import { kindLabel, type VaultDocument } from '@/lib/types';
import { documentMember } from '@/lib/members';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

function Card({
  doc,
  swipe = false,
  showFile = false,
  carousel = false,
}: {
  doc: VaultDocument;
  swipe?: boolean;
  showFile?: boolean;
  carousel?: boolean;
}) {
  const vault = useVault();
  const swipeRef = useRef<SwipeableMethods>(null);
  const acting = useRef(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(mode: 'share' | 'download') {
    if (acting.current) return;
    acting.current = true;
    swipeRef.current?.close();
    setNote(null);
    vault.holdAutoLock();
    try {
      const opened = await vault.openDocument(doc.id, 0);
      if (!opened.bytes || opened.integrity !== 'ok') {
        setNote('Could not open this document.');
        return;
      }
      if (mode === 'share') {
        await shareDocument({
          title: doc.title,
          text: opened.fileName,
          file: { fileName: opened.fileName, mime: opened.mimeType, bytes: opened.bytes },
        });
      } else {
        await deliverFile(opened.fileName, opened.bytes, opened.mimeType);
        setNote('Downloaded.');
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not complete that action.');
    } finally {
      acting.current = false;
      vault.releaseAutoLock();
    }
  }

  const body = (
    <PressableScale
      accessibilityLabel={`Open ${doc.title}`}
      onPress={() => router.push(`/document/${doc.id}` as Href)}
      style={[styles.card, showFile ? styles.cardFile : null, carousel ? styles.cardCarousel : null]}
    >
      {showFile ? <DocumentPreview doc={doc} /> : <View style={styles.rule} />}
      <View style={styles.copy}>
        <View style={styles.kindRow}>
          <CategoryAvatar kind={doc.kind} size={22} />
          <MemberAvatar name={documentMember(doc)} size={22} />
          <Text numberOfLines={1} style={styles.kind}>
            {kindLabel(doc.kind)} · {documentMember(doc)}
          </Text>
        </View>
        <Text numberOfLines={carousel ? 2 : undefined} style={styles.title}>{doc.title}</Text>
        <Text numberOfLines={carousel ? 2 : undefined} style={styles.meta}>
          {note ?? `${formatWhen(doc.createdAt)} · ${formatBytes(doc.byteLength)} · ${engineLabel(doc.extraction.engine)}`}
        </Text>
      </View>
    </PressableScale>
  );

  if (!swipe) return body;

  return (
    <Swipeable
      ref={swipeRef}
      containerStyle={styles.swipeWrap}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => <SwipePanel icon="download" label="Download" tone="gold" />}
      renderRightActions={() => <SwipePanel icon="share" label="Share" tone="paper" />}
      onSwipeableOpen={(direction) => {
        void run(direction === 'right' ? 'download' : 'share');
      }}
    >
      {body}
    </Swipeable>
  );
}

function SwipePanel({ label, icon, tone }: { label: string; icon: 'download' | 'share'; tone: 'gold' | 'paper' }) {
  const color = tone === 'gold' ? theme.ink : theme.paper;
  return (
    <View style={[styles.swipe, tone === 'gold' ? styles.swipeDownload : styles.swipeShare]}>
      <ActionIcon color={color} name={icon} />
      <Text style={[styles.swipeText, tone === 'gold' ? styles.swipeTextInk : null]}>{label}</Text>
    </View>
  );
}

export const DocumentCard = memo(Card);

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    backgroundColor: theme.inkRaised,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardFile: { flexDirection: 'column' },
  cardCarousel: { marginBottom: 0, width: '100%' },
  rule: { width: 4, backgroundColor: theme.goldDeep },
  copy: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 16 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: {
    flex: 1,
    minWidth: 0,
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 22, marginTop: 4 },
  meta: { color: theme.paperDim, fontFamily: font.body, fontSize: 13, marginTop: 6 },
  swipeWrap: { width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  swipe: {
    width: 108,
    marginBottom: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  swipeDownload: { backgroundColor: theme.gold },
  swipeShare: { backgroundColor: theme.inkSoft, borderWidth: 1, borderColor: theme.line },
  swipeText: { color: theme.paper, fontFamily: font.semibold, fontSize: 13 },
  swipeTextInk: { color: theme.ink },
});
