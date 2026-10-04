import * as SecureStore from 'expo-secure-store';

const KEY = 'modo.backupSchedule';

export async function readBackupSchedule(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY).catch(() => null);
}

export async function writeBackupSchedule(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value);
}
