import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { FieldRow } from '@/components/FieldRow';
import { PdfFrame } from '@/components/PdfFrame';
import { BackButton, Banner, Headline, Kicker, PressableScale, Screen } from '@/components/ui';
import { deliverFile, previewUri, shareDocument } from '@/lib/deliver';
import { engineLabel, formatBytes, shareSummary } from '@/lib/format';
import { pdfPageRatio } from '@/lib/pdfText';
import { kindLabel, type ExtractedField } from '@/lib/types';
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
  const [armed, setArmed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [saving, setSaving] = useState(false);
  const fieldSeq = useRef(0);

  useEffect(() => {
    if (!id) return;
    setImageRatio(null);
    setRenaming(false);
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

  useEffect(() => {
    if (!preview || !mime.startsWith('image/')) return;
    let live = true;
    Image.getSize(
      preview,
      (width, height) => {
        if (live && width > 0 && height > 0) setImageRatio(width / height);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [preview, mime]);

  useEffect(() => {
    setFields(doc ? doc.extraction.fields.map((field) => ({ ...field })) : []);
  }, [doc?.id, doc?.extraction]);

  function beginRename() {
    if (!doc || renaming) return;
    setDraftName(doc.fileName);
    setRenaming(true);
  }

  async function commitRename() {
    if (!doc) return;
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === doc.fileName) return;
    setMessage(null);
    try {
      await vault.renameDocument(doc.id, next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not rename this document.');
    }
  }

  async function download() {
    if (!doc || !plain || integrity !== 'ok') return;
    setMessage(null);
    try {
      await deliverFile(doc.fileName, plain, doc.mimeType);
      setMessage('Downloaded. The sealed original is unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not download this document.');
    }
  }

  async function shareFile() {
    if (!doc || !plain || integrity !== 'ok') return;
    setMessage(null);
    try {
      const outcome = await shareDocument({
        title: doc.title,
        text: doc.fileName,
        file: { fileName: doc.fileName, mime: doc.mimeType, bytes: plain },
      });
      if (outcome === 'downloaded') {
        setMessage('The file was downloaded because this browser cannot share it directly.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not share this file.');
    }
  }

  function addField() {
    fieldSeq.current += 1;
    setFields((current) => [
      ...current,
      { key: `custom-${fieldSeq.current}`, label: '', value: '', confidence: 1 },
    ]);
  }

  async function saveFields() {
    if (!doc || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await vault.saveFields(doc.id, fields);
      setMessage('Saved the extracted fields. The sealed file is unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save these fields.');
    } finally {
      setSaving(false);
    }
  }

  async function shareDetails() {
    if (!doc || fields.length === 0) return;
    setMessage(null);
    try {
      const outcome = await shareDocument({
        title: doc.title,
        text: shareSummary(doc.title, fields),
        file: null,
      });
      if (outcome === 'downloaded') {
        setMessage('The extracted details were copied so you can paste them into a message.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not share this document.');
    }
  }

  async function remove() {
    if (!doc || removing) return;
    setRemoving(true);
    setMessage(null);
    try {
      await vault.removeDocument(doc.id);
      router.back();
    } catch (error) {
      setRemoving(false);
      setMessage(error instanceof Error ? error.message : 'Could not delete this document.');
    }
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
      <View style={styles.metaRow}>
        {renaming ? (
          <TextInput
            accessibilityLabel="File name"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onBlur={() => void commitRename()}
            onChangeText={setDraftName}
            onSubmitEditing={() => void commitRename()}
            style={styles.fileInput}
            value={draftName}
          />
        ) : (
          <PressableScale accessibilityLabel={`Rename ${doc.fileName}`} onPress={beginRename} style={styles.fileNameHit}>
            <Text style={styles.fileName}>{doc.fileName}</Text>
          </PressableScale>
        )}
        <Text style={styles.meta}>
          {' · '}
          {formatBytes(doc.byteLength)} · {engineLabel(doc.extraction.engine)}
        </Text>
      </View>
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
        <Image
          accessibilityLabel="Document preview"
          resizeMode="contain"
          source={{ uri: preview }}
          style={[styles.preview, imageRatio ? { aspectRatio: imageRatio } : styles.imagePending]}
        />
      ) : null}
      {preview && mime.includes('pdf') && plain ? <PdfFrame uri={preview} ratio={pdfPageRatio(plain)} /> : null}
      <Text style={styles.note}>{doc.extraction.note}</Text>
      {fields.map((field, index) => (
        <FieldRow
          key={field.key}
          label={field.label}
          onChangeLabel={(label) => {
            setFields((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, label } : item)));
          }}
          onChangeValue={(value) => {
            setFields((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, value } : item)));
          }}
          onDelete={() => {
            setFields((current) => current.filter((_, itemIndex) => itemIndex !== index));
          }}
          value={field.value}
        />
      ))}
      <View style={styles.actions}>
        <PressableScale
          accessibilityLabel={`Share file ${doc.fileName}`}
          disabled={!plain || integrity !== 'ok'}
          onPress={() => void shareFile()}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Share</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel="Save extracted fields"
          disabled={saving}
          onPress={() => void saveFields()}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel={`Download ${doc.title}`}
          disabled={!plain || integrity !== 'ok'}
          onPress={() => void download()}
          style={styles.download}
        >
          <Text style={styles.downloadText}>Download</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="Add a field" onPress={addField} style={styles.secondary}>
          <Text style={styles.secondaryText}>Add a field</Text>
        </PressableScale>
        {fields.length > 0 ? (
          <PressableScale accessibilityLabel={`Share details from ${doc.title}`} onPress={() => void shareDetails()} style={styles.secondary}>
            <Text style={styles.secondaryText}>Share details</Text>
          </PressableScale>
        ) : null}
        <PressableScale accessibilityLabel={`Remove ${doc.title} from vault`} onPress={() => setArmed(true)} style={styles.remove}>
          <Text style={styles.removeText}>Remove from vault</Text>
        </PressableScale>
      </View>
      {armed ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Remove {doc.title} from this device? The sealed file is deleted and cannot be restored from the vault.
          </Text>
          <PressableScale accessibilityLabel="Cancel delete" disabled={removing} onPress={() => setArmed(false)} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel={`Delete ${doc.title} from this device`}
            disabled={removing}
            onPress={() => void remove()}
            style={styles.danger}
          >
            <Text style={styles.dangerText}>{removing ? 'Removing…' : 'Delete from this device'}</Text>
          </PressableScale>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  fileNameHit: { paddingVertical: 2 },
  fileName: {
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  meta: { color: theme.paperDim, fontFamily: font.body, fontSize: 14 },
  fileInput: {
    minWidth: 180,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 14,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.gold,
  },
  badge: {
    marginTop: 16,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(143, 203, 176, 0.12)',
  },
  badgeBad: { backgroundColor: 'rgba(224, 139, 122, 0.14)' },
  badgeText: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  preview: {
    alignSelf: 'stretch',
    marginHorizontal: -22,
    marginVertical: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  imagePending: { height: 220 },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 22 },
  secondary: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: theme.paper, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  download: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: theme.gold,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadText: { color: theme.ink, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  remove: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(224, 139, 122, 0.45)',
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: theme.danger, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  confirm: { marginTop: 28 },
  confirmText: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  cancel: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  danger: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: theme.danger, fontFamily: font.semibold, fontSize: 15 },
});
