import * as SecureStore from 'expo-secure-store';

import type { Envelope } from './backup';
import { clearEnvelopeFile, isStoredEnvelope, readEnvelopeFile, writeEnvelopeFile } from './envelopeFile';

const ENVELOPE = 'modo.envelope';
const BIO_KEY = 'modo.bio.key';
const BIO_MODE = 'modo.bio.mode';

export type BioMode = 'off' | 'gate' | 'hardware';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function readEnvelope(): Promise<Envelope | null> {
  const fromFile = await readEnvelopeFile();
  if (fromFile) return fromFile;
  const raw = await readSecureEnvelope();
  if (!raw) return null;
  await writeEnvelopeFile(raw).catch(() => undefined);
  return raw;
}

export async function writeEnvelope(envelope: Envelope): Promise<void> {
  const encoded = JSON.stringify(envelope);
  let saved = false;
  try {
    await writeEnvelopeFile(envelope);
    saved = true;
  } catch {
    // The keychain copy can still hold the PIN wrap.
  }
  try {
    await SecureStore.setItemAsync(ENVELOPE, encoded, options);
    saved = true;
  } catch {
    // The file copy is enough when it succeeded.
  }
  if (!saved) throw new Error('The PIN could not be saved on this device. Try again.');
}

export async function clearEnvelope(): Promise<void> {
  await clearEnvelopeFile();
  await SecureStore.deleteItemAsync(ENVELOPE, options).catch(() => undefined);
  await SecureStore.deleteItemAsync(ENVELOPE).catch(() => undefined);
}

async function readSecureEnvelope(): Promise<Envelope | null> {
  const raw =
    (await SecureStore.getItemAsync(ENVELOPE, options).catch(() => null)) ??
    (await SecureStore.getItemAsync(ENVELOPE).catch(() => null));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
