import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PdfFrame } from '@/components/PdfFrame';
import { previewUri } from '@/lib/deliver';
import { pdfPageRatio } from '@/lib/pdfText';
import type { VaultDocument } from '@/lib/types';
import { session } from '@/lib/vault';
import { font, theme } from '@/theme';

const PORTRAIT_WIDTH = 240;
const A4 = 297 / 210;
const FACE = Math.round(PORTRAIT_WIDTH * A4);

function frameWidth(pageRatio: number): number {
  const ratio = pageRatio > 0.2 ? pageRatio : A4;
  return Math.max(72, Math.round(FACE / ratio));
}

export function DocumentPreview({ doc, onWidth }: { doc: VaultDocument; onWidth?: (width: number) => void }) {
  const revoke = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mime, setMime] = useState('');
  const [plain, setPlain] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState(false);
  const [imageRatio, setImageRatio] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setPlain(null);
    setMime('');
    setFailed(false);
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
  const ratio = pdf && plain ? pdfPageRatio(plain) : imageRatio ?? A4;
  const width = frameWidth(ratio);
  const showPage = (image && preview) || (pdf && preview && plain);

  useEffect(() => {
    onWidth?.(width);
  }, [onWidth, width]);

  return (
    <View style={[styles.face, { width, height: FACE }]}>
      {image && preview ? (
        <Image accessibilityLabel={doc.title} resizeMode="contain" source={{ uri: preview }} style={[styles.fill, { width, height: FACE }]} />
      ) : null}
      {pdf && preview && plain ? (
        <View style={[styles.fill, { width, height: FACE }]}>
          <PdfFrame ratio={ratio} uri={preview} />
        </View>
      ) : null}
      {!showPage ? (
        <View style={[styles.fill, { width, height: FACE }]}>
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
    overflow: 'hidden',
    backgroundColor: theme.paper,
  },
  fill: { position: 'absolute', top: 0, left: 0 },
  excerpt: {
    width: '100%',
    color: theme.ink,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
  },
});
