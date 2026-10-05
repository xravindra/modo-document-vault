import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';

import { FieldRow } from '@/components/FieldRow';
import { ZoomFrame } from '@/components/ZoomFrame';
import { KindPicker } from '@/components/KindPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { PdfFrame } from '@/components/PdfFrame';
import { Icon, type IconName } from '@/components/Icon';
import { BackButton, Banner, Group, Headline, IconButton, ListRow, PressableScale, Screen, goBack } from '@/components/ui';
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
import { usePlan } from '@/state/PlanContext';
import { useVault } from '@/state/VaultContext';
import { font, shade, theme } from '@/theme';

type SheetName = 'edit' | 'collage' | 'lock' | 'member' | 'category';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vault = useVault();
  const plan = usePlan();
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
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renamingRef = useRef(false);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [detailsMenu, setDetailsMenu] = useState(false);
  const [revision, setRevision] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [sheet, setSheetState] = useState<SheetName | null>(null);
  const [direct, setDirect] = useState(false);

  function setSheet(next: SheetName | null) {
    setDirect(false);
    setSheetState(next);
  }

  function openDirect(next: 'member' | 'category') {
    setSheetState(next);
    setDirect(true);
  }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [turn, setTurn] = useState(0);
  const [zoomKey, setZoomKey] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [busyCopy, setBusyCopy] = useState<'convert' | 'duplicate' | 'collage' | null>(null);
  const [collageLayout, setCollageLayout] = useState<CollageLayout>('row');
  const [collageExtras, setCollageExtras] = useState<{ bytes: Uint8Array; mime: string }[]>([]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fieldSeq = useRef(0);

  useEffect(() => {
    setPageIndex(0);
    setSheet(null);
    setCollageExtras([]);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setImageRatio(null);
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
    setPassword('');
    setConfirmPassword('');
    setSheet(null);
    setZoomKey((value) => value + 1);
  }, [id, pageIndex]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [sheet]);

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
  const stageWidth = Math.min(width, 560) - 36 - 2 - 24;
  const face = frameSize(height, frameAspect > 0 ? 1 / frameAspect : 297 / 210, Math.round(height * 0.72), stageWidth);
  const imageFile = mime.startsWith('image/');
  const pdfFile = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const collageCount = (plain && canEmbedImage(mime) ? 1 : 0) + collageExtras.length;

  function startLock() {
    setMessage(null);
    if (hasTwin) {
      void switchCopy();
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setSheet('lock');
  }

  function beginRename() {
    if (!doc || pageIndex !== 0) return;
    setDraftName(doc.fileName);
    renamingRef.current = true;
    setRenaming(true);
  }

  async function commitRename() {
    if (!renamingRef.current) return;
    renamingRef.current = false;
    setRenaming(false);
    if (!doc) return;
    const next = draftName.trim();
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

  const fieldsChanged = useMemo(() => {
    if (!doc) return false;
    const snapshot = (list: ExtractedField[]) => JSON.stringify(list.map((field) => [field.label.trim(), field.value.trim()]));
    return snapshot(fields) !== snapshot(pageExtraction(doc, pageIndex).fields);
  }, [doc, fields, pageIndex]);

  function addField() {
    fieldSeq.current += 1;
    setFields((current) => [
      { key: `custom-${fieldSeq.current}`, label: '', value: '', confidence: 1 },
      ...current,
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
    setMessage(cleared ? 'Hid noisy lines. Open Edit to show the original text.' : 'Showing the original text.');
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
        setSheet(null);
        setMessage('Saved a PDF copy in the vault.');
      } else {
        const bytes = await pdfToJpeg(plain);
        await sealSibling(`${doc.title} image`, renamedExtension(fileName || doc.fileName, 'jpg'), 'image/jpeg', bytes);
        setSheet(null);
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
      setSheet(null);
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
      setSheet(null);
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
      setSheet(null);
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
      setSheet(null);
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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.column, { width: Math.min(width, 560), paddingBottom: insets.bottom + 128 }]}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topRight}>
            <IconButton label="Back" name="back" onPress={() => goBack()} />
            {zoomed ? (
              <PressableScale
                accessibilityLabel="Recenter document"
                onPress={() => {
                  setZoomed(false);
                  setZoomKey((value) => value + 1);
                }}
                style={styles.centerHit}
              >
                <Text style={styles.centerText}>Fit</Text>
              </PressableScale>
            ) : null}
          </View>
          <View style={styles.topRight}>
            <IconButton
              disabled={unlocking || !plain || integrity !== 'ok'}
              label={showingLocked ? 'Unlock file' : 'Lock with a password'}
              name={showingLocked ? 'unlock' : 'lock'}
              onPress={startLock}
              tone={showingLocked ? 'accent' : 'plain'}
            />
            <IconButton
              disabled={plan.canCreate && (busyCopy !== null || integrity !== 'ok')}
              label="Duplicate"
              name="copy"
              onPress={() => {
                if (!plan.canCreate) {
                  router.push('/plans' as Href);
                  return;
                }
                void duplicateFile();
              }}
            />
            <IconButton label="Rotate" name="rotate" onPress={() => void rotateDocument()} />
            <IconButton
              label={extracted.noiseCleared ? 'Show original text' : 'Hide noisy lines'}
              name="sparkle"
              onPress={() => void toggleNoise()}
              tone={extracted.noiseCleared ? 'accent' : 'plain'}
            />
            <IconButton
              filled={!!doc.favourite}
              label={doc.favourite ? 'Remove from favourites' : 'Mark as a favourite'}
              name="heart"
              onPress={() => void vault.toggleFavourite(doc.id)}
              tone={doc.favourite ? 'danger' : 'plain'}
            />
          </View>
        </View>
        <Text style={styles.docTitle}>{doc.title}</Text>
        <View style={styles.chips}>
          <PressableScale accessibilityLabel={`Filed under ${documentMember(doc)}. Change`} onPress={() => openDirect('member')} style={styles.chip}>
            <Icon color={theme.gold} name="user" size={16} />
            <Text numberOfLines={1} style={styles.chipText}>
              {documentMember(doc)}
            </Text>
          </PressableScale>
          <PressableScale accessibilityLabel={`Category ${kindLabel(doc.kind)}. Change`} onPress={() => openDirect('category')} style={styles.chip}>
            <Icon color={theme.gold} name="tag" size={16} />
            <Text numberOfLines={1} style={styles.chipText}>
              {kindLabel(doc.kind)}
            </Text>
          </PressableScale>
        </View>
        <Banner message={sheet ? null : message} />
        <View style={styles.stage}>
          <ScrollView
            horizontal
            contentContainerStyle={styles.previewScrollContent}
            showsHorizontalScrollIndicator={false}
            style={{ height: face.height }}
          >
            <View style={[styles.previewCard, { width: face.width, height: face.height }]}>
              {preview ? (
                <ZoomFrame onSwipe={pages.length > 1 ? changePage : undefined} onZoomed={setZoomed} resetKey={zoomKey} rotation={turn}>
                  {mime.startsWith('image/') ? (
                    <Image accessibilityLabel="Document preview" resizeMode="contain" source={{ uri: preview }} style={styles.previewFill} />
                  ) : null}
                  {mime.includes('pdf') && plain ? <PdfFrame resetKey={zoomKey} uri={preview} ratio={pdfPageRatio(plain)} /> : null}
                  {!mime.startsWith('image/') && !(mime.includes('pdf') && plain) ? (
                    <Text style={styles.fileFace}>{extracted.text || doc.title}</Text>
                  ) : null}
                </ZoomFrame>
              ) : (
                <Text style={styles.fileFace}>{integrity === 'checking' ? 'Opening…' : extracted.text || doc.title}</Text>
              )}
            </View>
          </ScrollView>
          <View style={styles.caption}>
            {renaming ? (
              <TextInput
                accessibilityLabel="File name"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onBlur={() => void commitRename()}
                onChangeText={setDraftName}
                onSubmitEditing={() => void commitRename()}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.captionInput}
                value={draftName}
              />
            ) : (
              <PressableScale
                accessibilityLabel={pageIndex === 0 ? `Rename ${shownName}` : `File name ${shownName}`}
                disabled={pageIndex !== 0}
                onPress={beginRename}
                style={styles.captionNameHit}
              >
                <Text numberOfLines={1} style={styles.captionName}>
                  {shownName}
                </Text>
                {pageIndex === 0 ? <Icon color={theme.paperFaint} name="pencil" size={14} /> : null}
              </PressableScale>
            )}
            <Text style={styles.captionMeta}>
              {formatBytes(page?.byteLength ?? doc.byteLength)}
              {' · '}
              {integrity === 'checking' ? 'Checking' : integrity === 'ok' ? 'Checked' : 'Could not verify'}
              {' · '}
              {engineLabel(extracted.engine)}
            </Text>
          </View>
          {pages.length > 1 ? (
            <ScrollView horizontal contentContainerStyle={styles.pager} showsHorizontalScrollIndicator={false}>
              {pages.map((item, index) => (
                <PressableScale
                  key={`${item.fileName}-${index}`}
                  accessibilityLabel={`Page ${index + 1}`}
                  onPress={() => setPageIndex(index)}
                  style={[styles.pagePill, index === shownIndex ? styles.pagePillOn : null]}
                >
                  <Text style={[styles.pagePillText, index === shownIndex ? styles.pagePillTextOn : null]}>{index + 1}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          ) : null}
        </View>
        {extracted.note ? <Text style={styles.note}>{extracted.note}</Text> : null}
        <View style={styles.detailsHead}>
          <Text numberOfLines={1} style={styles.detailsTitle}>
            {fields.length > 0 ? 'Details' : 'No details on this page'}
          </Text>
          <PressableScale
            accessibilityLabel={detailsMenu ? 'Close details menu' : 'Details menu'}
            onPress={() => setDetailsMenu((open) => !open)}
            style={[styles.detailsMenuButton, detailsMenu ? styles.detailsMenuButtonOn : null]}
          >
            <Icon color={detailsMenu ? theme.ink : theme.gold} name="menu" size={20} />
          </PressableScale>
        </View>
        {detailsMenu ? (
          <View style={styles.detailsMenu}>
            <PressableScale
              accessibilityLabel="Add a detail"
              onPress={() => {
                setDetailsMenu(false);
                addField();
              }}
              style={styles.detailsMenuRow}
            >
              <Icon color={theme.gold} name="plus" size={18} />
              <Text style={styles.detailsMenuText}>Add new</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel={fields.length > 0 ? 'Extract text' : 'Read text'}
              disabled={extracting || !plain || integrity !== 'ok'}
              onPress={() => {
                setDetailsMenu(false);
                void extractText();
              }}
              style={[styles.detailsMenuRow, styles.detailsMenuLine]}
            >
              <Icon color={theme.gold} name="text" size={18} />
              <Text style={styles.detailsMenuText}>{extracting ? 'Reading…' : fields.length > 0 ? 'Extract text' : 'Read text'}</Text>
            </PressableScale>
            {fields.length > 0 ? (
              <PressableScale
                accessibilityLabel="Share text"
                onPress={() => {
                  setDetailsMenu(false);
                  void shareDetails();
                }}
                style={[styles.detailsMenuRow, styles.detailsMenuLine]}
              >
                <Icon color={theme.gold} name="share" size={18} />
                <Text style={styles.detailsMenuText}>Share text</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
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
      </ScrollView>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.dockInner}>
          <DockAction disabled={saving || !fieldsChanged} icon="check" label={saving ? 'Saving…' : 'Save details'} onPress={() => void saveFields()} />
          <DockAction disabled={!plain || integrity !== 'ok'} icon="download" label="Download" onPress={() => void download()} />
          <DockAction
            disabled={!plain || integrity !== 'ok'}
            icon="share"
            label="Share"
            onPress={() => void shareFile()}
            primary
          />
          <DockAction icon="more" label="More" onPress={() => setSheet('edit')} />
        </View>
      </View>
      <Modal animationType="slide" onRequestClose={() => setSheet(null)} transparent visible={sheet !== null}>
        <View style={styles.sheetLayer}>
          <Pressable accessibilityLabel="Close edits" onPress={() => setSheet(null)} style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { maxHeight: Math.max(320, height - insets.top - 24), paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              {sheet !== 'edit' && !direct ? (
                <IconButton label="Back to all actions" name="back" onPress={() => setSheet('edit')} />
              ) : (
                <View style={styles.sheetLink} />
              )}
              <Text style={styles.sheetTitle}>
                {sheet === 'collage'
                  ? 'Collage'
                  : sheet === 'lock'
                    ? showingLocked
                      ? 'Unlock'
                      : 'Lock'
                    : sheet === 'member'
                      ? 'Filed under'
                      : sheet === 'category'
                        ? 'Category'
                        : 'More'}
              </Text>
              <IconButton label="Close" name="close" onPress={() => setSheet(null)} />
            </View>
            {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
              {sheet === 'edit' ? (
                <View style={styles.groups}>
                  {plan.canCreate ? null : (
                    <Group title="Create">
                      <ListRow
                        detail="Pages, PDFs, collages, and copies come with MODO Plus"
                        icon="lock"
                        label="Subscribe to create"
                        last
                        onPress={() => {
                          setSheet(null);
                          router.push('/plans' as Href);
                        }}
                        value="Plans"
                      />
                    </Group>
                  )}
                  {plan.canCreate ? (
                  <Group title="Create">
                    <ListRow
                      detail={`Up to ${MAX_PAGES} pages`}
                      disabled={adding}
                      icon="pageAdd"
                      label={adding ? 'Adding…' : 'Add a page'}
                      onPress={() => void addPages()}
                    />
                    <ListRow
                      detail={imageFile ? 'Saved as a new PDF' : 'First page as a JPEG'}
                      disabled={busyCopy !== null || !plain || integrity !== 'ok' || showingLocked || (!imageFile && !pdfFile)}
                      icon="convert"
                      label={busyCopy === 'convert' ? 'Converting…' : imageFile ? 'Make a PDF' : 'Make an image'}
                      onPress={() => void convertFile()}
                    />
                    <ListRow detail="Combine up to 4 photos" icon="grid" label="Collage" last onPress={() => setSheet('collage')} />
                  </Group>
                  ) : null}
                  <Group title="Remove">
                    <ListRow icon="reset" label="Reset to original" onPress={() => void resetDocument()} />
                    {pages.length > 1 ? (
                      <ListRow
                        disabled={deletingPage || removing}
                        icon="trash"
                        label={deletingPage ? 'Deleting…' : `Delete page ${shownIndex + 1}`}
                        onPress={() => void deletePage()}
                        tone="danger"
                      />
                    ) : null}
                    <ListRow
                      accessibilityLabel={`Delete document ${doc.title}`}
                      disabled={removing || deletingPage}
                      icon="trash"
                      detail={confirmDelete ? 'This cannot be undone' : undefined}
                      label={removing ? 'Deleting…' : confirmDelete ? 'Tap again to delete' : 'Delete document'}
                      last
                      onPress={() => {
                        if (!confirmDelete) {
                          setConfirmDelete(true);
                          return;
                        }
                        void remove();
                      }}
                      tone="danger"
                    />
                  </Group>
                </View>
              ) : null}
              {sheet === 'collage' ? (
                <View>
                  <Text style={styles.panelNote}>Side by side, top to bottom, or a grid. JPEG and PNG only. Saved as a new PDF.</Text>
                  <View style={styles.collageLayouts}>
                    <PressableScale
                      accessibilityLabel="Side by side collage"
                      onPress={() => setCollageLayout('row')}
                      style={[styles.choice, collageLayout === 'row' ? styles.choiceOn : null]}
                    >
                      <Text style={[styles.choiceText, collageLayout === 'row' ? styles.choiceTextOn : null]}>Side by side</Text>
                    </PressableScale>
                    <PressableScale
                      accessibilityLabel="Top to bottom collage"
                      onPress={() => setCollageLayout('stack')}
                      style={[styles.choice, collageLayout === 'stack' ? styles.choiceOn : null]}
                    >
                      <Text style={[styles.choiceText, collageLayout === 'stack' ? styles.choiceTextOn : null]}>Top to bottom</Text>
                    </PressableScale>
                    <PressableScale
                      accessibilityLabel="Grid collage"
                      onPress={() => setCollageLayout('grid')}
                      style={[styles.choice, collageLayout === 'grid' ? styles.choiceOn : null]}
                    >
                      <Text style={[styles.choiceText, collageLayout === 'grid' ? styles.choiceTextOn : null]}>Grid</Text>
                    </PressableScale>
                  </View>
                  <Text style={styles.collageCount}>{Math.min(collageCount, 4)} images ready</Text>
                  <PressableScale accessibilityLabel="Add photos to the collage" onPress={() => void addCollagePhotos()} style={styles.panelButton}>
                    <Text style={styles.panelButtonText}>Add photos</Text>
                  </PressableScale>
                  <PressableScale
                    accessibilityLabel="Save collage"
                    disabled={busyCopy !== null}
                    onPress={() => void saveCollage()}
                    style={styles.panelPrimary}
                  >
                    <Text style={styles.panelPrimaryText}>{busyCopy === 'collage' ? 'Saving…' : 'Save collage'}</Text>
                  </PressableScale>
                </View>
              ) : null}
              {sheet === 'lock' ? (
                <View>
                  <Text style={styles.panelNote}>{showingLocked ? 'Password that opens this file.' : 'Password for the locked copy. The open file stays.'}</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect={false}
                    editable={!unlocking}
                    onChangeText={setPassword}
                    onSubmitEditing={() => void applyLock()}
                    placeholder="Document password"
                    placeholderTextColor={theme.paperFaint}
                    secureTextEntry
                    style={styles.sheetInput}
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
                      placeholderTextColor={theme.paperFaint}
                      secureTextEntry
                      style={styles.sheetInput}
                      textContentType="none"
                      value={confirmPassword}
                    />
                  )}
                  <PressableScale
                    accessibilityLabel={showingLocked ? 'Unlock file' : 'Lock file'}
                    disabled={unlocking}
                    onPress={() => void applyLock()}
                    style={styles.panelPrimary}
                  >
                    <Text style={styles.panelPrimaryText}>
                      {unlocking ? (showingLocked ? 'Unlocking…' : 'Locking…') : showingLocked ? 'Unlock file' : 'Lock file'}
                    </Text>
                  </PressableScale>
                </View>
              ) : null}
              {sheet === 'member' ? (
                <MemberPicker
                  members={vault.members}
                  onRemoved={(name) => setMessage(`${name} was removed. Their documents are filed under Self.`)}
                  onSelect={(name) => {
                    setMessage(null);
                    void vault
                      .assignMember(doc.id, name)
                      .then(() => {
                        setSheet(null);
                        setMessage(`Filed under ${name}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not file this document.');
                      });
                  }}
                  selected={doc.member ?? ''}
                />
              ) : null}
              {sheet === 'category' ? (
                <KindPicker
                  categories={vault.categories}
                  onRemoved={(name) => setMessage(`${name} was removed. Those documents are now Other.`)}
                  onSelect={(kind) => {
                    setMessage(null);
                    void vault
                      .assignKind(doc.id, kind)
                      .then(() => {
                        setSheet(null);
                        setMessage(`Category set to ${kindLabel(kind)}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not change the category.');
                      });
                  }}
                  selected={doc.kind}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DockAction({
  icon,
  label,
  onPress,
  disabled,
  primary = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <PressableScale accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.dockButton, primary ? styles.dockPrimary : null]}>
      <Icon color={primary ? theme.ink : theme.paper} name={icon} size={22} />
      <Text numberOfLines={1} style={[styles.dockLabel, primary ? styles.dockLabelPrimary : null]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  scroll: { flex: 1, width: '100%' },
  column: { alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  centerHit: { minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: theme.paper, paddingHorizontal: 16 },
  centerText: { color: theme.ink, fontFamily: font.semibold, fontSize: 14 },
  docTitle: { color: theme.paper, fontFamily: font.display, fontSize: 28, lineHeight: 34, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  chipText: { flexShrink: 1, color: theme.paper, fontFamily: font.medium, fontSize: 14 },
  groups: { marginTop: -12 },
  stage: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  previewScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  previewCard: { backgroundColor: theme.sheet, overflow: 'hidden', borderRadius: 12 },
  previewFill: { width: '100%', height: '100%', margin: 0, padding: 0, borderWidth: 0 },
  fileFace: {
    width: '100%',
    height: '100%',
    color: theme.paper,
    backgroundColor: theme.sheet,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
  },
  caption: { paddingHorizontal: 18, paddingTop: 14 },
  captionName: { flexShrink: 1, color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  captionNameHit: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', minHeight: 32 },
  captionInput: {
    color: theme.paper,
    fontFamily: font.semibold,
    fontSize: 15,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.gold,
    backgroundColor: theme.sheet,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  captionMeta: { color: theme.paperDim, fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  pager: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  pagePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.inkSoft,
  },
  pagePillOn: { backgroundColor: theme.gold },
  pagePillText: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  pagePillTextOn: { color: theme.ink },
  note: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginTop: 16 },
  detailsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  detailsTitle: {
    flex: 1,
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  detailsMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
  },
  detailsMenuButtonOn: { backgroundColor: theme.gold, borderColor: theme.gold },
  detailsMenu: {
    alignSelf: 'flex-end',
    minWidth: 200,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
    overflow: 'hidden',
  },
  detailsMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14 },
  detailsMenuLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line },
  detailsMenuText: { color: theme.paper, fontFamily: font.medium, fontSize: 15 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    alignItems: 'center',
    backgroundColor: theme.inkRaised,
    borderTopWidth: 1,
    borderTopColor: theme.line,
  },
  dockInner: { width: '100%', maxWidth: 560, flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  dockButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dockPrimary: { backgroundColor: theme.gold },
  dockLabel: { color: theme.paper, fontFamily: font.medium, fontSize: 12 },
  dockLabelPrimary: { color: theme.ink, fontFamily: font.semibold },
  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: shade(0.28) },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.ink,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: shade(0.18), marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { color: theme.paper, fontFamily: font.display, fontSize: 24 },
  sheetLink: { width: 44, height: 44 },
  sheetMessage: { color: theme.gold, fontFamily: font.medium, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  sheetBody: { paddingBottom: 12 },
  panelNote: { color: theme.paperDim, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  collageLayouts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  choice: {
    minHeight: 52,
    minWidth: 140,
    flexGrow: 1,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { backgroundColor: theme.gold },
  choiceText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
  choiceTextOn: { color: theme.ink },
  collageCount: { color: theme.gold, fontFamily: font.semibold, fontSize: 15, marginTop: 16 },
  panelButton: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: theme.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelButtonText: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  panelPrimary: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelPrimaryText: { color: theme.ink, fontFamily: font.semibold, fontSize: 16 },
  sheetInput: {
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: theme.inkSoft,
    color: theme.paper,
    fontFamily: font.body,
    fontSize: 16,
  },
});
