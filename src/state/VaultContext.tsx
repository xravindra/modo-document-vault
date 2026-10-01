import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { BioMode } from '@/lib/keyStore';
import { emptyCatalog, type ActivityEvent, type ExtractedField, type Extraction, type Settings, type VaultDocument } from '@/lib/types';
import { PIN_LENGTH } from '@/lib/pin';
import { session, VaultError, type AddDocumentInput, type PageInput } from '@/lib/vault';

type Status = 'booting' | 'locked' | 'unlocked';

type VaultModel = {
  status: Status;
  hasVault: boolean;
  pinLength: number;
  biometricsReady: boolean;
  bioMode: BioMode;
  documents: VaultDocument[];
  members: string[];
  categories: string[];
  memberEmoji: Record<string, string>;
  categoryEmoji: Record<string, string>;
  activity: ActivityEvent[];
  settings: Settings;
  error: string | null;
};

type VaultApi = VaultModel & {
  createVault: (pin: string) => Promise<void>;
  unlock: (pin: string, failedAttempts?: number) => Promise<void>;
  unlockWithBiometrics: () => Promise<void>;
  lock: () => Promise<void>;
  addDocument: (input: AddDocumentInput) => Promise<VaultDocument>;
  assignMember: (id: string, member: string) => Promise<void>;
  assignKind: (id: string, kind: string) => Promise<void>;
  setMemberEmoji: (member: string, emoji: string) => Promise<void>;
  setCategoryEmoji: (kind: string, emoji: string) => Promise<void>;
  removeMember: (member: string) => Promise<void>;
  removeCategory: (kind: string) => Promise<void>;
  addPages: (id: string, pages: PageInput[]) => Promise<number>;
  keepAndShow: (id: string, pageIndex: number, page: PageInput, locked: boolean) => Promise<void>;
  togglePageLock: (id: string, pageIndex: number) => Promise<void>;
  openDocument: (id: string, pageIndex?: number, recordView?: boolean) => ReturnType<typeof session.openDocument>;
  holdAutoLock: () => void;
  releaseAutoLock: () => void;
  renameDocument: (id: string, fileName: string) => Promise<void>;
  saveFields: (id: string, fields: ExtractedField[], pageIndex?: number) => Promise<void>;
  saveExtraction: (id: string, extraction: Extraction, pageIndex?: number) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  removePage: (id: string, pageIndex: number) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  changePin: (next: string) => Promise<void>;
  enableBiometrics: () => Promise<BioMode>;
  disableBiometrics: () => Promise<void>;
  exportBackup: () => Promise<Uint8Array>;
  importBackup: (bytes: Uint8Array) => Promise<void>;
  destroy: () => Promise<void>;
  clearError: () => void;
  refresh: () => Promise<void>;
};

const VaultContext = createContext<VaultApi | null>(null);

const initial: VaultModel = {
  status: 'booting',
  hasVault: false,
  pinLength: PIN_LENGTH,
  biometricsReady: false,
  bioMode: 'off',
  documents: [],
  members: [],
  categories: [],
  memberEmoji: {},
  categoryEmoji: {},
  activity: [],
  settings: emptyCatalog().settings,
  error: null,
};

