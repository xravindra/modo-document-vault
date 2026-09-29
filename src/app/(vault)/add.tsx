import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { BackButton, Banner, Headline, Kicker, PressableScale, Quiet, Screen } from '@/components/ui';
import { VaultMark } from '@/components/VaultMark';
import { extractDocument, suggestedKind } from '@/lib/extract';
import { readSource } from '@/lib/readSource';
import { buildSamplePassportPdf } from '@/lib/samplePdf';
import { KINDS, type DocKind, type Extraction } from '@/lib/types';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

type Draft = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  title: string;
  kind: DocKind;
};

function titleFrom(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled document';
}

export default function AddScreen() {
  const vault = useVault();
  const params = useLocalSearchParams<{ sample?: string }>();
  const [phase, setPhase] = useState<'choose' | 'details' | 'reading' | 'review'>('choose');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sampleRef = useRef(false);

  async function readPicked(next: Draft) {
    setDraft(next);
    setPhase('reading');
    setMessage(null);
    try {
      const result = await extractDocument(next.bytes, next.mimeType, next.fileName);
      const kind = suggestedKind(next.kind, result.text);
      setDraft({ ...next, kind });
      setExtraction(result);
      setPhase('review');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that file.');
      setPhase('details');
    }
  }

  useEffect(() => {
    if (params.sample !== '1' || sampleRef.current) return;
    sampleRef.current = true;
    const bytes = buildSamplePassportPdf();
    void readPicked({
      bytes,
      fileName: 'example-passport.pdf',
      mimeType: 'application/pdf',
      title: 'Example passport',
      kind: 'identity',
    });
  }, [params.sample]);

  async function pickDocument() {
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
      type: ['application/pdf', 'image/*', 'text/plain'],
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    try {
      const bytes = await readSource({
        uri: asset.uri,
        base64: asset.base64,
        file: asset.file,
      });
      setDraft({
        bytes,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        title: titleFrom(asset.name),
        kind: 'other',
      });
      setPhase('details');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that file.');
    }
  }

  async function pickImage(camera: boolean) {
    setMessage(null);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage(camera ? 'Camera permission is required to photograph a document.' : 'Photo permission is required to choose an image.');
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const bytes = await readSource({ uri: asset.uri, base64: asset.base64 });
      const fileName = asset.fileName ?? `photo-${Date.now()}.jpg`;
      setDraft({
        bytes,
        fileName,
        mimeType: asset.mimeType ?? 'image/jpeg',
        title: titleFrom(fileName),
        kind: 'other',
      });
      setPhase('details');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that photo.');
    }
  }

  async function seal() {
    if (!draft || !extraction || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const doc = await vault.addDocument({ ...draft, extraction });
      router.replace(`/document/${doc.id}` as Href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not seal the document.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackButton label="Close" />
      <Kicker>Add</Kicker>
      <Headline>{phase === 'review' ? 'What was read' : 'Seal a document'}</Headline>
      <Quiet>
        {phase === 'review'
          ? 'Check the fields, then seal the original file. You can still keep it if nothing was extracted.'
          : 'The original file is encrypted before it is written. Extraction happens on this device.'}
      </Quiet>
      <Banner message={message} />

      {phase === 'choose' ? (
        <View style={styles.stack}>
          <Choice label="Choose a file" detail="PDF, image, or text" onPress={() => void pickDocument()} />
          <Choice label="Choose a photo" detail="From your library" onPress={() => void pickImage(false)} />
          <Choice label="Take a photo" detail="Camera, used only for this capture" onPress={() => void pickImage(true)} />
          <Choice
            label="Try the sample passport"
            detail="A generated PDF, so you can see extraction immediately"
            onPress={() =>
              void readPicked({
                bytes: buildSamplePassportPdf(),
                fileName: 'example-passport.pdf',
                mimeType: 'application/pdf',
                title: 'Example passport',
                kind: 'identity',
              })
            }
          />
        </View>
      ) : null}

      {phase === 'details' && draft ? (
        <View>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={draft.title}
            onChangeText={(title) => setDraft({ ...draft, title })}
            style={styles.input}
            accessibilityLabel="Document title"
          />
          <Text style={styles.label}>Kind</Text>
          <View style={styles.kinds}>
            {KINDS.map((item) => (
              <PressableScale
                key={item.id}
                onPress={() => setDraft({ ...draft, kind: item.id })}
                style={[styles.chip, draft.kind === item.id ? styles.chipOn : null]}
              >
                <Text style={[styles.chipText, draft.kind === item.id ? styles.chipTextOn : null]}>{item.label}</Text>
              </PressableScale>
            ))}
          </View>
          <PressableScale onPress={() => void readPicked(draft)} style={styles.primary}>
            <Text style={styles.primaryText}>Read the document</Text>
          </PressableScale>
        </View>
      ) : null}

      {phase === 'reading' ? (
        <View style={styles.reading}>
          <VaultMark compact />
          <Text style={styles.readingText}>Reading the document…</Text>
        </View>
      ) : null}

      {phase === 'review' && draft && extraction ? (
        <View>
          <Text style={styles.note}>{extraction.note}</Text>
          <Text style={styles.label}>Kind</Text>
          <View style={styles.kinds}>
            {KINDS.map((item) => (
              <PressableScale
                key={item.id}
                onPress={() => setDraft({ ...draft, kind: item.id })}
                style={[styles.chip, draft.kind === item.id ? styles.chipOn : null]}
              >
                <Text style={[styles.chipText, draft.kind === item.id ? styles.chipTextOn : null]}>{item.label}</Text>
              </PressableScale>
            ))}
          </View>
          {extraction.fields.length === 0 ? (
            <Text style={styles.note}>No structured fields were found. The file can still be sealed.</Text>
          ) : (
            extraction.fields.map((field) => (
              <View key={`${field.key}-${field.value}`} style={styles.field}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.fieldValue}>{field.value}</Text>
              </View>
            ))
          )}
          <PressableScale disabled={busy} onPress={() => void seal()} style={styles.primary}>
            <Text style={styles.primaryText}>{busy ? 'Sealing…' : 'Seal in the vault'}</Text>
          </PressableScale>
        </View>
      ) : null}
    </Screen>
  );
}

function Choice({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <Text style={styles.choiceDetail}>{detail}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stack: { marginTop: 22, gap: 10 },
  choice: { borderRadius: 20, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.inkRaised, padding: 16 },
  choiceLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  choiceDetail: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 4 },
  label: {
    marginTop: 20,
    marginBottom: 8,
    color: theme.paperDim,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.inkRaised,
  },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: theme.gold, borderColor: theme.gold },
  chipText: { color: theme.paper, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: theme.ink },
  primary: { marginTop: 22, backgroundColor: theme.gold, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  reading: { alignItems: 'center', marginTop: 24 },
  readingText: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 16 },
  field: { marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.line },
  fieldLabel: { color: theme.gold, fontFamily: font.semibold, fontSize: 12, letterSpacing: 1 },
  fieldValue: { color: theme.paper, fontFamily: font.displaySoft, fontSize: 22, marginTop: 4 },
});
