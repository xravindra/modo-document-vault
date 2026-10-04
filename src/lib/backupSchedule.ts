const DAY = 24 * 60 * 60 * 1000;

export type BackupEvery = 'off' | 'daily' | 'weekly' | 'monthly';

export const BACKUP_EVERY: { id: BackupEvery; label: string; days: number }[] = [
  { id: 'off', label: 'Off', days: 0 },
  { id: 'daily', label: 'Daily', days: 1 },
  { id: 'weekly', label: 'Weekly', days: 7 },
  { id: 'monthly', label: 'Monthly', days: 30 },
];

export type BackupSchedule = {
  every: BackupEvery;
  /** Last time a backup file was handed to the share sheet. */
  lastAt: number;
  /** "Later" pushes the reminder until this time. */
  snoozedUntil: number;
};

export const DEFAULT_SCHEDULE: BackupSchedule = { every: 'off', lastAt: 0, snoozedUntil: 0 };

export function parseSchedule(raw: string | null): BackupSchedule {
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    const parsed = JSON.parse(raw) as Partial<BackupSchedule>;
    const every = BACKUP_EVERY.some((item) => item.id === parsed.every) ? (parsed.every as BackupEvery) : 'off';
    const lastAt = typeof parsed.lastAt === 'number' && Number.isFinite(parsed.lastAt) ? parsed.lastAt : 0;
    const snoozedUntil = typeof parsed.snoozedUntil === 'number' && Number.isFinite(parsed.snoozedUntil) ? parsed.snoozedUntil : 0;
    return { every, lastAt, snoozedUntil };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function nextBackupAt(schedule: BackupSchedule): number | null {
  const days = BACKUP_EVERY.find((item) => item.id === schedule.every)?.days ?? 0;
  if (days === 0) return null;
  return schedule.lastAt === 0 ? 0 : schedule.lastAt + days * DAY;
}

export function backupDue(schedule: BackupSchedule, now = Date.now()): boolean {
  const next = nextBackupAt(schedule);
  if (next === null) return false;
  return now >= next && now >= schedule.snoozedUntil;
}

export function snoozeUntil(now = Date.now()): number {
  return now + DAY;
}
