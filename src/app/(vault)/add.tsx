import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { BackButton, Banner, Headline, Kicker, PressableScale, Quiet, Screen } from '@/components/ui';
import { VaultMark } from '@/components/VaultMark';
import { extractDocument, suggestedKind } from '@/lib/extract';
import { MAX_PAGES } from '@/lib/pages';
import { readSource } from '@/lib/readSource';
import { buildSamplePassportPdf } from '@/lib/samplePdf';
import type { DocKind } from '@/lib/types';
import type { PageInput } from '@/lib/vault';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

type Draft = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  title: string;
  kind: DocKind;
  extraPages: PageInput[];
};

function paint() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 32);
  });
}

function titleFrom(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled document';
}

export default function AddScreen() {
  const vault = useVault();
  const params = useLocalSearchParams<{ sample?: string }>();
  const [phase, setPhase] = useState<'choose' | 'reading'>('choose');
  const [readingLabel, setReadingLabel] = useState('Reading the document…');
  const [message, setMessage] = useState<string | null>(null);
  const sampleRef = useRef(false);

  async function readPicked(next: Draft) {
    setReadingLabel('Reading the document…');
    setPhase('reading');
    setMessage(null);
    await paint();
    vault.holdAutoLock();
    try {
      const result = await extractDocument(next.bytes, next.mimeType, next.fileName);
      const extraPages: PageInput[] = [];
      for (const page of next.extraPages) {
        const pageResult = page.extraction ?? (await extractDocument(page.bytes, page.mimeType, page.fileName));
        extraPages.push({ ...page, extraction: pageResult });
      }
      const kind = suggestedKind(next.kind, [result.text, ...extraPages.map((page) => page.extraction?.text ?? '')].join('\n'));
      setReadingLabel('Saving the document…');
      await paint();
      const doc = await vault.addDocument({ ...next, kind, extraPages, extraction: result });
      router.replace(`/document/${doc.id}` as Href);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not seal that document.');
      setPhase('choose');
      return false;
    } finally {
      vault.releaseAutoLock();
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
      extraPages: [],
    });
  }, [params.sample]);

  async function acceptPages(pages: PageInput[]) {
    const first = pages[0];
    if (!first) return;
    const limited = pages.slice(0, MAX_PAGES);
    await readPicked({
      bytes: first.bytes,
      fileName: first.fileName,
      mimeType: first.mimeType,
      title: titleFrom(first.fileName),
      kind: 'other',
      extraPages: limited.slice(1),
    });
  }

  async function pickDocument() {
    setMessage(null);
    vault.holdAutoLock();
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        base64: false,
        type: ['application/pdf', 'image/*', 'text/plain'],
      });
      if (picked.canceled || picked.assets.length === 0) return;
      setReadingLabel('Reading the file…');
      setPhase('reading');
      await paint();
      const pages: PageInput[] = [];
      for (const asset of picked.assets) {
        const bytes = await readSource({
          uri: asset.uri,
          base64: asset.base64,
          file: asset.file,
          size: asset.size,
        });
        pages.push({
          bytes,
          fileName: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        });
      }
      await acceptPages(pages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that file.');
      setPhase('choose');
    } finally {
      vault.releaseAutoLock();
    }
  }

  async function pickImage(camera: boolean) {
    setMessage(null);
    vault.holdAutoLock();
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(camera ? 'Camera permission is required to photograph a document.' : 'Photo permission is required to choose an image.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.5,
        exif: false,
        base64: false,
        allowsMultipleSelection: !camera,
        selectionLimit: camera ? 1 : MAX_PAGES,
      };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || result.assets.length === 0) return;
      setReadingLabel(camera ? 'Saving the photo…' : 'Saving the photos…');
      setPhase('reading');
      await paint();
      const pages: PageInput[] = [];
      for (const asset of result.assets) {
        const bytes = await readSource({ uri: asset.uri, base64: asset.base64, size: asset.fileSize });
        const fileName = asset.fileName ?? `photo-${Date.now()}-${pages.length + 1}.jpg`;
        pages.push({
          bytes,
          fileName,
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
      await acceptPages(pages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that photo.');
      setPhase('choose');
    } finally {
      vault.releaseAutoLock();
    }
  }

  return (
    <Screen>
      <BackButton label="Close" />
      <Kicker>Add</Kicker>
      <Headline>Seal a document</Headline>
      <Quiet>The original file is encrypted before it is written. Extraction happens on this device.</Quiet>
      <Banner message={message} />

      {phase === 'choose' ? (
        <View style={styles.stack}>
          <Choice label="Choose a file" detail="PDF, image, or text. Several files become pages." onPress={() => void pickDocument()} />
          <Choice label="Choose a photo" detail="Several photos become pages of one document" onPress={() => void pickImage(false)} />
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
                extraPages: [],
              })
            }
          />
        </View>
      ) : null}

      {phase === 'reading' ? (
        <View style={styles.reading}>
          <VaultMark compact />
          <Text style={styles.readingText}>{readingLabel}</Text>
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
  reading: { alignItems: 'center', marginTop: 24 },
  readingText: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
});