function messageFrom(error: unknown) {
  if (error instanceof VaultError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong inside the vault.';
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<VaultModel>(initial);
  const settingsRef = useRef(model.settings);
  settingsRef.current = model.settings;
  const statusRef = useRef(model.status);
  statusRef.current = model.status;
  const holdsRef = useRef(0);
  const holdAutoLock = useCallback(() => {
    holdsRef.current += 1;
  }, []);
  const releaseAutoLock = useCallback(() => {
    holdsRef.current = Math.max(0, holdsRef.current - 1);
  }, []);

  const publish = useCallback(async (status: Status, error: string | null = null) => {
    const snap = session.unlocked ? session.snapshot() : emptyCatalog();
    const [hasVault, pinLength, biometricsReady, bioMode] = await Promise.all([
      session.hasEnvelope(),
      session.expectedPinLength(),
      session.biometricsReady(),
      session.bioMode(),
    ]);
    setModel({
      status,
      hasVault,
      pinLength,
      biometricsReady,
      bioMode,
      documents: snap.documents,
      members: snap.members,
      categories: snap.categories,
      memberEmoji: snap.memberEmoji,
      categoryEmoji: snap.categoryEmoji,
      activity: snap.activity,
      settings: snap.settings,
      error,
    });
  }, []);

  useEffect(() => {
    let live = true;
    publish('locked').catch((error: unknown) => {
      if (live) setModel((current) => ({ ...current, status: 'locked', error: messageFrom(error) }));
    });
    return () => {
      live = false;
    };
  }, [publish]);

  const publishRef = useRef(publish);
  publishRef.current = publish;
  const refresh = useCallback(async () => {
    if (session.unlocked) await publishRef.current('unlocked');
  }, []);

  const lock = useCallback(async () => {
    await session.lock();
    await publish('locked');
  }, [publish]);

  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (next) => {
      if (statusRef.current !== 'unlocked' || holdsRef.current > 0) return;
      const timeout = settingsRef.current.autoLockMs;
      if (timeout < 0) return;
      if (next === 'background') {
        leftAt = Date.now();
        if (timeout === 0) void lock();
      }
      if (next === 'active' && timeout > 0 && leftAt && Date.now() - leftAt >= timeout) {
        void lock();
      }
    });
    return () => sub.remove();
  }, [lock]);

  const api = useMemo<VaultApi>(() => {
    const run = async (task: () => Promise<void>, status: Status) => {
      try {
        await task();
        await publish(status);
      } catch (error) {
        setModel((current) => ({ ...current, error: messageFrom(error) }));
        throw error;
      }
    };

    return {
      ...model,
      clearError: () => setModel((current) => ({ ...current, error: null })),
      refresh,
      createVault: (pin) => run(() => session.create(pin), 'unlocked'),
      unlock: (pin, failedAttempts = 0) => run(() => session.unlock(pin, failedAttempts), 'unlocked'),
      unlockWithBiometrics: () => run(() => session.unlockWithBiometrics(), 'unlocked'),
      lock,
      addDocument: async (input) => {
        const doc = await session.addDocument(input);
        await publish('unlocked');
        return doc;
      },
      assignMember: (id, member) => run(() => session.assignMember(id, member), 'unlocked'),
      assignKind: (id, kind) => run(() => session.assignKind(id, kind), 'unlocked'),
      setMemberEmoji: (member, emoji) => run(() => session.setMemberEmoji(member, emoji), 'unlocked'),
      setCategoryEmoji: (kind, emoji) => run(() => session.setCategoryEmoji(kind, emoji), 'unlocked'),
      removeMember: (member) => run(() => session.removeMember(member), 'unlocked'),
      removeCategory: (kind) => run(() => session.removeCategory(kind), 'unlocked'),
      addPages: async (id, pages) => {
        const count = await session.addPages(id, pages);
        await publish('unlocked');
        return count;
      },
      keepAndShow: async (id, pageIndex, page, locked) => {
        await session.keepAndShow(id, pageIndex, page, locked);
        await publish('unlocked');
      },
      togglePageLock: async (id, pageIndex) => {
        await session.togglePageLock(id, pageIndex);
        await publish('unlocked');
      },
      openDocument: (id, pageIndex, recordView) => session.openDocument(id, pageIndex, recordView),
      holdAutoLock,
      releaseAutoLock,
      renameDocument: (id, fileName) => run(() => session.renameDocument(id, fileName), 'unlocked'),
      saveFields: (id, fields, pageIndex) => run(() => session.saveFields(id, fields, pageIndex), 'unlocked'),
      saveExtraction: (id, extraction, pageIndex) => run(() => session.saveExtraction(id, extraction, pageIndex), 'unlocked'),
      removeDocument: (id) => run(() => session.removeDocument(id), 'unlocked'),
      removePage: (id, pageIndex) => run(() => session.removePage(id, pageIndex), 'unlocked'),
      updateSettings: (patch) => run(() => session.updateSettings(patch), 'unlocked'),
      verifyPin: (pin) => session.verifyPin(pin),
      changePin: (next) => run(() => session.changePin(next), 'unlocked'),
      enableBiometrics: async () => {
        const mode = await session.enableBiometrics();
        await publish('unlocked');
        return mode;
      },
      disableBiometrics: () => run(() => session.disableBiometrics(), 'unlocked'),
      exportBackup: async () => {
        const bytes = await session.exportBackup();
        await publish('unlocked');
        return bytes;
      },
      importBackup: (bytes) => run(() => session.importBackup(bytes), 'locked'),
      destroy: () => run(() => session.destroy(), 'locked'),
    };
  }, [holdAutoLock, lock, model, publish, refresh, releaseAutoLock]);

  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside VaultProvider.');
  return value;
}
