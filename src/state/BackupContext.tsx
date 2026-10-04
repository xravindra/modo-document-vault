import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { backupDue, DEFAULT_SCHEDULE, parseSchedule, snoozeUntil, type BackupEvery, type BackupSchedule } from '@/lib/backupSchedule';
import { readBackupSchedule, writeBackupSchedule } from '@/lib/backupScheduleStore';
import { deliverFile } from '@/lib/deliver';
import { useVault } from '@/state/VaultContext';

type BackupApi = {
  schedule: BackupSchedule;
  due: boolean;
  busy: boolean;
  setEvery: (every: BackupEvery) => Promise<void>;
  /** Builds the encrypted backup and opens the share sheet, where Google Drive can be chosen. */
  backUpNow: () => Promise<void>;
  later: () => Promise<void>;
};

const BackupContext = createContext<BackupApi | null>(null);

export function BackupProvider({ children }: { children: ReactNode }) {
  const vault = useVault();
  const [schedule, setSchedule] = useState<BackupSchedule>(DEFAULT_SCHEDULE);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let live = true;
    void readBackupSchedule().then((raw) => {
      if (live) setSchedule(parseSchedule(raw));
    });
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  const save = useCallback(async (next: BackupSchedule) => {
    setSchedule(next);
    setNow(Date.now());
    await writeBackupSchedule(JSON.stringify(next)).catch(() => undefined);
  }, []);

  const value = useMemo<BackupApi>(
    () => ({
      schedule,
      due: backupDue(schedule, now),
      busy,
      setEvery: (every) => save({ ...schedule, every, snoozedUntil: 0 }),
      later: () => save({ ...schedule, snoozedUntil: snoozeUntil() }),
      backUpNow: async () => {
        if (busy) return;
        setBusy(true);
        vault.holdAutoLock();
        try {
          const bytes = await vault.exportBackup();
          await deliverFile(`modo-vault-${new Date().toISOString().slice(0, 10)}.json`, bytes, 'application/json');
          await save({ ...schedule, lastAt: Date.now(), snoozedUntil: 0 });
        } finally {
          vault.releaseAutoLock();
          setBusy(false);
        }
      },
    }),
    [busy, now, save, schedule, vault],
  );

  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>;
}

export function useBackup() {
  const value = useContext(BackupContext);
  if (!value) throw new Error('useBackup must be used inside BackupProvider.');
  return value;
}
