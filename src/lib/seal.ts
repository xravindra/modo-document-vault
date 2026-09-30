import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digest,
  getRandomBytesAsync,
} from 'expo-crypto';

import type { Envelope } from './backup';
import { base64ToBytes, bytesToBase64, wipe } from './bytes';

export const KDF_ITERATIONS = 5_000;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

const WRONG_PIN = 'That PIN does not open this vault.';
const SAVE_FAILED = 'The PIN could not be saved on this device. Try again.';

async function asBytes(value: string | Uint8Array): Promise<Uint8Array> {
  return typeof value === 'string' ? base64ToBytes(value) : new Uint8Array(value);
}

async function randomBytes(length: number): Promise<Uint8Array> {
  const generated = new Uint8Array(await getRandomBytesAsync(length));
  const bytes = new Uint8Array(length);
  bytes.set(generated.subarray(0, length));
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const hashed = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, source));
  return [...hashed].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function iterationsOf(envelope: Envelope): number {
  const count = envelope.iterations;
  if (!Number.isInteger(count) || count < 1 || count > 1_000_000) return KDF_ITERATIONS;
  return count;
}

function derivePinKey(pin: string, salt: Uint8Array, iterations: number): Uint8Array {
  return new Uint8Array(pbkdf2(sha256, pin, new Uint8Array(salt), { c: iterations, dkLen: 32 }));
}

async function deriveSubtle(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.importKey || !subtle.deriveBits) return null;
  try {
    const secret = new TextEncoder().encode(pin);
    const material = await subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations }, material, 256);
    const bytes = new Uint8Array(bits);
    return bytes.byteLength === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

async function importVaultKey(raw: Uint8Array): Promise<AESEncryptionKey> {
  if (raw.byteLength !== 32) throw new VaultError(WRONG_PIN);
  return AESEncryptionKey.import(new Uint8Array(raw));
}

export async function createEnvelope(pin: string, vaultKey: AESEncryptionKey): Promise<Envelope> {
  const salt = await randomBytes(16);
  const iv = await randomBytes(12);
  const pinKey = derivePinKey(pin, salt, KDF_ITERATIONS);
  const raw = new Uint8Array(await vaultKey.bytes());
  let sealed: Uint8Array;
  try {
    sealed = new Uint8Array(gcm(pinKey, iv).encrypt(raw));
  } finally {
    wipe(pinKey);
    wipe(raw);
  }
  const envelope: Envelope = {
    version: 2,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: KDF_ITERATIONS,
    pinLength: pin.length,
    sealed: bytesToBase64(sealed),
  };
  const opened = await openEnvelope(pin, envelope).catch(() => {
    throw new VaultError(SAVE_FAILED);
  });
  const openedBytes = new Uint8Array(await opened.bytes());
  const original = new Uint8Array(await vaultKey.bytes());
  const match = sameBytes(openedBytes, original);
  wipe(openedBytes);
  wipe(original);
  if (!match) throw new VaultError(SAVE_FAILED);
  return envelope;
}

export async function openEnvelope(pin: string, envelope: Envelope): Promise<AESEncryptionKey> {
  if (envelope.version === 2) return openModern(pin, envelope);
  return openLegacy(pin, envelope);
}

async function openModern(pin: string, envelope: Envelope): Promise<AESEncryptionKey> {
  if (!envelope.iv) throw new VaultError(WRONG_PIN);
  const pinKey = derivePinKey(pin, base64ToBytes(envelope.salt), iterationsOf(envelope));
  try {
    const raw = gcm(pinKey, base64ToBytes(envelope.iv)).decrypt(base64ToBytes(envelope.sealed));
    return await importVaultKey(new Uint8Array(raw));
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(WRONG_PIN);
  } finally {
    wipe(pinKey);
  }
}

async function openLegacy(pin: string, envelope: Envelope): Promise<AESEncryptionKey> {
  const salt = base64ToBytes(envelope.salt);
  const nobleBytes = derivePinKey(pin, salt, iterationsOf(envelope));
  try {
    return await unwrapLegacy(nobleBytes, envelope);
  } catch {
    // Older vaults on the web were wrapped with the browser's PBKDF2.
  } finally {
    wipe(nobleBytes);
  }
  const subtleBytes = await deriveSubtle(pin, salt, iterationsOf(envelope));
  if (subtleBytes) {
    try {
      return await unwrapLegacy(subtleBytes, envelope);
    } catch {
      // The PIN did not match this older wrap either.
    } finally {
      wipe(subtleBytes);
    }
  }
  throw new VaultError(WRONG_PIN);
}

async function unwrapLegacy(keyBytes: Uint8Array, envelope: Envelope): Promise<AESEncryptionKey> {
  const wrappingKey = await AESEncryptionKey.import(new Uint8Array(keyBytes));
  const opened = await aesDecryptAsync(AESSealedData.fromCombined(envelope.sealed), wrappingKey, { output: 'bytes' });
  return importVaultKey(await asBytes(opened));
}

export async function sealBytes(key: AESEncryptionKey, plain: Uint8Array): Promise<Uint8Array> {
  const sealed = await aesEncryptAsync(plain, key);
  return asBytes(await sealed.combined('bytes'));
}

export async function openBytes(key: AESEncryptionKey, sealedBytes: Uint8Array): Promise<Uint8Array> {
  const opened = await aesDecryptAsync(AESSealedData.fromCombined(sealedBytes), key, { output: 'bytes' });
  return asBytes(opened);
}
