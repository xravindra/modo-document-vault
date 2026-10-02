import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';

import { FieldRow } from '@/components/FieldRow';
import { ZoomFrame } from '@/components/ZoomFrame';
import { KindPicker } from '@/components/KindPicker';
import { MemberPicker } from '@/components/MemberPicker';
import { PdfFrame } from '@/components/PdfFrame';
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

type SheetName = 'edit' | 'collage' | 'lock' | 'member' | 'category' | 'rename';

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
  const [draftName, setDraftName] = useState('');
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [showMore, setShowMore] = useState(false);
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
    setShowMore(false);
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
    setShowMore(false);
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
    if (!doc || pageIndex !== 0) return;
    setDraftName(doc.fileName);
  }

  async function commitRename() {
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
          <BackButton label="Back" />
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
        <Text style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.who}>
          {documentMember(doc)} · {kindLabel(doc.kind)}
          {doc.favourite ? ' · Favourite' : ''}
        </Text>
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
            <Text numberOfLines={1} style={styles.captionName}>
              {shownName}
            </Text>
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
        <Text style={styles.detailsTitle}>{fields.length > 0 ? 'Details' : 'No details on this page'}</Text>
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
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.dockInner, { width: Math.min(width, 560) }]}>
          <PressableScale
            accessibilityLabel={`Share ${shownName}`}
            disabled={!plain || integrity !== 'ok'}
            onPress={() => void shareFile()}
            style={styles.dockButton}
          >
            <Text style={styles.dockLabel}>Share</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="Document actions"
            onPress={() => {
              setShowMore(false);
              setSheet('edit');
            }}
            style={styles.dockEdit}
          >
            <Text style={styles.dockEditLabel}>Actions</Text>
          </PressableScale>
        </View>
      </View>
      <Modal animationType="slide" onRequestClose={() => setSheet(null)} transparent visible={sheet !== null}>
        <View style={styles.sheetLayer}>
          <Pressable accessibilityLabel="Close edits" onPress={() => setSheet(null)} style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { maxHeight: Math.max(320, height - insets.top - 24), paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              {sheet !== 'edit' ? (
                <PressableScale accessibilityLabel="Back to actions" onPress={() => setSheet('edit')} style={styles.sheetLink}>
                  <Text style={styles.sheetLinkText}>Actions</Text>
                </PressableScale>
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
                      ? 'Family'
                      : sheet === 'category'
                        ? 'Category'
                        : sheet === 'rename'
                          ? 'Rename'
                          : 'Actions'}
              </Text>
              <PressableScale accessibilityLabel="Close" onPress={() => setSheet(null)} style={styles.sheetLink}>
                <Text style={styles.sheetLinkText}>Close</Text>
              </PressableScale>
            </View>
            {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
              {sheet === 'edit' ? (
                <View>
                  <Row
                    accessibilityLabel={`Download ${shownName}`}
                    disabled={!plain || integrity !== 'ok'}
                    label="Download"
                    onPress={() => void download()}
                  />
                  <Row accessibilityLabel="Rotate document" label="Rotate" onPress={() => void rotateDocument()} />
                  <Row
                    accessibilityLabel={doc.favourite ? 'Remove from favourites' : 'Mark as a favourite'}
                    label={doc.favourite ? 'Remove favourite' : 'Favourite'}
                    onPress={() => void vault.toggleFavourite(doc.id)}
                  />
                  <Row accessibilityLabel="Change family member" label={documentMember(doc)} onPress={() => setSheet('member')} />
                  <Row
                    accessibilityLabel={`Delete document ${doc.title}`}
                    disabled={removing || deletingPage}
                    label={removing ? 'Removing…' : 'Delete'}
                    onPress={() => void remove()}
                    tone="danger"
                  />
                  <Row
                    accessibilityLabel={showMore ? 'Hide extra actions' : 'Show more actions'}
                    label={showMore ? 'Hide more' : 'More'}
                    onPress={() => setShowMore((open) => !open)}
                  />
                  {showMore ? (
                    <View>
                      <Row
                        accessibilityLabel={imageFile ? 'Convert this image to a PDF' : 'Convert this PDF to an image'}
                        disabled={busyCopy !== null || !plain || integrity !== 'ok' || showingLocked || (!imageFile && !pdfFile)}
                        label={busyCopy === 'convert' ? 'Converting…' : imageFile ? 'Make a PDF' : pdfFile ? 'Make an image' : 'Convert'}
                        onPress={() => void convertFile()}
                      />
                      <Row accessibilityLabel="Make a collage" label="Collage" onPress={() => setSheet('collage')} />
                      <Row
                        accessibilityLabel="Save a copy of this document"
                        disabled={busyCopy !== null || integrity !== 'ok'}
                        label={busyCopy === 'duplicate' ? 'Copying…' : 'Duplicate'}
                        onPress={() => void duplicateFile()}
                      />
                      <Row
                        accessibilityLabel="Add a page"
                        disabled={adding}
                        label={adding ? 'Adding…' : 'Add a page'}
                        onPress={() => void addPages()}
                      />
                      <Row
                        accessibilityLabel={`Extract text from ${shownName}`}
                        disabled={extracting || !plain || integrity !== 'ok'}
                        label={extracting ? 'Reading…' : 'Read the text'}
                        onPress={() => void extractText()}
                      />
                      <Row
                        accessibilityLabel={extracted.noiseCleared ? 'Show the original text' : 'Clear noise from the text'}
                        label={extracted.noiseCleared ? 'Show original text' : 'Hide noisy lines'}
                        onPress={() => void toggleNoise()}
                      />
                      <Row accessibilityLabel="Reset document to the original" label="Reset" onPress={() => void resetDocument()} />
                      <Row
                        accessibilityLabel="Save extracted fields"
                        disabled={saving}
                        label={saving ? 'Saving…' : 'Save details'}
                        onPress={() => void saveFields()}
                      />
                      <Row accessibilityLabel="Add a field" label="Add a detail" onPress={addField} />
                      {fields.length > 0 ? (
                        <Row accessibilityLabel={`Share details from ${doc.title}`} label="Share details" onPress={() => void shareDetails()} />
                      ) : null}
                      <Row
                        accessibilityLabel={showingLocked ? `Unlock file ${shownName}` : `Lock file ${shownName}`}
                        disabled={unlocking || !plain || integrity !== 'ok'}
                        label={unlocking ? 'Working…' : showingLocked ? 'Unlock' : 'Lock with a password'}
                        onPress={() => {
                          setMessage(null);
                          if (hasTwin) {
                            void switchCopy();
                            return;
                          }
                          setPassword('');
                          setConfirmPassword('');
                          setSheet('lock');
                        }}
                      />
                      <Row accessibilityLabel="Change category" label={kindLabel(doc.kind)} onPress={() => setSheet('category')} />
                      <Row
                        accessibilityLabel={`Rename ${shownName}`}
                        disabled={pageIndex !== 0}
                        label="Rename"
                        onPress={() => {
                          beginRename();
                          setSheet('rename');
                        }}
                      />
                      <Row
                        accessibilityLabel={`Delete page ${shownIndex + 1} of ${doc.title}`}
                        disabled={deletingPage || removing}
                        label={deletingPage ? 'Deleting…' : 'Delete this page'}
                        onPress={() => void deletePage()}
                        tone="danger"
                      />
                    </View>
                  ) : null}
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
                    placeholderTextColor="rgba(244, 246, 250, 0.38)"
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
                      placeholderTextColor="rgba(244, 246, 250, 0.38)"
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
                        setSheet('edit');
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
                        setSheet('edit');
                        setMessage(`Category set to ${kindLabel(kind)}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not change the category.');
                      });
                  }}
                  selected={doc.kind}
                />
              ) : null}
              {sheet === 'rename' ? (
                <View>
                  <Text style={styles.panelNote}>This changes the file name stored with the document.</Text>
                  <TextInput
                    accessibilityLabel="File name"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    onChangeText={setDraftName}
                    onSubmitEditing={() => void commitRename()}
                    style={styles.sheetInput}
                    value={draftName}
                  />
                  <PressableScale
                    accessibilityLabel="Save file name"
                    onPress={() => {
                      void commitRename();
                      setSheet('edit');
                    }}
                    style={styles.panelPrimary}
                  >
                    <Text style={styles.panelPrimaryText}>Save name</Text>
                  </PressableScale>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({
  label,
  onPress,
  disabled,
  tone = 'plain',
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'danger';
  accessibilityLabel: string;
}) {
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, disabled ? styles.rowOff : null]}
    >
      <Text style={[styles.rowLabel, tone === 'danger' ? styles.rowDanger : null]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  scroll: { flex: 1, width: '100%' },
  column: { alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  centerHit: { borderRadius: 999, backgroundColor: theme.paper, paddingHorizontal: 14, paddingVertical: 8 },
  centerText: { color: theme.ink, fontFamily: font.semibold, fontSize: 14 },
  docTitle: { color: theme.paper, fontFamily: font.display, fontSize: 34, lineHeight: 38, marginTop: 8 },
  who: { color: theme.paperDim, fontFamily: font.medium, fontSize: 15, marginTop: 8 },
  stage: {
    marginTop: 18,
    borderRadius: 28,
    backgroundColor: theme.inkRaised,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  previewScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  previewCard: { backgroundColor: theme.sheet, overflow: 'hidden' },
  previewFill: { width: '100%', height: '100%', margin: 0, padding: 0, borderWidth: 0 },
  fileFace: {
    width: '100%',
    height: '100%',
    color: theme.ink,
    backgroundColor: theme.sheet,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
  },
  caption: { paddingHorizontal: 18, paddingTop: 14 },
  captionName: { color: theme.paper, fontFamily: font.semibold, fontSize: 15 },
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
  detailsTitle: {
    color: theme.gold,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.ink,
    borderTopWidth: 1,
    borderTopColor: theme.line,
    paddingTop: 10,
    alignItems: 'center',
  },
  dockInner: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  dockButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.inkRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 16 },
  dockEdit: {
    flex: 1.15,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockEditLabel: { color: theme.ink, fontFamily: font.semibold, fontSize: 16 },
  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.inkRaised,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(232, 161, 90, 0.55)', marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { color: theme.paper, fontFamily: font.display, fontSize: 28 },
  sheetLink: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  sheetLinkText: { color: theme.gold, fontFamily: font.semibold, fontSize: 15 },
  sheetMessage: { color: theme.gold, fontFamily: font.medium, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  sheetBody: { paddingBottom: 12 },
  row: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  rowOff: { opacity: 0.4 },
  rowLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 17 },
  rowDanger: { color: theme.danger },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionLabel: {
    width: '100%',
    color: theme.paperFaint,
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: theme.inkSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  tileWide: { width: '100%', flexBasis: '100%', flexGrow: 0 },
  tileDanger: { backgroundColor: 'rgba(240, 168, 160, 0.12)' },
  tileOff: { opacity: 0.4 },
  tileLabel: { color: theme.paper, fontFamily: font.semibold, fontSize: 17 },
  tileLabelMint: { color: theme.gold },
  tileLabelDanger: { color: theme.danger },
  tileDetail: { color: theme.paperDim, fontFamily: font.medium, fontSize: 13, marginTop: 6 },
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
