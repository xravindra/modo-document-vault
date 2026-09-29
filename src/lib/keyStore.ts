import * as SecureStore from 'expo-secure-store';

import type { Envelope } from './backup';

const ENVELOPE = 'modo.envelope';
const BIO_KEY = 'modo.bio.key';
const BIO_MODE = 'modo.bio.mode';

export type BioMode = 'off' | 'gate' | 'hardware';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function readEnvelope(): Promise<Envelope | null> {
  const raw = await SecureStore.getItemAsync(ENVELOPE, options);
  if (!raw) return null;
  return JSON.parse(raw) as Envelope;
}

export async function writeEnvelope(envelope: Envelope): Promise<void> {
  await SecureStore.setItemAsync(ENVELOPE, JSON.stringify(envelope), options);
}

export async function clearEnvelope(): Promise<void> {
  await SecureStore.deleteItemAsync(ENVELOPE, options);
}

export async function readBioMode(): Promise<BioMode> {
  const mode = await SecureStore.getItemAsync(BIO_MODE, options);
  if (mode === 'hardware' || mode === 'gate') return mode;
  return 'off';
}

export async function readBiometricKey(mode: BioMode): Promise<string | null> {
  if (mode === 'off') return null;
  if (mode === 'hardware') {
    return SecureStore.getItemAsync(BIO_KEY, {
      ...options,
      requireAuthentication: true,
      authenticationPrompt: 'Unlock MODO',
    });
  }
  return SecureStore.getItemAsync(BIO_KEY, options);
}

export async function writeBiometricKey(hex: string): Promise<BioMode> {
  try {
    await SecureStore.setItemAsync(BIO_KEY, hex, {
      ...options,
      requireAuthentication: true,
      authenticationPrompt: 'Unlock MODO',
    });
    await SecureStore.setItemAsync(BIO_MODE, 'hardware', options);
    return 'hardware';
  } catch {
    await SecureStore.setItemAsync(BIO_KEY, hex, options);
    await SecureStore.setItemAsync(BIO_MODE, 'gate', options);
    return 'gate';
  }
}

export async function clearBiometricKey(): Promise<void> {
  await SecureStore.deleteItemAsync(BIO_KEY, options).catch(() => undefined);
  await SecureStore.deleteItemAsync(BIO_MODE, options).catch(() => undefined);
}
