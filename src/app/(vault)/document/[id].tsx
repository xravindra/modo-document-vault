import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';

import { ActionIcon, type ActionName } from '@/components/ActionIcon';
import { FieldRow } from '@/components/FieldRow';
import { ZoomFrame } from '@/components/ZoomFrame';
import { KindPicker } from '@/components/KindPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { PdfFrame } from '@/components/PdfFrame';
import { CategoryAvatar, MemberAvatar } from '@/components/Avatar';
import { BackButton, Banner, Headline, PressableScale, Screen, goBack } from '@/components/ui';
import { canEmbedImage, collagePdf, imageToPdf, renamedExtension, type CollageLayout } from '@/lib/convert';
import { deliverFile, previewUri, shareDocument } from '@/lib/deliver';
import { extractDocument } from '@/lib/extract';
import { frameSize } from '@/lib/face';
import { parseFields } from '@/lib/fields';
import { clearNoise } from '@/lib/noise';
import { engineLabel, formatBytes, shareSummary } from '@/lib/format';
import { documentMember } from '@/lib/members';
import { documentPages, MAX_PAGES, pageExtraction } from '@/lib/pages';
import { lockDocumentFile, pdfIsPasswordProtected, removePdfPassword } from '@/lib/pdfPassword';
import { pdfPageRatio } from '@/lib/pdfText';
import { pdfToJpeg } from '@/lib/pdfRaster';
import { readSource } from '@/lib/readSource';
import { kindLabel, type ExtractedField, type Extraction } from '@/lib/types';
import type { PageInput } from '@/lib/vault';
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
  const [fileName, setFileName] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deletingPage, setDeletingPage] = useState(false);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [turn, setTurn] = useState(0);
  const [zoomKey, setZoomKey] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [busyCopy, setBusyCopy] = useState<'convert' | 'duplicate' | 'collage' | null>(null);
  const [collageOpen, setCollageOpen] = useState(false);
  const [collageLayout, setCollageLayout] = useState<CollageLayout>('row');
  const [collageExtras, setCollageExtras] = useState<{ bytes: Uint8Array; mime: string }[]>([]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fieldSeq = useRef(0);

  useEffect(() => {
    setPageIndex(0);
    setCollageOpen(false);
    setCollageExtras([]);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setImageRatio(null);
    setRenaming(false);
    setPreview(null);
    setPlain(null);
    setIntegrity('checking');
    let revoke: () => void = () => undefined;
    let live = true;
    (async () => {
      try {
        const opened = await session.openDocument(id, pageIndex);
        if (!live) return;
        setIntegrity(opened.integrity);
        setPlain(opened.bytes);
        setMime(opened.mimeType);
        setFileName(opened.fileName);
        await vault.refresh();
        if (!live || !opened.bytes || opened.integrity !== 'ok') return;
        if (opened.mimeType.startsWith('image/') || opened.mimeType.includes('pdf')) {
          const next = await previewUri(opened.bytes, opened.mimeType);
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
  }, [id, pageIndex, revision, vault.refresh]);

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
    setFields(doc ? pageExtraction(doc, pageIndex).fields.map((field) => ({ ...field })) : []);
  }, [doc, pageIndex]);

  useEffect(() => {
    setAskPassword(false);
    setPassword('');
    setConfirmPassword('');
    setMenuOpen(false);
    setMemberOpen(false);
    setKindOpen(false);
    setZoomKey((value) => value + 1);
  }, [id, pageIndex]);

  useEffect(() => {
    setTurn(doc?.rotation ?? 0);
  }, [doc?.id, doc?.rotation]);

  const passwordProtected = useMemo(() => {
    if (integrity !== 'ok' || !plain) return false;
    const pdf = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    return pdf && pdfIsPasswordProtected(plain);
  }, [integrity, plain, mime, fileName]);

  const pageMeta = doc ? documentPages(doc)[Math.min(pageIndex, Math.max(documentPages(doc).length - 1, 0))] : undefined;
  const hasTwin = Boolean(pageMeta?.twin);
  const showingLocked = pageMeta?.locked === true || (!hasTwin && passwordProtected);
  const frameAspect = mime.startsWith('image/')
    ? imageRatio && imageRatio > 0
      ? imageRatio
      : 210 / 297
    : (mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) && plain
      ? 1 / Math.max(pdfPageRatio(plain), 0.2)
      : 210 / 297;
  const face = frameSize(height, frameAspect > 0 ? 1 / frameAspect : 297 / 210);
  const imageFile = mime.startsWith('image/');
  const pdfFile = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const collageCount = (plain && canEmbedImage(mime) ? 1 : 0) + collageExtras.length;

  function beginRename() {
    if (!doc || renaming || pageIndex !== 0) return;
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
    vault.holdAutoLock();
    try {
      await deliverFile(fileName || doc.fileName, plain, mime || doc.mimeType);
      setMessage('Downloaded. The sealed original is unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not download this document.');
    } finally {
      vault.releaseAutoLock();
    }
  }

  async function shareFile() {
    if (!doc || !plain || integrity !== 'ok') return;
    setMessage(null);
    vault.holdAutoLock();
    try {
      const outcome = await shareDocument({
        title: doc.title,
        text: fileName || doc.fileName,
        file: { fileName: fileName || doc.fileName, mime: mime || doc.mimeType, bytes: plain },
      });
      if (outcome === 'downloaded') {
        setMessage('The file was downloaded because this browser cannot share it directly.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not share this file.');
    } finally {
      vault.releaseAutoLock();
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
      await vault.saveFields(doc.id, fields, pageIndex);
      setMessage('Saved the fields for this page. The sealed file is unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save these fields.');
    } finally {
      setSaving(false);
    }
  }

  async function extractText() {
    if (!doc || !plain || integrity !== 'ok' || extracting) return;
    setExtracting(true);
    const pageMime = mime || doc.mimeType;
    const pageName = fileName || doc.fileName;
    const visual = pageMime.startsWith('image/') || pageMime.includes('pdf') || pageName.toLowerCase().endsWith('.pdf');
    setMessage(visual ? 'Recognizing text…' : null);
    vault.holdAutoLock();
    try {
      const extraction = await extractDocument(plain, mime || doc.mimeType, fileName || doc.fileName);
      await vault.saveExtraction(doc.id, extraction, pageIndex);
      setFields(extraction.fields.map((field) => ({ ...field })));
      const count = extraction.fields.length;
      setMessage(count > 0 ? `Extracted ${count === 1 ? '1 field' : `${count} fields`} from this page.` : extraction.note);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not extract text from this page.');
    } finally {
      setExtracting(false);
      vault.releaseAutoLock();
    }
  }

  async function toggleNoise() {
    if (!doc) return;
    const current = pageExtraction(doc, pageIndex);
    const source = current.sourceText ?? current.text;
    const cleared = current.noiseCleared !== true;
    const text = cleared ? clearNoise(source) : source;
    const extraction = {
      ...current,
      sourceText: source,
      noiseCleared: cleared,
      text,
      fields: parseFields(text),
      note: cleared ? 'Noise was hidden. You can show the original wording again.' : current.note,
    };
    await vault.saveExtraction(doc.id, extraction, pageIndex);
    setFields(extraction.fields.map((field) => ({ ...field })));
    setMessage(cleared ? 'Hid noisy lines. Open More to show the original text.' : 'Showing the original text.');
  }

  async function rotateDocument() {
    if (!doc) return;
    const next = ((doc.rotation ?? 0) + 90) % 360;
    setTurn(next);
    await vault.setRotation(doc.id, next);
  }

  async function resetDocument() {
    if (!doc) return;
    const current = pageExtraction(doc, pageIndex);
    const source = current.sourceText ?? current.text;
    const extraction = {
      ...current,
      sourceText: source,
      noiseCleared: false,
      text: source,
      fields: parseFields(source),
    };
    setTurn(0);
    setZoomKey((value) => value + 1);
    await vault.saveExtraction(doc.id, extraction, pageIndex);
    await vault.setRotation(doc.id, 0);
    setFields(extraction.fields.map((field) => ({ ...field })));
    setMessage('Reset this document to the original view and text.');
  }

  async function sealSibling(title: string, nextName: string, nextMime: string, bytes: Uint8Array) {
    if (!doc) return;
    await vault.addDocument({
      title,
      kind: doc.kind,
      member: documentMember(doc),
      fileName: nextName,
      mimeType: nextMime,
      bytes,
      extraction: {
        engine: 'metadata',
        text: '',
        fields: [],
        note: 'Saved on this device from another document in the vault.',
      },
    });
  }

  async function convertFile() {
    if (!doc || !plain || integrity !== 'ok' || busyCopy) return;
    const image = mime.startsWith('image/');
    const pdf = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    if (!image && !pdf) {
      setMessage('This file cannot be converted.');
      return;
    }
    setBusyCopy('convert');
    setMessage(null);
    vault.holdAutoLock();
    try {
      if (image) {
        const bytes = await imageToPdf(plain, mime);
        await sealSibling(`${doc.title} PDF`, renamedExtension(fileName || doc.fileName, 'pdf'), 'application/pdf', bytes);
        setMessage('Saved a PDF copy in the vault.');
      } else {
        const bytes = await pdfToJpeg(plain);
        await sealSibling(`${doc.title} image`, renamedExtension(fileName || doc.fileName, 'jpg'), 'image/jpeg', bytes);
        setMessage('Saved an image of the first page in the vault.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not convert this file.');
    } finally {
      setBusyCopy(null);
      vault.releaseAutoLock();
    }
  }

  async function duplicateFile() {
    if (!doc || integrity !== 'ok' || busyCopy) return;
    setBusyCopy('duplicate');
    setMessage(null);
    vault.holdAutoLock();
    try {
      const copies = documentPages(doc);
      const inputs: PageInput[] = [];
      for (let index = 0; index < copies.length; index += 1) {
        const opened = await session.openDocument(doc.id, index, false);
        if (!opened.bytes || opened.integrity !== 'ok') throw new Error('Could not copy this document.');
        inputs.push({
          bytes: opened.bytes,
          fileName: opened.fileName,
          mimeType: opened.mimeType,
          ...(copies[index]?.extraction ? { extraction: copies[index].extraction } : {}),
        });
      }
      const first = inputs[0];
      if (!first) throw new Error('Could not copy this document.');
      await vault.addDocument({
        title: `Copy of ${doc.title}`,
        kind: doc.kind,
        member: documentMember(doc),
        fileName: first.fileName,
        mimeType: first.mimeType,
        bytes: first.bytes,
        extraction: first.extraction ?? {
          engine: 'metadata',
          text: '',
          fields: [],
          note: 'Saved on this device from another document in the vault.',
        },
        extraPages: inputs.slice(1),
      });
      setMessage('Saved a copy in the vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not copy this document.');
    } finally {
      setBusyCopy(null);
      vault.releaseAutoLock();
    }
  }

  async function addCollagePhotos() {
    setMessage(null);
    vault.holdAutoLock();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('Photo permission is required to choose images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        exif: false,
        base64: false,
        allowsMultipleSelection: true,
        selectionLimit: 4,
      });
      if (result.canceled || result.assets.length === 0) return;
      const next: { bytes: Uint8Array; mime: string }[] = [];
      for (const asset of result.assets) {
        const bytes = await readSource({ uri: asset.uri, base64: asset.base64, size: asset.fileSize });
        const kind = asset.mimeType ?? 'image/jpeg';
        if (!canEmbedImage(kind)) continue;
        next.push({ bytes, mime: kind });
      }
      if (next.length === 0) {
        setMessage('Choose JPEG or PNG photos.');
        return;
      }
      setCollageExtras((current) => [...current, ...next].slice(0, 4));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read those photos.');
    } finally {
      vault.releaseAutoLock();
    }
  }

  async function saveCollage() {
    if (!doc || busyCopy) return;
    const tiles = [...(plain && canEmbedImage(mime) ? [{ bytes: plain, mime }] : []), ...collageExtras].slice(0, 4);
    if (tiles.length < 2) {
      setMessage('Add at least two JPEG or PNG images.');
      return;
    }
    setBusyCopy('collage');
    setMessage(null);
    vault.holdAutoLock();
    try {
      const bytes = await collagePdf(tiles, collageLayout);
      await sealSibling(`${doc.title} collage`, renamedExtension(fileName || doc.fileName, 'pdf'), 'application/pdf', bytes);
      setCollageOpen(false);
      setCollageExtras([]);
      setMessage('Saved the collage in the vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not make the collage.');
    } finally {
      setBusyCopy(null);
      vault.releaseAutoLock();
    }
  }

  async function shareDetails() {
    if (!doc || fields.length === 0) return;
    setMessage(null);
    vault.holdAutoLock();
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
    } finally {
      vault.releaseAutoLock();
    }
  }

  async function addPages() {
    if (!doc || adding) return;
    const room = MAX_PAGES - documentPages(doc).length;
    if (room <= 0) {
      setMessage(`This document already has ${MAX_PAGES} pages.`);
      return;
    }
    setMessage(null);
    setAdding(true);
    vault.holdAutoLock();
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        base64: false,
        type: ['application/pdf', 'image/*', 'text/plain'],
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const start = documentPages(doc).length;
      const pages: PageInput[] = [];
      for (const asset of picked.assets.slice(0, room)) {
        const bytes = await readSource({
          uri: asset.uri,
          base64: asset.base64,
          file: asset.file,
          size: asset.size,
        });
        const mimeType = asset.mimeType ?? 'application/octet-stream';
        setMessage(`Reading ${asset.name}…`);
        const extraction = await extractDocument(bytes, mimeType, asset.name);
        pages.push({
          fileName: asset.name,
          mimeType,
          bytes,
          extraction,
        });
      }
      await vault.addPages(doc.id, pages);
      setPageIndex(start);
      setMessage(pages.length === 1 ? 'Added a page and read its fields.' : `Added ${pages.length} pages and read each one.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add that page.');
    } finally {
      setAdding(false);
      vault.releaseAutoLock();
    }
  }

  async function switchCopy() {
    if (!doc || unlocking) return;
    setUnlocking(true);
    setMessage(null);
    vault.holdAutoLock();
    try {
      await vault.togglePageLock(doc.id, pageIndex);
      setAskPassword(false);
      setPassword('');
      setConfirmPassword('');
      setRevision((current) => current + 1);
      setMessage(showingLocked ? 'Showing the open file. The locked file is still kept.' : 'Showing the locked file. The open file is still kept.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not switch this file.');
    } finally {
      setUnlocking(false);
      vault.releaseAutoLock();
    }
  }

  async function applyLock() {
    if (!doc || !plain || unlocking) return;
    if (!showingLocked && password !== confirmPassword) {
      setMessage('Those passwords do not match.');
      return;
    }
    setUnlocking(true);
    setMessage(null);
    vault.holdAutoLock();
    const secret = password;
    const pageName = fileName || doc.fileName;
    const pageMime = mime || doc.mimeType;
    try {
      if (showingLocked) {
        const opened = await removePdfPassword(plain, secret);
        let extraction: Extraction;
        try {
          extraction = await extractDocument(opened, 'application/pdf', pageName);
        } catch {
          extraction = pageExtraction(doc, pageIndex);
        }
        await vault.keepAndShow(
          doc.id,
          pageIndex,
          { fileName: pageName.toLowerCase().endsWith('.pdf') ? pageName : `${pageName.replace(/\.[^.]+$/, '') || 'document'}.pdf`, mimeType: 'application/pdf', bytes: opened, extraction },
          false,
        );
        setMessage('Open file saved. The locked file is still kept.');
      } else {
        const locked = await lockDocumentFile(plain, pageMime, secret);
        const lockedName = pageName.toLowerCase().endsWith('.pdf') ? pageName : `${pageName.replace(/\.[^.]+$/, '') || 'document'}.pdf`;
        const extraction = {
          ...pageExtraction(doc, pageIndex),
          note: 'This copy asks for a document password. The open file is still kept.',
        };
        await vault.keepAndShow(doc.id, pageIndex, { fileName: lockedName, mimeType: 'application/pdf', bytes: locked, extraction }, true);
        setMessage('Locked file saved. The open file is still kept.');
      }
      setPassword('');
      setConfirmPassword('');
      setAskPassword(false);
      setRevision((current) => current + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change the lock on this file.');
    } finally {
      setUnlocking(false);
      vault.releaseAutoLock();
    }
  }

  async function deletePage() {
    if (!doc || deletingPage || removing) return;
    const currentPages = documentPages(doc);
    const index = Math.min(pageIndex, currentPages.length - 1);
    const onlyPage = currentPages.length <= 1;
    setDeletingPage(true);
    setMessage(null);
    try {
      await vault.removePage(doc.id, index);
      if (onlyPage) {
        goBack();
        return;
      }
      setPageIndex((current) => Math.min(current, currentPages.length - 2));
      setMessage('Deleted this page.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete this page.');
    } finally {
      setDeletingPage(false);
    }
  }

  async function remove() {
    if (!doc || removing || deletingPage) return;
    setRemoving(true);
    setMessage(null);
    try {
      await vault.removeDocument(doc.id);
      goBack();
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

  const pages = documentPages(doc);
  const shownIndex = Math.min(pageIndex, pages.length - 1);
  const page = pages[shownIndex] ?? pages[0];
  const extracted = pageExtraction(doc, shownIndex);
  const shownName = page?.fileName ?? doc.fileName;

  function changePage(step: number) {
    setPageIndex((current) => Math.min(pages.length - 1, Math.max(0, current + step)));
  }

  return (
    <Screen>
      <BackButton label="Documents" style={styles.backInBar} />
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Headline>{doc.title}</Headline>
        </View>
        <View style={styles.titleActions}>
          {zoomed ? (
            <PressableScale
              accessibilityLabel="Recenter document"
              onPress={() => {
                setZoomed(false);
                setZoomKey((value) => value + 1);
              }}
              style={styles.centerHit}
            >
              <Text style={styles.centerText}>Center</Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
      <View style={styles.quick}>
        <PressableScale
          accessibilityLabel={`Share ${shownName}`}
          disabled={!plain || integrity !== 'ok'}
          onPress={() => void shareFile()}
          style={styles.quickPrimary}
        >
          <Text style={styles.quickPrimaryText}>Share</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel={`Download ${shownName}`}
          disabled={!plain || integrity !== 'ok'}
          onPress={() => void download()}
          style={styles.quickSecondary}
        >
          <Text style={styles.quickSecondaryText}>Download</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="More actions" onPress={() => setMenuOpen(true)} style={styles.quickSecondary}>
          <Text style={styles.quickSecondaryText}>More</Text>
        </PressableScale>
      </View>
      {collageOpen ? (
        <View style={styles.collageBox}>
          <Text style={styles.collageTitle}>Collage</Text>
          <Text style={styles.collageNote}>Side by side or a grid. JPEG and PNG only. The collage is saved as a new PDF.</Text>
          <View style={styles.collageLayouts}>
            <PressableScale
              accessibilityLabel="Side by side collage"
              onPress={() => setCollageLayout('row')}
              style={[styles.collageChip, collageLayout === 'row' ? styles.collageChipOn : null]}
            >
              <Text style={[styles.collageChipText, collageLayout === 'row' ? styles.collageChipTextOn : null]}>Side by side</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Grid collage"
              onPress={() => setCollageLayout('grid')}
              style={[styles.collageChip, collageLayout === 'grid' ? styles.collageChipOn : null]}
            >
              <Text style={[styles.collageChipText, collageLayout === 'grid' ? styles.collageChipTextOn : null]}>Grid</Text>
            </PressableScale>
          </View>
          <Text style={styles.collageCount}>{Math.min(collageCount, 4)} images ready</Text>
          <View style={styles.collageActions}>
            <PressableScale accessibilityLabel="Add photos to the collage" onPress={() => void addCollagePhotos()} style={styles.quickSecondary}>
              <Text style={styles.quickSecondaryText}>Add photos</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Save collage"
              disabled={busyCopy !== null}
              onPress={() => void saveCollage()}
              style={styles.quickPrimary}
            >
              <Text style={styles.quickPrimaryText}>{busyCopy === 'collage' ? 'Saving…' : 'Save collage'}</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Close collage"
              onPress={() => {
                setCollageOpen(false);
                setCollageExtras([]);
              }}
              style={styles.quickSecondary}
            >
              <Text style={styles.quickSecondaryText}>Close</Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
      <PressableScale
        accessibilityLabel={`Change family member, currently ${documentMember(doc)}`}
        onPress={() => setMemberOpen((open) => !open)}
        style={styles.categoryRow}
      >
        <MemberAvatar name={documentMember(doc)} size={40} />
        <View style={styles.categoryCopy}>
          <Text style={styles.categoryLabel}>Family member</Text>
          <Text style={styles.categoryValue}>{documentMember(doc)}</Text>
        </View>
        <Text style={styles.categoryAction}>{memberOpen ? 'Close' : 'Change'}</Text>
      </PressableScale>
      {memberOpen ? (
        <MemberPicker
          members={vault.members}
          onRemoved={(name) => setMessage(`${name} was removed. Their documents are filed under Self.`)}
          onSelect={(name) => {
            setMessage(null);
            void vault
              .assignMember(doc.id, name)
              .then(() => {
                setMemberOpen(false);
                setMessage(`Filed under ${name}.`);
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : 'Could not file this document.');
              });
          }}
          selected={doc.member ?? ''}
        />
      ) : null}
      <PressableScale
        accessibilityLabel={`Change category, currently ${kindLabel(doc.kind)}`}
        onPress={() => setKindOpen((open) => !open)}
        style={styles.categoryRow}
      >
        <CategoryAvatar kind={doc.kind} size={40} />
        <View style={styles.categoryCopy}>
          <Text style={styles.categoryLabel}>Category</Text>
          <Text style={styles.categoryValue}>{kindLabel(doc.kind)}</Text>
        </View>
        <Text style={styles.categoryAction}>{kindOpen ? 'Close' : 'Change'}</Text>
      </PressableScale>
      {kindOpen ? (
        <KindPicker
          categories={vault.categories}
          onRemoved={(name) => setMessage(`${name} was removed. Those documents are now Other.`)}
          onSelect={(kind) => {
            setMessage(null);
            void vault
              .assignKind(doc.id, kind)
              .then(() => {
                setKindOpen(false);
                setMessage(`Category set to ${kindLabel(kind)}.`);
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : 'Could not change the category.');
              });
          }}
          selected={doc.kind}
        />
      ) : null}
      <View style={styles.metaRow}>
        {renaming && pageIndex === 0 ? (
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
        ) : pageIndex === 0 ? (
          <PressableScale accessibilityLabel={`Rename ${shownName}`} onPress={beginRename} style={styles.fileNameHit}>
            <Text style={styles.fileName}>{shownName}</Text>
          </PressableScale>
        ) : (
          <Text style={styles.meta}>{shownName}</Text>
        )}
        <Text style={styles.meta}>
          {' · '}
          {formatBytes(page?.byteLength ?? doc.byteLength)} · {engineLabel(extracted.engine)}
        </Text>
      </View>
      {pages.length > 1 ? (
        <View style={styles.pager}>
          <PressableScale
            accessibilityLabel="Previous page"
            disabled={pageIndex === 0}
            onPress={() => setPageIndex((current) => Math.max(0, current - 1))}
            style={styles.pageStep}
          >
            <Text style={[styles.pageStepText, pageIndex === 0 ? styles.pageStepOff : null]}>Previous</Text>
          </PressableScale>
          <Text style={styles.pageCount}>
            Page {pageIndex + 1} of {pages.length}. Swipe the page sideways.
          </Text>
          <PressableScale
            accessibilityLabel="Next page"
            disabled={pageIndex >= pages.length - 1}
            onPress={() => setPageIndex((current) => Math.min(pages.length - 1, current + 1))}
            style={styles.pageStep}
          >
            <Text style={[styles.pageStepText, pageIndex >= pages.length - 1 ? styles.pageStepOff : null]}>Next</Text>
          </PressableScale>
        </View>
      ) : null}
      <View style={[styles.badge, integrity === 'failed' ? styles.badgeBad : null]}>
        <Text style={styles.badgeText}>
          {integrity === 'checking'
            ? 'Checking integrity…'
            : integrity === 'ok'
              ? 'Checked'
              : 'This file could not be verified.'}
        </Text>
      </View>
      <Banner message={message} />
      {preview ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.previewScroll, { height: face.height }]} contentContainerStyle={styles.previewScrollContent}>
        <View style={[styles.previewCard, { width: face.width, height: face.height }]}>
          <ZoomFrame onSwipe={pages.length > 1 ? changePage : undefined} onZoomed={setZoomed} resetKey={zoomKey} rotation={turn}>
            {mime.startsWith('image/') ? (
              <Image
                accessibilityLabel="Document preview"
                resizeMode="contain"
                source={{ uri: preview }}
                style={styles.previewFill}
              />
            ) : null}
            {mime.includes('pdf') && plain ? <PdfFrame resetKey={zoomKey} uri={preview} ratio={pdfPageRatio(plain)} /> : null}
            {!mime.startsWith('image/') && !(mime.includes('pdf') && plain) ? (
              <Text style={styles.fileFace}>{extracted.text || doc.title}</Text>
            ) : null}
          </ZoomFrame>
        </View>
        </ScrollView>
      ) : null}
      <Text style={styles.note}>{extracted.note}</Text>
      {fields.length === 0 ? <Text style={styles.note}>No structured fields were found on this page.</Text> : null}
      {fields.map((field, index) => (
        <FieldRow
          key={`${shownIndex}-${field.key}`}
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
      {askPassword && !hasTwin ? (
        <View style={styles.unlockBox}>
          <Text style={styles.unlockLabel}>{showingLocked ? 'Password that opens this file' : 'Password for the locked file'}</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            editable={!unlocking}
            onChangeText={setPassword}
            onSubmitEditing={() => void applyLock()}
            placeholder="Document password"
            placeholderTextColor="rgba(16, 22, 20, 0.38)"
            secureTextEntry
            style={styles.unlockInput}
            textContentType="none"
            value={password}
          />
          {showingLocked ? null : (
            <TextInput
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              editable={!unlocking}
              onChangeText={setConfirmPassword}
              onSubmitEditing={() => void applyLock()}
              placeholder="Confirm password"
              placeholderTextColor="rgba(16, 22, 20, 0.38)"
              secureTextEntry
              style={styles.unlockInput}
              textContentType="none"
              value={confirmPassword}
            />
          )}
          <View style={styles.unlockRow}>
            <PressableScale
              accessibilityLabel="Cancel"
              disabled={unlocking}
              onPress={() => {
                setAskPassword(false);
                setPassword('');
                setConfirmPassword('');
              }}
              style={styles.unlockCancel}
            >
              <Text style={styles.unlockCancelText}>Cancel</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel={showingLocked ? 'Unlock file' : 'Lock file'}
              disabled={unlocking}
              onPress={() => void applyLock()}
              style={styles.unlockSubmit}
            >
              <Text style={styles.unlockSubmitText}>{unlocking ? (showingLocked ? 'Unlocking…' : 'Locking…') : showingLocked ? 'Unlock file' : 'Lock file'}</Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
      <Modal animationType="fade" onRequestClose={() => setMenuOpen(false)} transparent visible={menuOpen}>
        <View style={styles.menuLayer}>
          <Pressable accessibilityLabel="Close actions" onPress={() => setMenuOpen(false)} style={styles.menuBackdrop} />
          <View
            style={[
              styles.menu,
              {
                top: insets.top + 62,
                right: Math.max(0, (width - Math.min(width, 560)) / 2) + 22,
                maxHeight: Math.max(220, height - insets.top - insets.bottom - 88),
              },
            ]}
          >
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel={doc.favourite ? 'Remove from favourites' : 'Mark as a favourite'}
            icon="save"
            label={doc.favourite ? 'Remove favourite' : 'Favourite'}
            onPress={() => void vault.toggleFavourite(doc.id)}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={`Share file ${shownName}`}
            disabled={!plain || integrity !== 'ok'}
            icon="share"
            label="Share"
            onPress={() => void shareFile()}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={`Download ${shownName}`}
            disabled={!plain || integrity !== 'ok'}
            icon="download"
            label="Download"
            onPress={() => void download()}
            tone="gold"
          />
          <Text style={styles.menuLabel}>Modify</Text>
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Rotate document"
            icon="details"
            label="Rotate"
            onPress={() => void rotateDocument()}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel={imageFile ? 'Convert this image to a PDF' : 'Convert this PDF to an image'}
            disabled={busyCopy !== null || !plain || integrity !== 'ok' || showingLocked || (!imageFile && !pdfFile)}
            icon="details"
            label={busyCopy === 'convert' ? 'Converting…' : imageFile ? 'Convert to PDF' : pdfFile ? 'Convert to image' : 'Convert'}
            onPress={() => void convertFile()}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Make a collage"
            icon="add"
            label="Make a collage"
            onPress={() => setCollageOpen(true)}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Save a copy of this page"
            disabled={busyCopy !== null || !plain || integrity !== 'ok'}
            icon="add"
            label={busyCopy === 'duplicate' ? 'Copying…' : 'Duplicate'}
            onPress={() => void duplicateFile()}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel={extracted.noiseCleared ? 'Show the original text' : 'Clear noise from the text'}
            icon="details"
            label={extracted.noiseCleared ? 'Show original text' : 'Clear noise'}
            onPress={() => void toggleNoise()}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Reset document to the original"
            icon="details"
            label="Reset to original"
            onPress={() => void resetDocument()}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Add a page"
            disabled={adding}
            icon="add"
            label={adding ? 'Adding…' : 'Add a page'}
            onPress={() => void addPages()}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Save extracted fields"
            disabled={saving}
            icon="save"
            label={saving ? 'Saving…' : 'Save'}
            onPress={() => void saveFields()}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={`Extract text from ${shownName}`}
            disabled={extracting || !plain || integrity !== 'ok'}
            icon="extract"
            label={extracting ? 'Extracting…' : 'Extract text'}
            onPress={() => void extractText()}
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={showingLocked ? `Unlock file ${shownName}` : `Lock file ${shownName}`}
            disabled={unlocking || !plain || integrity !== 'ok'}
            icon={showingLocked ? 'unlock' : 'lock'}
            label={
              unlocking
                ? hasTwin
                  ? 'Switching…'
                  : showingLocked
                    ? 'Unlocking…'
                    : 'Locking…'
                : showingLocked
                  ? 'Unlock file'
                  : 'Lock file'
            }
            onPress={() => {
              setMessage(null);
              if (hasTwin) {
                void switchCopy();
                return;
              }
              setAskPassword((open) => {
                if (open) {
                  setPassword('');
                  setConfirmPassword('');
                }
                return !open;
              });
            }}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Change family member"
            icon="details"
            label="Change family member"
            onPress={() => setMemberOpen(true)}
          />
          <ActionButton
            dismiss={() => setMenuOpen(false)}
            accessibilityLabel="Change category"
            icon="details"
            label="Change category"
            onPress={() => setKindOpen(true)}
          />
          <ActionButton dismiss={() => setMenuOpen(false)} accessibilityLabel="Add a field" icon="add" label="Add a field" onPress={addField} />
          {fields.length > 0 ? (
            <ActionButton dismiss={() => setMenuOpen(false)}
              accessibilityLabel={`Share details from ${doc.title}`}
              icon="details"
              label="Share details"
              onPress={() => void shareDetails()}
            />
          ) : null}
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={`Delete page ${shownIndex + 1} of ${doc.title}`}
            disabled={deletingPage || removing}
            icon="remove"
            label={deletingPage ? 'Deleting…' : 'Delete page'}
            onPress={() => void deletePage()}
            tone="danger"
          />
          <ActionButton dismiss={() => setMenuOpen(false)}
            accessibilityLabel={`Delete document ${doc.title}`}
            disabled={removing || deletingPage}
            icon="remove"
            label={removing ? 'Removing…' : 'Delete document'}
            onPress={() => void remove()}
            tone="danger"
          />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  tone = 'paper',
  accessibilityLabel,
  dismiss,
}: {
  label: string;
  icon: ActionName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'paper' | 'gold' | 'danger';
  accessibilityLabel: string;
  dismiss: () => void;
}) {
  const color = tone === 'gold' ? theme.gold : tone === 'danger' ? theme.danger : theme.paper;
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => {
        dismiss();
        onPress();
      }}
      style={styles.action}
    >
      <ActionIcon color={color} name={icon} />
      <Text style={[styles.actionText, tone === 'gold' ? styles.goldText : null, tone === 'danger' ? styles.removeText : null]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  metaRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  categoryRow: {
    width: '100%',
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryLabel: {
    color: theme.paperFaint,
    fontFamily: font.medium,
    fontSize: 13,
  },
  categoryValue: { color: theme.paper, fontFamily: font.medium, fontSize: 16, marginTop: 2 },
  categoryAction: {
    color: theme.ink,
    fontFamily: font.semibold,
    fontSize: 14,
    backgroundColor: theme.paper,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileNameHit: { maxWidth: '100%', flexShrink: 1, paddingVertical: 2 },
  fileName: {
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 14,
    textDecorationLine: 'underline',
    maxWidth: '100%',
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleCopy: { flex: 1, minWidth: 0 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
  centerHit: { borderRadius: 999, backgroundColor: theme.paper, paddingHorizontal: 12, paddingVertical: 6 },
  centerText: { color: theme.ink, fontFamily: font.semibold, fontSize: 13 },
  heartHit: { paddingHorizontal: 4 },
  heart: { fontSize: 28 },
  previewFrame: { width: '100%', aspectRatio: 210 / 297 },
  previewFill: { width: '100%', height: '100%', margin: 0, padding: 0, borderWidth: 0 },
  previewScroll: { width: '100%', maxWidth: '100%', marginTop: 16 },
  previewScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  previewCard: {
    padding: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: theme.sheet,
    overflow: 'hidden',
  },
  preview: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: theme.ink,
  },
  imagePending: { width: '100%', height: 260 },
  fileFace: {
    width: '100%',
    alignSelf: 'stretch',
    color: theme.ink,
    backgroundColor: theme.sheet,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
    margin: 0,
    padding: 0,
  },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 16 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  pageStep: { paddingVertical: 8, paddingHorizontal: 4 },
  pageStepText: { color: theme.gold, fontFamily: font.semibold, fontSize: 14 },
  pageStepOff: { color: theme.paperFaint },
  pageCount: { color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  unlockBox: {
    width: '100%',
    maxWidth: '100%',
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: theme.sheet,
  },
  unlockLabel: {
    color: theme.goldDeep,
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  unlockInput: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(28, 25, 21, 0.06)',
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
    outlineWidth: 0,
  },
  unlockRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  unlockCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 22, 20, 0.08)',
  },
  unlockSubmit: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paper,
  },
  unlockCancelText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  unlockSubmitText: { color: theme.sheet, fontFamily: font.semibold, fontSize: 15, textAlign: 'center' },
  quick: { flexDirection: 'row', gap: 8, marginTop: 18 },
  quickPrimary: { flex: 1.2, backgroundColor: theme.paper, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  quickPrimaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  quickSecondary: {
    flex: 1,
    backgroundColor: theme.inkRaised,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  quickSecondaryText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  topBar: {
    width: '100%',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backInBar: { marginBottom: 0 },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  burger: { width: 18, height: 2, borderRadius: 1, backgroundColor: theme.gold },
  menuLayer: { flex: 1 },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(16, 22, 20, 0.28)',
  },
  menu: {
    position: 'absolute',
    zIndex: 2,
    width: 280,
    maxWidth: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    paddingVertical: 6,
  },
  menuLabel: {
    color: theme.paperFaint,
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
  },
  collageBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: theme.inkRaised,
  },
  collageTitle: { color: theme.paper, fontFamily: font.semibold, fontSize: 18 },
  collageNote: { color: theme.paperDim, fontFamily: font.body, fontSize: 14, lineHeight: 20, marginTop: 6 },
  collageLayouts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  collageChip: { borderRadius: 999, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, paddingVertical: 8 },
  collageChipOn: { backgroundColor: theme.paper, borderColor: theme.paper },
  collageChipText: { color: theme.paper, fontFamily: font.semibold, fontSize: 14 },
  collageChipTextOn: { color: theme.ink },
  collageCount: { color: theme.gold, fontFamily: font.medium, fontSize: 14, marginTop: 12 },
  collageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionText: { flex: 1, color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  goldText: { color: theme.gold },
  removeText: { color: theme.danger },
});
