import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { KindPicker } from '@/components/KindPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { BackButton, Banner, Headline, PressableScale, Quiet, Screen } from '@/components/ui';
import { canonicalMember, SELF } from '@/lib/members';
import { smartDocumentName } from '@/lib/naming';
import { VaultMark } from '@/components/VaultMark';
import { extractDocument, suggestedKind } from '@/lib/extract';
import { MAX_PAGES } from '@/lib/pages';
import { readSource } from '@/lib/readSource';
import { buildSamplePassportPdf } from '@/lib/samplePdf';
import type { PageInput } from '@/lib/vault';
import { useVault } from '@/state/VaultContext';
import { font, theme } from '@/theme';

type Draft = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  title: string;
  kind: string | null;
  member: string;
  extraPages: PageInput[];
};

function paint() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 32);
  });
}

export default function AddScreen() {
  const vault = useVault();
  const params = useLocalSearchParams<{ sample?: string }>();
  const [phase, setPhase] = useState<'choose' | 'reading'>('choose');
  const [member, setMember] = useState(SELF);
  const [kind, setKind] = useState<string | null>(null);
  const [readingLabel, setReadingLabel] = useState('Reading the document…');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sampleRef = useRef(false);

  async function readPicked(next: Draft) {
    const visual =
      next.mimeType.startsWith('image/') ||
      next.mimeType.includes('pdf') ||
      next.fileName.toLowerCase().endsWith('.pdf');
    setReadingLabel(visual ? 'Recognizing text…' : 'Reading the document…');
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
      const text = [result.text, ...extraPages.map((page) => page.extraction?.text ?? '')].join('\n');
      const kind = next.kind ?? suggestedKind('other', text);
      const named = smartDocumentName({
        fileName: next.fileName,
        mimeType: next.mimeType,
        kind,
        member: next.member,
        fields: result.fields,
        text,
      });
      setReadingLabel('Saving the document…');
      await paint();
      const doc = await vault.addDocument({ ...next, ...named, kind, extraPages, extraction: result });
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
    setMessage('The sample passport is filed under Self unless you choose someone else.');
  }, [params.sample]);

  function chosenMember() {
    return canonicalMember([], member) || SELF;
  }

  async function acceptPages(pages: PageInput[]) {
    const first = pages[0];
    const name = chosenMember();
    if (!first) return;
    const limited = pages.slice(0, MAX_PAGES);
    await readPicked({
      bytes: first.bytes,
      fileName: first.fileName,
      mimeType: first.mimeType,
      title: 'Document',
      kind,
      member: name,
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
      <BackButton label="Back" />
      <Headline>Add</Headline>
      <Quiet>Pick a file. It stays on this phone, under Self, unless you choose someone else.</Quiet>
      <Banner message={message} />

      {phase === 'choose' ? (
        <View style={styles.stack}>
          <Choice primary label="Choose a file" detail="PDF, photo, or text" onPress={() => void pickDocument()} />
          <Choice label="Choose a photo" detail="From this phone" onPress={() => void pickImage(false)} />
          <Choice label="Take a photo" detail="Uses the camera once" onPress={() => void pickImage(true)} />
          <PressableScale accessibilityLabel="Person and category" onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsToggle}>
            <Text style={styles.detailsToggleText}>{detailsOpen ? 'Hide details' : 'Person and category'}</Text>
          </PressableScale>
          {detailsOpen ? (
            <View style={styles.details}>
              <MemberPicker
                members={vault.members}
                onRemoved={(name) => setMessage(`${name} was removed. Their documents are filed under Self.`)}
                onSelect={(name) => {
                  setMember(name);
                  setMessage(null);
                }}
                selected={member}
              />
              <KindPicker
                categories={vault.categories}
                onRemoved={(name) => setMessage(`${name} was removed. Those documents are now Other.`)}
                onSelect={(next) => {
                  setKind(next);
                  setMessage(null);
                }}
                selected={kind}
              />
            </View>
          ) : null}
          <PressableScale
            accessibilityLabel="Try the sample passport"
            onPress={() => {
              void readPicked({
                bytes: buildSamplePassportPdf(),
                fileName: 'example-passport.pdf',
                mimeType: 'application/pdf',
                title: 'Example passport',
                kind,
                member: chosenMember(),
                extraPages: [],
              });
            }}
          >
            <Text style={styles.sample}>Try a sample passport</Text>
          </PressableScale>
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

function Choice({ label, detail, onPress, primary = false }: { label: string; detail: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={[styles.choice, primary ? styles.choicePrimary : null]}>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceLabel, primary ? styles.choiceLabelPrimary : null]}>{label}</Text>
        <Text style={[styles.choiceDetail, primary ? styles.choiceDetailPrimary : null]}>{detail}</Text>
      </View>
      <Text style={[styles.choiceGo, primary ? styles.choiceGoPrimary : null]}>›</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stack: { marginTop: 22, gap: 10 },
  choice: {
    borderRadius: 24,
    backgroundColor: theme.inkRaised,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choicePrimary: { backgroundColor: theme.paper },
  choiceCopy: { flex: 1, minWidth: 0 },
  choiceLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 17 },
  choiceLabelPrimary: { color: theme.ink },
  choiceDetail: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 4 },
  choiceDetailPrimary: { color: 'rgba(16, 18, 24, 0.62)' },
  choiceGo: { color: theme.paperFaint, fontSize: 28, lineHeight: 30 },
  choiceGoPrimary: { color: theme.ink },
  reading: { alignItems: 'center', marginTop: 36 },
  readingText: { color: theme.paper, fontFamily: font.medium, fontSize: 16, marginTop: 8 },
  detailsToggle: { paddingVertical: 10 },
  detailsToggleText: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  details: { gap: 12 },
  sample: { color: theme.paperDim, fontFamily: font.medium, fontSize: 15, marginTop: 8 },
});
