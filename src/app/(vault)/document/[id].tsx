import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PdfFrame } from '@/components/PdfFrame';
import { BackButton, Banner, Headline, Kicker, PressableScale, Screen } from '@/components/ui';
import { deliverFile, previewUri } from '@/lib/deliver';
import { engineLabel, formatBytes } from '@/lib/format';
import { kindLabel } from '@/lib/types';
import { session } from '@/lib/vault';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vault = useVault();
  const doc = vault.documents.find((item) => item.id === id);
  const [preview, setPreview] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<'ok' | 'failed' | 'checking'>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [plain, setPlain] = useState<Uint8Array | null>(null);
  const [mime, setMime] = useState('');

  useEffect(() => {
    if (!id) return;
    let revoke: () => void = () => undefined;
    let live = true;
    (async () => {
      try {
        const opened = await session.openDocument(id);
        if (!live) return;
        setIntegrity(opened.integrity);
        setPlain(opened.bytes);
        setMime(opened.doc.mimeType);
        await vault.refresh();
        if (!live || !opened.bytes || opened.integrity !== 'ok') return;
        if (opened.doc.mimeType.startsWith('image/') || opened.doc.mimeType.includes('pdf')) {
          const next = await previewUri(opened.bytes, opened.doc.mimeType);
          if (!live) {
            next.revoke();
            return;
          }
          revoke = next.revoke;
          setPreview(next.uri);
        }
      } catch (error) {
        if (live) setMessage(error instanceof Error ? error.message : 'Could not open the document.');
      }
    })();
    return () => {
      live = false;
      revoke();
    };
  }, [id, vault.refresh]);

  async function exportCopy() {
    if (!doc || !plain || integrity !== 'ok') return;
    setMessage(null);
    try {
      await deliverFile(doc.fileName, plain, doc.mimeType);
      setMessage('A readable copy left the vault. The sealed original is unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export a copy.');
    }
  }

  function remove() {
    if (!doc) return;
    Alert.alert('Remove this document?', `${doc.title} will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void vault.removeDocument(doc.id).then(() => router.back());
        },
      },
    ]);
  }

  if (!doc) {
    return (
      <Screen>
        <BackButton label="Back" />
        <Headline>Missing</Headline>
        <Banner message="That document is not in the vault." />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton label="Back" />
      <Kicker>{kindLabel(doc.kind)}</Kicker>
      <Headline>{doc.title}</Headline>
      <Text style={styles.meta}>
        {doc.fileName} · {formatBytes(doc.byteLength)} · {engineLabel(doc.extraction.engine)}
      </Text>
      <View style={[styles.badge, integrity === 'failed' ? styles.badgeBad : null]}>
        <Text style={styles.badgeText}>
          {integrity === 'checking'
            ? 'Checking integrity…'
            : integrity === 'ok'
              ? 'SHA-256 matches the sealed original'
              : 'Integrity check failed. The file was not shown.'}
        </Text>
      </View>
      <Banner message={message} />
      {preview && mime.startsWith('image/') ? (
        <Image source={{ uri: preview }} style={styles.image} accessibilityLabel="Document preview" />
      ) : null}
      {preview && mime.includes('pdf') ? <PdfFrame uri={preview} /> : null}
      <Text style={styles.note}>{doc.extraction.note}</Text>
      {doc.extraction.fields.map((field) => (
        <View key={`${field.key}-${field.value}`} style={styles.field}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Text style={styles.fieldValue}>{field.value}</Text>
        </View>
      ))}
      {doc.extraction.text ? (
        <View style={styles.textBlock}>
          <Text style={styles.fieldLabel}>Extracted text</Text>
          <Text style={styles.text}>{doc.extraction.text}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <PressableScale onPress={() => void vault.toggleFavorite(doc.id)} style={styles.secondary}>
          <Text style={styles.secondaryText}>{doc.favorite ? 'Unmark' : 'Keep'}</Text>
        </PressableScale>
        <PressableScale onPress={() => void exportCopy()} style={styles.secondary}>
          <Text style={styles.secondaryText}>Readable copy</Text>
        </PressableScale>
      </View>
      <PressableScale onPress={remove} style={styles.danger}>
        <Text style={styles.dangerText}>Remove from vault</Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 8 },
  badge: {
    marginTop: 16,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(143, 203, 176, 0.12)',
  },
  badgeBad: { backgroundColor: 'rgba(224, 139, 122, 0.14)' },
  badgeText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  image: { width: '100%', height: 280, borderRadius: 18, marginTop: 16, backgroundColor: theme.inkSoft },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 16 },
  field: { marginTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.line },
  fieldLabel: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  fieldValue: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 24, marginTop: 4 },
  textBlock: { marginTop: 18 },
  text: { color: theme.paper, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  secondary: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: theme.paper, fontFamily: font.semibold, fontSize: 14 },
  danger: { marginTop: 8, paddingVertical: 14 },
  dangerText: { color: theme.danger, fontFamily: font.semibold, fontSize: 15 },
});
