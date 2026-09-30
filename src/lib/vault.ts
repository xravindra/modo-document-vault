import { AESEncryptionKey, randomUUID } from 'expo-crypto';

import { parseBackup, serializeBackup, type BackupFile } from './backup';
import { isPin, PIN_LENGTH } from './pin';
import { base64ToBytes, bytesToBase64, exceedsFileLimit, renamedFileName, wipe } from './bytes';
import { deviceBiometricsAvailable, promptBiometrics } from './biometrics';
import * as blobs from './blobStore';
import * as keys from './keyStore';
import { createEnvelope, openBytes, openEnvelope, sealBytes, sha256Hex, VaultError } from './seal';
import { documentPages, MAX_PAGES, pageBlobName, pageExtraction, pageTwinBlobName } from './pages';
import { emptyCatalog, type ActivityType, type Catalog, type DocKind, type DocumentPage, type Extraction, type PageCopy, type Settings, type VaultDocument } from './types';
const CATALOG = 'catalog.bin';
const MAX_ACTIVITY = 180;

export type PageInput = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  extraction?: Extraction;
};

export type AddDocumentInput = {
  title: string;
  kind: DocKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  extraction: Extraction;
  extraPages?: PageInput[];
};

export type OpenedDocument = {
  doc: VaultDocument;
  bytes: Uint8Array | null;
  integrity: 'ok' | 'failed';
  fileName: string;
  mimeType: string;
};

class VaultSession {
  private key: AESEncryptionKey | null = null;
  private catalog: Catalog = emptyCatalog();
  private queue: Promise<unknown> = Promise.resolve();
  private viewed = new Set<string>();

  get unlocked() {
    return this.key !== null;
  }

