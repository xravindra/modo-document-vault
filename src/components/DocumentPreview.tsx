import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PdfFrame } from '@/components/PdfFrame';
import { previewUri } from '@/lib/deliver';
import { pdfPageRatio } from '@/lib/pdfText';
import type { VaultDocument } from '@/lib/types';
import { session } from '@/lib/vault';
import { font, theme } from '@/theme';

const FACE = 260;

export function DocumentPreview({ doc }: { doc: VaultDocument }) {
  const revoke = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mime, setMime] = useState('');
  const [plain, setPlain] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [imageRatio, setImageRatio] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setPlain(null);
    setMime('');
    setFailed(false);
    setImageRatio(null);
    void (async () => {
      try {
        const opened = await session.openDocument(doc.id, 0, false);
        if (!live) return;
        if (!opened.bytes || opened.integrity !== 'ok') {
          setFailed(true);
          return;
        }
        const next = await previewUri(opened.bytes, opened.mimeType);
        if (!live) {
          next.revoke();
          return;
        }
        revoke.current?.();
        revoke.current = next.revoke;
        setMime(opened.mimeType);
        setPlain(opened.bytes);
        setPreview(next.uri);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      revoke.current?.();
      revoke.current = null;
    };
  }, [doc.id]);

  const image = mime.startsWith('image/');

  useEffect(() => {
    if (!preview || !image) return;
    let live = true;
    Image.getSize(
      preview,
      (nextWidth, nextHeight) => {
        if (live && nextWidth > 0 && nextHeight > 0) setImageRatio(nextHeight / nextWidth);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [preview, image]);
  const pdf = mime.includes('pdf') || doc.fileName.toLowerCase().endsWith('.pdf');
  const ratio = plain && pdf ? Math.min(pdfPageRatio(plain), width > 0 ? FACE / width : 1.3) : 1.3;
  const showPage = (image && preview) || (pdf && preview && plain);
  const imageHeight = image && width > 0 && imageRatio ? Math.max(1, Math.round(width * imageRatio)) : FACE;

  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={[styles.face, image ? { height: imageHeight } : null]}
    >
      {image && preview ? (
        <Image
          accessibilityLabel={doc.title}
          resizeMode="contain"
          source={{ uri: preview }}
          style={{ width: '100%', height: imageHeight }}
        />
      ) : null}
      {pdf && preview && plain ? (
        <View style={styles.fill}>
          <PdfFrame ratio={ratio} uri={preview} />
        </View>
      ) : null}
      {!showPage ? (
        <View style={styles.fill}>
          <Text numberOfLines={8} style={styles.excerpt}>
            {failed || preview ? doc.extraction.text || doc.title : 'Opening…'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    width: '100%',
    height: FACE,
    overflow: 'hidden',
    backgroundColor: theme.paper,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%', height: FACE },
  excerpt: {
    width: '100%',
    color: theme.ink,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
  },
});
