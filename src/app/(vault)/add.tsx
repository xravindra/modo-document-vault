import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { KindPicker } from '@/components/KindPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { Icon, type IconName } from '@/components/Icon';
import { Banner, IconButton, PressableScale, Quiet, Screen, goBack } from '@/components/ui';
import { canonicalMember, SELF } from '@/lib/members';
import { smartDocumentName } from '@/lib/naming';
import { VaultMark } from '@/components/VaultMark';
import { extractDocument, suggestedKind } from '@/lib/extract';
import { MAX_PAGES } from '@/lib/pages';
import { readSource } from '@/lib/readSource';
import { buildSamplePassportPdf } from '@/lib/samplePdf';
import { kindLabel } from '@/lib/types';
import type { PageInput } from '@/lib/vault';
import { usePlan } from '@/state/PlanContext';
import { useVault } from '@/state/VaultContext';
import { font, theme, tint, wash } from '@/theme';

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
  const plan = usePlan();
  const params = useLocalSearchParams<{ sample?: string; source?: string }>();
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

  const sourceRef = useRef(false);
  useEffect(() => {
    if (sourceRef.current || Platform.OS === 'web' || !params.source || !plan.ready || !plan.canCreate) return;
    sourceRef.current = true;
    if (params.source === 'camera') void pickImage(true);
    else if (params.source === 'photos') void pickImage(false);
    else if (params.source === 'files') void pickDocument();
  }, [params.source, plan.ready, plan.canCreate]);

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

  const forName = chosenMember();

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.title}>Add a document</Text>
        <IconButton label="Close" name="close" onPress={() => goBack()} />
      </View>
      <Quiet>Encrypted the moment it is saved. Nothing leaves this phone.</Quiet>
      <Banner message={message} />

      {plan.ready && !plan.canCreate ? (
        <View style={styles.ended}>
          <View style={styles.endedIcon}>
            <Icon color={theme.gold} name="lock" size={26} />
          </View>
          <Text style={styles.endedTitle}>Your free trial has ended</Text>
          <Text style={styles.endedBody}>Everything you saved is still here. Subscribe to MODO Plus to add new documents.</Text>
          <PressableScale accessibilityLabel="See plans" onPress={() => router.replace('/plans' as Href)} style={styles.endedButton}>
            <Text style={styles.endedButtonText}>See plans</Text>
          </PressableScale>
        </View>
      ) : phase === 'choose' ? (
        <View>
          <Step number={1} title={`For ${forName}`}>
            <MemberPicker
              members={vault.members}
              onRemoved={(name) => setMessage(`${name} was removed. Their documents are filed under Self.`)}
              onSelect={(name) => {
                setMember(name);
                setMessage(null);
              }}
              selected={member}
            />
          </Step>

          <Step number={2} title="Category">
            <PressableScale accessibilityLabel="Choose a category" onPress={() => setDetailsOpen((open) => !open)} style={styles.kindRow}>
              <Text style={styles.kindValue}>{kind ? kindLabel(kind) : 'Detect automatically'}</Text>
              <Text style={styles.kindChange}>{detailsOpen ? 'Done' : 'Change'}</Text>
            </PressableScale>
            {detailsOpen ? (
              <KindPicker
                categories={vault.categories}
                onRemoved={(name) => setMessage(`${name} was removed. Those documents are now Other.`)}
                onSelect={(next) => {
                  setKind(next);
                  setMessage(null);
                  setDetailsOpen(false);
                }}
                selected={kind}
              />
            ) : null}
          </Step>

          <Step number={3} title="Add from">
            <View style={styles.sources}>
              <Source icon="camera" label="Camera" detail="Snap it now" onPress={() => void pickImage(true)} primary />
              <Source icon="image" label="Photos" detail="Up to 8" onPress={() => void pickImage(false)} />
              <Source icon="file" label="Files" detail="PDF or text" onPress={() => void pickDocument()} />
            </View>
          </Step>

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
            style={styles.sampleHit}
          >
            <Text style={styles.sample}>No document handy? Try a sample passport</Text>
          </PressableScale>
        </View>
      ) : null}

      {phase === 'reading' ? (
        <View style={styles.reading}>
          <VaultMark compact />
          <Text style={styles.readingText}>{readingLabel}</Text>
          <Text style={styles.readingHint}>Keep the app open for a moment.</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepNumber}>{number}</Text>
        </View>
        <Text numberOfLines={1} style={styles.stepTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Source({
  icon,
  label,
  detail,
  onPress,
  primary = false,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={[styles.source, primary ? styles.sourcePrimary : null]}>
      <View style={[styles.sourceIcon, primary ? styles.sourceIconPrimary : null]}>
        <Icon color={primary ? theme.ink : theme.gold} name={icon} size={28} />
      </View>
      <Text style={[styles.sourceLabel, primary ? styles.sourceLabelPrimary : null]}>{label}</Text>
      <Text style={[styles.sourceDetail, primary ? styles.sourceDetailPrimary : null]}>{detail}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  ended: {
    marginTop: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    padding: 22,
    alignItems: 'center',
  },
  endedIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(0.10),
  },
  endedTitle: { color: theme.paper, fontFamily: font.display, fontSize: 24, marginTop: 14, textAlign: 'center' },
  endedBody: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' },
  endedButton: {
    marginTop: 18,
    minHeight: 52,
    alignSelf: 'stretch',
    borderRadius: 16,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedButtonText: { color: theme.ink, fontFamily: font.semibold, fontSize: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, color: theme.paper, fontFamily: font.display, fontSize: 30, lineHeight: 36 },
  step: { marginTop: 26 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paper,
  },
  stepNumber: { color: theme.ink, fontFamily: font.semibold, fontSize: 13 },
  stepTitle: { flex: 1, color: theme.paper, fontFamily: font.semibold, fontSize: 18 },
  kindRow: {
    marginTop: 12,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    paddingHorizontal: 16,
  },
  kindValue: { color: theme.paper, fontFamily: font.medium, fontSize: 16 },
  kindChange: { color: theme.gold, fontFamily: font.semibold, fontSize: 15 },
  sources: { flexDirection: 'row', gap: 10, marginTop: 12 },
  source: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  sourcePrimary: { backgroundColor: theme.gold, borderColor: theme.gold },
  sourceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tint(0.10),
    marginBottom: 4,
  },
  sourceIconPrimary: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  sourceLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  sourceLabelPrimary: { color: theme.ink },
  sourceDetail: { color: theme.paperDim, fontFamily: font.body, fontSize: 12, textAlign: 'center' },
  sourceDetailPrimary: { color: wash(0.85) },
  reading: { alignItems: 'center', marginTop: 48 },
  readingText: { color: theme.paper, fontFamily: font.semibold, fontSize: 18, marginTop: 8 },
  readingHint: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, marginTop: 6 },
  sampleHit: { alignSelf: 'center', marginTop: 24, minHeight: 44, justifyContent: 'center' },
  sample: { color: theme.gold, fontFamily: font.semibold, fontSize: 15, textAlign: 'center' },
});