  snapshot(): Catalog {
    return {
      documents: [...this.catalog.documents],
      activity: [...this.catalog.activity],
      settings: { ...this.catalog.settings },
    };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private assertOpen(): AESEncryptionKey {
    if (!this.key) throw new VaultError('Unlock the vault first.');
    return this.key;
  }

  private remember(type: ActivityType, detail: string) {
    this.catalog.activity.unshift({ id: randomUUID(), at: Date.now(), type, detail });
    this.catalog.activity = this.catalog.activity.slice(0, MAX_ACTIVITY);
  }

  private async persist() {
    const key = this.assertOpen();
    const plain = new TextEncoder().encode(JSON.stringify(this.catalog));
    await blobs.writeBlob(CATALOG, await sealBytes(key, plain));
  }

  private async readCatalog(): Promise<Catalog> {
    const key = this.assertOpen();
    const sealed = await blobs.readBlob(CATALOG);
    if (!sealed) throw new VaultError('The vault catalog is missing.');
    try {
      const plain = await openBytes(key, sealed);
      const parsed = JSON.parse(new TextDecoder().decode(plain)) as Catalog;
      if (!Array.isArray(parsed.documents) || !Array.isArray(parsed.activity) || !parsed.settings) {
        throw new Error('invalid');
      }
      return parsed;
    } catch (error) {
      if (error instanceof VaultError) throw error;
      throw new VaultError('The vault catalog failed its integrity check.');
    }
  }

  async hasEnvelope() {
    return (await keys.readEnvelope()) !== null;
  }

  async expectedPinLength() {
    return PIN_LENGTH;
  }

  async biometricsReady() {
    const mode = await keys.readBioMode();
    return mode !== 'off' && (await deviceBiometricsAvailable());
  }

  async bioMode() {
    return keys.readBioMode();
  }

  create(pin: string) {
    return this.enqueue(async () => {
      if (!isPin(pin)) throw new VaultError(`Use a ${PIN_LENGTH}-digit PIN.`);
      if (await keys.readEnvelope()) throw new VaultError('A vault already exists on this device.');
      const vaultKey = await AESEncryptionKey.generate();
      try {
        await this.commitPin(pin, vaultKey);
      } catch (error) {
        await keys.clearEnvelope();
        throw error;
      }
      this.key = vaultKey;
      this.catalog = emptyCatalog();
      this.remember('create', 'Vault created on this device');
      await this.persist();
    });
  }

  unlock(pin: string, failedAttempts = 0) {
    return this.enqueue(async () => {
      const envelope = await keys.readEnvelope();
      if (!envelope) throw new VaultError('Create a PIN before unlocking.');
      let key: AESEncryptionKey;
      try {
        key = await openEnvelope(pin, envelope);
        this.key = key;
      } catch (error) {
        this.key = null;
        throw error instanceof VaultError ? error : new VaultError('That PIN does not open this vault.');
      }
      try {
        this.catalog = await this.readCatalog();
      } catch (error) {
        this.key = null;
        throw error;
      }
      if (failedAttempts > 0) {
        this.remember('unlock', `Opened after ${failedAttempts} incorrect PIN ${failedAttempts === 1 ? 'attempt' : 'attempts'}`);
      } else {
        this.remember('unlock', 'Vault opened');
      }
      if (envelope.version !== 2) {
        try {
          await this.commitPin(pin, key);
        } catch {
          // The PIN opened this vault. Keep the existing seal if the newer wrap cannot be saved.
        }
      }
      await this.persist();
    });
  }

  private async commitPin(pin: string, key: AESEncryptionKey) {
    const previous = await keys.readEnvelope();
    try {
      await keys.writeEnvelope(await createEnvelope(pin, key));
      const saved = await keys.readEnvelope();
      if (!saved) throw new VaultError('The PIN could not be saved on this device. Try again.');
      const opened = await openEnvelope(pin, saved);
      const savedBytes = new Uint8Array(await opened.bytes());
      const freshBytes = new Uint8Array(await key.bytes());
      const match = savedBytes.byteLength === freshBytes.byteLength && savedBytes.every((byte, index) => byte === freshBytes[index]);
      wipe(savedBytes);
      wipe(freshBytes);
      if (!match) throw new VaultError('The PIN could not be saved on this device. Try again.');
    } catch (error) {
      if (previous) await keys.writeEnvelope(previous).catch(() => undefined);
      throw error;
    }
  }

  unlockWithBiometrics() {
    return this.enqueue(async () => {
      const mode = await keys.readBioMode();
      if (mode === 'off') throw new VaultError('Biometrics are not turned on.');
      if (mode === 'gate') {
        const accepted = await promptBiometrics();
        if (!accepted) throw new VaultError('Biometric unlock was cancelled.');
      }
      const hex = await keys.readBiometricKey(mode);
      if (!hex) throw new VaultError('No biometric key is stored on this device.');
      try {
        this.key = await AESEncryptionKey.import(hex, 'hex');
        this.catalog = await this.readCatalog();
      } catch {
        this.key = null;
        throw new VaultError('Biometric unlock could not open the vault.');
      }
      this.remember('unlock', 'Vault opened with biometrics');
      await this.persist();
    });
  }

  lock() {
    return this.enqueue(async () => {
      this.key = null;
      this.catalog = emptyCatalog();
      this.viewed.clear();
    });
  }

  private async sealPages(key: AESEncryptionKey, id: string, pages: PageInput[], start = 0): Promise<DocumentPage[]> {
    const stored: DocumentPage[] = [];
    for (let offset = 0; offset < pages.length; offset += 1) {
      const page = pages[offset];
      if (!page) continue;
      if (exceedsFileLimit(page.bytes.byteLength)) {
        throw new VaultError('Documents larger than 12 MB are not sealed in this version.');
      }
      if (page.bytes.byteLength === 0) throw new VaultError('That file is empty.');
      const sha256 = await sha256Hex(page.bytes);
      await blobs.writeBlob(pageBlobName(id, start + offset), await sealBytes(key, page.bytes));
      stored.push({
        fileName: page.fileName,
        mimeType: page.mimeType || 'application/octet-stream',
        byteLength: page.bytes.byteLength,
        sha256,
        ...(page.extraction ? { extraction: page.extraction } : {}),
      });
    }
    return stored;
  }

  addDocument(input: AddDocumentInput) {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      const incoming = 1 + (input.extraPages?.length ?? 0);
      if (incoming > MAX_PAGES) throw new VaultError(`A document can hold ${MAX_PAGES} pages.`);
      const id = randomUUID();
      const pages = await this.sealPages(key, id, [
        { fileName: input.fileName, mimeType: input.mimeType, bytes: input.bytes, extraction: input.extraction },
        ...(input.extraPages ?? []),
      ]);
      const first = pages[0];
      if (!first) throw new VaultError('That file is empty.');
      const doc: VaultDocument = {
        id,
        title: input.title.trim() || 'Untitled document',
        kind: input.kind,
        fileName: first.fileName,
        mimeType: first.mimeType,
        byteLength: first.byteLength,
        sha256: first.sha256,
        createdAt: Date.now(),
        extraction: input.extraction,
        pages: pages.length > 1 ? pages : undefined,
      };
      this.catalog.documents.unshift(doc);
      this.remember('add', `Sealed ${doc.title}`);
      await this.persist();
      return doc;
    });
  }

  renameDocument(id: string, fileName: string) {
    return this.enqueue(async () => {
      this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      const nextName = renamedFileName(fileName, doc?.fileName ?? '');
      if (!doc || !nextName || nextName === doc.fileName) return;
      const title = nextName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || doc.title;
      const pages = doc.pages?.map((page, pageIndex) => (pageIndex === 0 ? { ...page, fileName: nextName } : page));
      this.catalog.documents[index] = { ...doc, fileName: nextName, title, pages };
      this.remember('rename', `Renamed ${doc.fileName} to ${nextName}`);
      await this.persist();
    });
  }

  saveFields(id: string, fields: { key: string; label: string; value: string; confidence: number }[], pageIndex = 0) {
    return this.enqueue(async () => {
      this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc) return;
      const next = fields.flatMap((field) => {
        const label = field.label.replace(/\s+/g, ' ').trim().slice(0, 80);
        const value = field.value.replace(/\s+/g, ' ').trim().slice(0, 160);
        if (!label && !value) return [];
        return [{ key: field.key, label: label || 'Field', confidence: field.confidence, value }];
      });
      const current = pageExtraction(doc, pageIndex);
      const extraction = { ...current, fields: next };
      const storedPages = doc.pages && doc.pages.length > 0 ? documentPages(doc) : null;
      const pages = storedPages?.map((page, itemIndex) => (itemIndex === pageIndex ? { ...page, extraction } : page));
      this.catalog.documents[index] = {
        ...doc,
        extraction: pageIndex === 0 ? extraction : doc.extraction,
        pages,
      };
      this.remember('edit', `Saved fields on ${doc.title}`);
      await this.persist();
    });
  }

  saveExtraction(id: string, extraction: Extraction, pageIndex = 0) {
    return this.enqueue(async () => {
      this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc) return;
      const storedPages = doc.pages && doc.pages.length > 0 ? documentPages(doc) : null;
      const pages = storedPages?.map((page, itemIndex) => (itemIndex === pageIndex ? { ...page, extraction } : page));
      this.catalog.documents[index] = {
        ...doc,
        extraction: pageIndex === 0 ? extraction : doc.extraction,
        pages,
      };
      this.remember('edit', `Read the text on ${doc.title}`);
      await this.persist();
    });
  }

  addPages(id: string, pages: PageInput[]) {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc || pages.length === 0) return doc ? documentPages(doc).length : 0;
      const existing = documentPages(doc);
      if (existing.length + pages.length > MAX_PAGES) {
        throw new VaultError(`A document can hold ${MAX_PAGES} pages.`);
      }
      const added = await this.sealPages(key, id, pages, existing.length);
      const nextPages = [...existing, ...added];
      const first = nextPages[0] ?? existing[0];
      if (!first) return existing.length;
      this.catalog.documents[index] = {
        ...doc,
        fileName: first.fileName,
        mimeType: first.mimeType,
        byteLength: first.byteLength,
        sha256: first.sha256,
        pages: nextPages,
      };
      this.remember('add', `Added ${added.length} ${added.length === 1 ? 'page' : 'pages'} to ${doc.title}`);
      await this.persist();
      return nextPages.length;
    });
  }

  keepAndShow(id: string, pageIndex: number, input: PageInput, locked: boolean) {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc) throw new VaultError('That document is not in the vault.');
      if (input.bytes.byteLength === 0) throw new VaultError('That file is empty.');
      if (exceedsFileLimit(input.bytes.byteLength)) {
        throw new VaultError('Documents larger than 12 MB are not sealed in this version.');
      }
      const pages = documentPages(doc);
      const at = Math.min(Math.max(pageIndex, 0), Math.max(pages.length - 1, 0));
      const current = pages[at];
      if (!current) throw new VaultError('That page is not in the vault.');
      const currentSealed = await blobs.readBlob(pageBlobName(id, at));
      if (!currentSealed) throw new VaultError('That page is not in the vault.');
      const sha256 = await sha256Hex(input.bytes);
      const twin: PageCopy = {
        fileName: current.fileName,
        mimeType: current.mimeType,
        byteLength: current.byteLength,
        sha256: current.sha256,
        extraction: current.extraction,
      };
      const nextPage: DocumentPage = {
        fileName: input.fileName || current.fileName,
        mimeType: input.mimeType || current.mimeType,
        byteLength: input.bytes.byteLength,
        sha256,
        extraction: input.extraction ?? current.extraction,
        locked,
        twin,
      };
      await blobs.writeBlob(pageTwinBlobName(id, at), currentSealed);
      await blobs.writeBlob(pageBlobName(id, at), await sealBytes(key, input.bytes));
      this.putPages(index, doc, pages.map((page, pageAt) => (pageAt === at ? nextPage : page)), at);
      this.remember('edit', locked ? `Locked a copy of ${doc.title}` : `Unlocked a copy of ${doc.title}`);
      await this.persist();
    });
  }

  togglePageLock(id: string, pageIndex: number) {
    return this.enqueue(async () => {
      this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc) throw new VaultError('That document is not in the vault.');
      const pages = documentPages(doc);
      const at = Math.min(Math.max(pageIndex, 0), Math.max(pages.length - 1, 0));
      const current = pages[at];
      if (!current?.twin) throw new VaultError('There is no other copy of this page.');
      const active = await blobs.readBlob(pageBlobName(id, at));
      const twinBlob = await blobs.readBlob(pageTwinBlobName(id, at));
      if (!active || !twinBlob) throw new VaultError('The other copy of this page is missing.');
      await blobs.writeBlob(pageBlobName(id, at), twinBlob);
      await blobs.writeBlob(pageTwinBlobName(id, at), active);
      const nextPage: DocumentPage = {
        fileName: current.twin.fileName,
        mimeType: current.twin.mimeType,
        byteLength: current.twin.byteLength,
        sha256: current.twin.sha256,
        extraction: current.twin.extraction,
        locked: !current.locked,
        twin: {
          fileName: current.fileName,
          mimeType: current.mimeType,
          byteLength: current.byteLength,
          sha256: current.sha256,
          extraction: current.extraction,
        },
      };
      this.putPages(index, doc, pages.map((page, pageAt) => (pageAt === at ? nextPage : page)), at);
      this.remember('edit', nextPage.locked ? `Showing the locked file for ${doc.title}` : `Showing the open file for ${doc.title}`);
      await this.persist();
    });
  }

  private putPages(index: number, doc: VaultDocument, pages: DocumentPage[], at: number) {
    const root = pages[0];
    const active = pages[at];
    const keepPages = pages.length > 1 || pages.some((page) => page.twin || page.locked);
    this.catalog.documents[index] = {
      ...doc,
      fileName: root?.fileName ?? doc.fileName,
      mimeType: root?.mimeType ?? doc.mimeType,
      byteLength: root?.byteLength ?? doc.byteLength,
      sha256: root?.sha256 ?? doc.sha256,
      extraction: at === 0 ? (active?.extraction ?? doc.extraction) : doc.extraction,
      pages: keepPages ? pages : undefined,
    };
  }

  async openDocument(id: string, pageIndex = 0): Promise<OpenedDocument> {
    const key = this.assertOpen();
    const doc = this.catalog.documents.find((item) => item.id === id);
    if (!doc) throw new VaultError('That document is not in the vault.');
    const pages = documentPages(doc);
    const index = Math.min(Math.max(pageIndex, 0), pages.length - 1);
    const page = pages[index] ?? pages[0];
    const fileName = page?.fileName ?? doc.fileName;
    const mimeType = page?.mimeType ?? doc.mimeType;
    const sealed = await blobs.readBlob(pageBlobName(id, index));
    if (!sealed || !page) {
      return { doc, bytes: null, integrity: 'failed', fileName, mimeType };
    }
    try {
      const plain = await openBytes(key, sealed);
      const hash = await sha256Hex(plain);
      if (!this.viewed.has(id)) {
        this.viewed.add(id);
        try {
          await this.enqueue(async () => {
            if (!this.key) return;
            this.remember('view', `Opened ${doc.title}`);
            await this.persist();
          });
        } catch {
          this.viewed.delete(id);
        }
      }
      return { doc, bytes: plain, integrity: hash === page.sha256 ? 'ok' : 'failed', fileName, mimeType };
    } catch {
      return { doc, bytes: null, integrity: 'failed', fileName, mimeType };
    }
  }

  private async deleteDocument(id: string) {
    this.assertOpen();
    const doc = this.catalog.documents.find((item) => item.id === id);
    if (!doc) return;
    const count = documentPages(doc).length;
    for (let index = 0; index < count; index += 1) {
      await blobs.removeBlob(pageBlobName(id, index));
      await blobs.removeBlob(pageTwinBlobName(id, index));
    }
    this.catalog.documents = this.catalog.documents.filter((item) => item.id !== id);
    this.remember('delete', `Removed ${doc.title}`);
    await this.persist();
  }

  removeDocument(id: string) {
    return this.enqueue(() => this.deleteDocument(id));
  }

  removePage(id: string, pageIndex: number) {
    return this.enqueue(async () => {
      this.assertOpen();
      const index = this.catalog.documents.findIndex((item) => item.id === id);
      const doc = this.catalog.documents[index];
      if (!doc) return;
      const pages = documentPages(doc);
      if (pages.length <= 1) {
        await this.deleteDocument(id);
        return;
      }
      const drop = Math.min(Math.max(pageIndex, 0), pages.length - 1);
      const sealed: Array<Uint8Array | null> = [];
      const twins: Array<Uint8Array | null> = [];
      for (let itemIndex = 0; itemIndex < pages.length; itemIndex += 1) {
        sealed.push(await blobs.readBlob(pageBlobName(id, itemIndex)));
        twins.push(await blobs.readBlob(pageTwinBlobName(id, itemIndex)));
      }
      for (let itemIndex = 0; itemIndex < pages.length; itemIndex += 1) {
        await blobs.removeBlob(pageBlobName(id, itemIndex));
        await blobs.removeBlob(pageTwinBlobName(id, itemIndex));
      }
      const kept = pages.filter((_, itemIndex) => itemIndex !== drop);
      const keptSealed = sealed.filter((_, itemIndex) => itemIndex !== drop);
      const keptTwins = twins.filter((_, itemIndex) => itemIndex !== drop);
      for (let itemIndex = 0; itemIndex < keptSealed.length; itemIndex += 1) {
        const bytes = keptSealed[itemIndex];
        if (bytes) await blobs.writeBlob(pageBlobName(id, itemIndex), bytes);
        const twinBytes = keptTwins[itemIndex];
        if (twinBytes) await blobs.writeBlob(pageTwinBlobName(id, itemIndex), twinBytes);
      }
      const first = kept[0];
      if (!first) return;
      const extraction = drop === 0 ? (first.extraction ?? pageExtraction(doc, 1)) : doc.extraction;
      const keepPages = kept.length > 1 || kept.some((page) => page.twin || page.locked);
      this.catalog.documents[index] = {
        ...doc,
        fileName: first.fileName,
        mimeType: first.mimeType,
        byteLength: first.byteLength,
        sha256: first.sha256,
        extraction,
        pages: keepPages ? kept : undefined,
      };
      this.remember('delete', `Removed a page from ${doc.title}`);
      await this.persist();
    });
  }

  updateSettings(patch: Partial<Settings>) {
    return this.enqueue(async () => {
      this.assertOpen();
      this.catalog.settings = { ...this.catalog.settings, ...patch };
      await this.persist();
    });
  }

  async verifyPin(pin: string) {
    const envelope = await keys.readEnvelope();
    if (!envelope) return false;
    try {
      await openEnvelope(pin, envelope);
      return true;
    } catch {
      return false;
    }
  }

  changePin(next: string) {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      if (!isPin(next)) throw new VaultError(`Use a ${PIN_LENGTH}-digit PIN.`);
      await this.commitPin(next, key);
      this.remember('pin-change', 'PIN changed');
      await this.persist();
    });
  }

  enableBiometrics() {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      if (!(await deviceBiometricsAvailable())) {
        throw new VaultError('This device has no enrolled Face ID or fingerprint.');
      }
      const accepted = await promptBiometrics();
      if (!accepted) throw new VaultError('Biometric setup was cancelled.');
      const mode = await keys.writeBiometricKey(await key.encoded('hex'));
      if (mode === 'off') throw new VaultError('Biometrics are available on iOS and Android.');
      this.catalog.settings.biometrics = true;
      await this.persist();
      return mode;
    });
  }

  disableBiometrics() {
    return this.enqueue(async () => {
      this.assertOpen();
      await keys.clearBiometricKey();
      this.catalog.settings.biometrics = false;
      await this.persist();
    });
  }

  exportBackup() {
    return this.enqueue(async () => {
      this.assertOpen();
      const envelope = await keys.readEnvelope();
      if (!envelope) throw new VaultError('No vault is stored on this device.');
      this.remember('export', 'Exported an encrypted backup');
      await this.persist();
      const names = await blobs.listBlobs();
      const files: Record<string, string> = {};
      for (const name of names) {
        const bytes = await blobs.readBlob(name);
        if (bytes) files[name] = bytesToBase64(bytes);
      }
      if (!files['catalog.bin']) throw new VaultError('The local catalog could not be read.');
      const backup: BackupFile = {
        format: 'modo-vault',
        version: 1,
        exportedAt: Date.now(),
        envelope,
        files,
      };
      return serializeBackup(backup);
    });
  }

  importBackup(bytes: Uint8Array) {
    return this.enqueue(async () => {
      const backup = parseBackup(bytes);
      const decoded: Array<[string, Uint8Array]> = [];
      for (const [name, encoded] of Object.entries(backup.files)) {
        try {
          decoded.push([name, base64ToBytes(encoded)]);
        } catch {
          throw new VaultError('This backup file is damaged.');
        }
      }
      for (const [name, data] of decoded) {
        await blobs.writeBlob(name, data);
      }
      const keep = new Set(decoded.map(([name]) => name));
      for (const name of await blobs.listBlobs()) {
        if (!keep.has(name)) await blobs.removeBlob(name);
      }
      await keys.writeEnvelope(backup.envelope);
      await keys.clearBiometricKey();
      this.key = null;
      this.catalog = emptyCatalog();
      this.viewed.clear();
    });
  }

  destroy() {
    return this.enqueue(async () => {
      this.assertOpen();
      await blobs.clearBlobs();
      await keys.clearEnvelope();
      await keys.clearBiometricKey();
      this.key = null;
      this.catalog = emptyCatalog();
      this.viewed.clear();
    });
  }
}

export const session = new VaultSession();
export { VaultError };
