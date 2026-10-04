const KEY = 'modo.backupSchedule';

export async function readBackupSchedule(): Promise<string | null> {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeBackupSchedule(value: string): Promise<void> {
  localStorage.setItem(KEY, value);
}
