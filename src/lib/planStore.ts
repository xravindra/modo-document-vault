import * as SecureStore from 'expo-secure-store';

const PLAN = 'modo.plan';

export async function readPlanRecord(): Promise<string | null> {
  return SecureStore.getItemAsync(PLAN).catch(() => null);
}

export async function writePlanRecord(value: string): Promise<void> {
  await SecureStore.setItemAsync(PLAN, value);
}
