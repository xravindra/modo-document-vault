import { memo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ActionIcon } from '@/components/ActionIcon';
import { MemberAvatar } from '@/components/Avatar';
import { DocumentPreview } from '@/components/DocumentPreview';
import { PressableScale } from '@/components/ui';
import { deliverFile, shareDocument } from '@/lib/deliver';
import { formatBytes, formatWhen } from '@/lib/format';
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
  const [frameWidth, setFrameWidth] = useState(198);

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
    <View
      style={[
        styles.card,
        showFile ? styles.cardFile : null,
        carousel ? styles.cardCarousel : null,
        showFile ? { width: frameWidth } : null,
      ]}
    >
      <PressableScale
        accessibilityLabel={`Open ${doc.title}`}
        onPress={() => router.push(`/document/${doc.id}` as Href)}
        style={[styles.open, showFile ? styles.openFile : null]}
      >
        {showFile ? <DocumentPreview doc={doc} onWidth={setFrameWidth} /> : <MemberAvatar name={documentMember(doc)} size={44} />}
        {showFile ? null : (
          <View style={styles.copy}>
            <Text numberOfLines={carousel ? 2 : 1} style={styles.title}>
              {doc.title}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {note ?? `${documentMember(doc)} · ${kindLabel(doc.kind)}`}
            </Text>
            {note ? null : (
              <Text numberOfLines={1} style={styles.when}>
                {formatWhen(doc.createdAt)} · {formatBytes(doc.byteLength)}
              </Text>
            )}
          </View>
        )}
        {showFile ? null : <Text style={styles.chevron}>›</Text>}
      </PressableScale>
      {showFile ? null : (
        <PressableScale
          accessibilityLabel={doc.favourite ? `Remove ${doc.title} from favourites` : `Mark ${doc.title} as a favourite`}
          onPress={() => void vault.toggleFavourite(doc.id)}
          style={styles.heartHit}
        >
          <Text style={styles.heart}>{doc.favourite ? '❤️' : '🤍'}</Text>
        </PressableScale>
      )}
    </View>
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
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.inkSoft,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.line,
    overflow: 'hidden',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  cardFile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  cardCarousel: { marginBottom: 0, alignSelf: 'flex-start' },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  openFile: { width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.paper, fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  meta: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 3 },
  when: { color: theme.paperFaint, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  chevron: { color: theme.paperFaint, fontSize: 26, lineHeight: 28, marginLeft: 4 },
  heartHit: { padding: 4 },
  heart: { fontSize: 20 },
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
