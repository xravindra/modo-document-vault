import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { BioMode } from '@/lib/keyStore';
import { emptyCatalog, type ActivityEvent, type Settings, type VaultDocument } from '@/lib/types';
import { session, VaultError, type AddDocumentInput } from '@/lib/vault';

type Status = 'booting' | 'locked' | 'unlocked';

type VaultModel = {
  status: Status;
  hasVault: boolean;
  biometricsReady: boolean;
  bioMode: BioMode;
  documents: VaultDocument[];
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
  removeDocument: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
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
  biometricsReady: false,
  bioMode: 'off',
  documents: [],
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

  const publish = useCallback(async (status: Status, error: string | null = null) => {
    const snap = session.unlocked ? session.snapshot() : emptyCatalog();
    const [hasVault, biometricsReady, bioMode] = await Promise.all([
      session.hasEnvelope(),
      session.biometricsReady(),
      session.bioMode(),
    ]);
    setModel({
      status,
      hasVault,
      biometricsReady,
      bioMode,
      documents: snap.documents,
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
      if (statusRef.current !== 'unlocked') return;
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
      removeDocument: (id) => run(() => session.removeDocument(id), 'unlocked'),
      toggleFavorite: (id) => run(() => session.toggleFavorite(id), 'unlocked'),
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
  }, [lock, model, publish, refresh]);

  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside VaultProvider.');
  return value;
}
