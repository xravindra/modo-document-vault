import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';

import { ActionIcon, type ActionName } from '@/components/ActionIcon';
import { FieldRow } from '@/components/FieldRow';
import { PdfFrame } from '@/components/PdfFrame';
import { BackButton, Banner, Headline, Kicker, PressableScale, Screen } from '@/components/ui';
import { deliverFile, previewUri, shareDocument } from '@/lib/deliver';
import { extractDocument } from '@/lib/extract';
import { engineLabel, formatBytes, shareSummary } from '@/lib/format';
import { documentPages, MAX_PAGES, pageExtraction } from '@/lib/pages';
import { lockDocumentFile, pdfIsPasswordProtected, removePdfPassword } from '@/lib/pdfPassword';
import { pdfPageRatio } from '@/lib/pdfText';
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
  const [revision, setRevision] = useState(0);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const fieldSeq = useRef(0);

  useEffect(() => {
    setPageIndex(0);
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
  }, [id, pageIndex]);

  const passwordProtected = useMemo(() => {
    if (integrity !== 'ok' || !plain) return false;
    const pdf = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    return pdf && pdfIsPasswordProtected(plain);
  }, [integrity, plain, mime, fileName]);

  const pageMeta = doc ? documentPages(doc)[Math.min(pageIndex, Math.max(documentPages(doc).length - 1, 0))] : undefined;
  const hasTwin = Boolean(pageMeta?.twin);
  const showingLocked = pageMeta?.locked === true || (!hasTwin && passwordProtected);

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
        router.back();
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

  const pages = documentPages(doc);
  const shownIndex = Math.min(pageIndex, pages.length - 1);
  const page = pages[shownIndex] ?? pages[0];
  const extracted = pageExtraction(doc, shownIndex);
  const shownName = page?.fileName ?? doc.fileName;

  return (
    <Screen>
      <BackButton label="Back" />
      <Kicker>{kindLabel(doc.kind)}</Kicker>
      <Headline>{doc.title}</Headline>
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
            Page {pageIndex + 1} of {pages.length}
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
              ? 'SHA-256 matches the sealed original'
              : 'Integrity check failed. The file was not shown.'}
        </Text>
      </View>
      <Banner message={message} />
      {preview && (mime.startsWith('image/') || (mime.includes('pdf') && plain)) ? (
        <View style={styles.previewCard}>
          {mime.startsWith('image/') ? (
            <Image
              accessibilityLabel="Document preview"
              resizeMode="contain"
              source={{ uri: preview }}
              style={[styles.preview, imageRatio ? { aspectRatio: imageRatio } : styles.imagePending]}
            />
          ) : null}
          {mime.includes('pdf') && plain ? <PdfFrame uri={preview} ratio={pdfPageRatio(plain)} /> : null}
        </View>
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
      <View style={styles.actions}>
        <ActionButton
          accessibilityLabel={`Share file ${shownName}`}
          disabled={!plain || integrity !== 'ok'}
          icon="share"
          label="Share"
          onPress={() => void shareFile()}
        />
        <ActionButton
          accessibilityLabel="Save extracted fields"
          disabled={saving}
          icon="save"
          label={saving ? 'Saving…' : 'Save'}
          onPress={() => void saveFields()}
        />
        <ActionButton
          accessibilityLabel={`Download ${shownName}`}
          disabled={!plain || integrity !== 'ok'}
          icon="download"
          label="Download"
          onPress={() => void download()}
          tone="gold"
        />
        <ActionButton
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
        <ActionButton accessibilityLabel="Add a field" icon="add" label="Add a field" onPress={addField} />
        <ActionButton
          accessibilityLabel="Add a page"
          disabled={adding}
          icon="add"
          label={adding ? 'Adding…' : 'Add a page'}
          onPress={() => void addPages()}
        />
        {fields.length > 0 ? (
          <ActionButton
            accessibilityLabel={`Share details from ${doc.title}`}
            icon="details"
            label="Share details"
            onPress={() => void shareDetails()}
          />
        ) : null}
        <ActionButton
          accessibilityLabel={`Delete page ${shownIndex + 1} of ${doc.title}`}
          disabled={deletingPage || removing}
          icon="remove"
          label={deletingPage ? 'Deleting…' : 'Delete page'}
          onPress={() => void deletePage()}
          tone="danger"
        />
        <ActionButton
          accessibilityLabel={`Delete document ${doc.title}`}
          disabled={removing || deletingPage}
          icon="remove"
          label={removing ? 'Removing…' : 'Delete document'}
          onPress={() => void remove()}
          tone="danger"
        />
      </View>
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
}: {
  label: string;
  icon: ActionName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'paper' | 'gold' | 'danger';
  accessibilityLabel: string;
}) {
  const color = tone === 'gold' ? theme.ink : tone === 'danger' ? theme.danger : theme.paper;
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, tone === 'gold' ? styles.download : null, tone === 'danger' ? styles.remove : null]}
    >
      <ActionIcon color={color} name={icon} />
      <Text style={[styles.actionText, tone === 'gold' ? styles.downloadText : null, tone === 'danger' ? styles.removeText : null]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  metaRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
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
  previewCard: {
    width: '100%',
    maxWidth: '100%',
    marginTop: 16,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.inkRaised,
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
    borderRadius: 12,
    backgroundColor: theme.ink,
  },
  imagePending: { height: 220 },
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
    backgroundColor: theme.paper,
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
    backgroundColor: 'rgba(16, 22, 20, 0.08)',
    color: theme.ink,
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
    backgroundColor: theme.ink,
  },
  unlockCancelText: { color: theme.ink, fontFamily: font.semibold, fontSize: 15 },
  unlockSubmitText: { color: theme.paper, fontFamily: font.semibold, fontSize: 15, textAlign: 'center' },
  actions: {
    width: '100%',
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 22,
  },
  action: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: 'flex-start',
    width: 120,
    maxWidth: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.line,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: { color: theme.paper, fontFamily: font.semibold, fontSize: 13, textAlign: 'center' },
  download: { backgroundColor: theme.gold, borderColor: theme.gold },
  downloadText: { color: theme.ink },
  remove: { borderColor: 'rgba(224, 139, 122, 0.45)' },
  removeText: { color: theme.danger },
});
