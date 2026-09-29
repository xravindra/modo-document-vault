import { AESEncryptionKey, randomUUID } from 'expo-crypto';

import { parseBackup, serializeBackup, type BackupFile } from './backup';
import { base64ToBytes, bytesToBase64 } from './bytes';
import { deviceBiometricsAvailable, promptBiometrics } from './biometrics';
import * as blobs from './blobStore';
import * as keys from './keyStore';
import {
  createEnvelope,
  openBytes,
  openEnvelope,
  sealBytes,
  sha256Hex,
  VaultError,
} from './seal';
import { emptyCatalog, type ActivityType, type Catalog, type DocKind, type Extraction, type Settings, type VaultDocument } from './types';
const CATALOG = 'catalog.bin';
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ACTIVITY = 180;

export type AddDocumentInput = {
  title: string;
  kind: DocKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  extraction: Extraction;
};

export type OpenedDocument = {
  doc: VaultDocument;
  bytes: Uint8Array | null;
  integrity: 'ok' | 'failed';
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

  async biometricsReady() {
    const mode = await keys.readBioMode();
    return mode !== 'off' && (await deviceBiometricsAvailable());
  }

  async bioMode() {
    return keys.readBioMode();
  }

  create(pin: string) {
    return this.enqueue(async () => {
      if (!/^\d{6}$/.test(pin)) throw new VaultError('Use a 6-digit PIN.');
      if (await keys.readEnvelope()) throw new VaultError('A vault already exists on this device.');
      const vaultKey = await AESEncryptionKey.generate();
      await keys.writeEnvelope(await createEnvelope(pin, vaultKey));
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
      try {
        this.key = await openEnvelope(pin, envelope);
      } catch {
        this.key = null;
        throw new VaultError('That PIN does not open this vault.');
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
      await this.persist();
    });
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

  addDocument(input: AddDocumentInput) {
    return this.enqueue(async () => {
      const key = this.assertOpen();
      if (input.bytes.byteLength > MAX_BYTES) {
        throw new VaultError('Documents larger than 12 MB are not sealed in this version.');
      }
      if (input.bytes.byteLength === 0) throw new VaultError('That file is empty.');
      const id = randomUUID();
      const sha256 = await sha256Hex(input.bytes);
      await blobs.writeBlob(`${id}.bin`, await sealBytes(key, input.bytes));
      const doc: VaultDocument = {
        id,
        title: input.title.trim() || 'Untitled document',
        kind: input.kind,
        fileName: input.fileName,
        mimeType: input.mimeType || 'application/octet-stream',
        byteLength: input.bytes.byteLength,
        sha256,
        createdAt: Date.now(),
        favorite: false,
        extraction: input.extraction,
      };
      this.catalog.documents.unshift(doc);
      this.remember('add', `Sealed ${doc.title}`);
      await this.persist();
      return doc;
    });
  }

  async openDocument(id: string): Promise<OpenedDocument> {
    const key = this.assertOpen();
    const doc = this.catalog.documents.find((item) => item.id === id);
    if (!doc) throw new VaultError('That document is not in the vault.');
    const sealed = await blobs.readBlob(`${id}.bin`);
    if (!sealed) {
      return { doc, bytes: null, integrity: 'failed' };
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
      return { doc, bytes: plain, integrity: hash === doc.sha256 ? 'ok' : 'failed' };
    } catch {
      return { doc, bytes: null, integrity: 'failed' };
    }
  }

  removeDocument(id: string) {
    return this.enqueue(async () => {
      this.assertOpen();
      const doc = this.catalog.documents.find((item) => item.id === id);
      if (!doc) return;
      await blobs.removeBlob(`${id}.bin`);
      this.catalog.documents = this.catalog.documents.filter((item) => item.id !== id);
      this.remember('delete', `Removed ${doc.title}`);
      await this.persist();
    });
  }

  toggleFavorite(id: string) {
    return this.enqueue(async () => {
      this.assertOpen();
      const doc = this.catalog.documents.find((item) => item.id === id);
      if (!doc) return;
      doc.favorite = !doc.favorite;
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
      if (!/^\d{6}$/.test(next)) throw new VaultError('Use a 6-digit PIN.');
      await keys.writeEnvelope(await createEnvelope(next, key));
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
      const names = await blobs.listBlobs();
      const files: Record<string, string> = {};
      for (const name of names) {
        const bytes = await blobs.readBlob(name);
        if (bytes) files[name] = bytesToBase64(bytes);
      }
      const backup: BackupFile = {
        format: 'modo-vault',
        version: 1,
        exportedAt: Date.now(),
        envelope,
        files,
      };
      this.remember('export', 'Exported an encrypted backup');
      await this.persist();
      return serializeBackup(backup);
    });
  }

  importBackup(bytes: Uint8Array) {
    return this.enqueue(async () => {
      const backup = parseBackup(bytes);
      await blobs.clearBlobs();
      for (const [name, encoded] of Object.entries(backup.files)) {
        await blobs.writeBlob(name, base64ToBytes(encoded));
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
