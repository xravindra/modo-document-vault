import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
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

export const KDF_ITERATIONS = 210_000;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

async function asBytes(value: string | Uint8Array): Promise<Uint8Array> {
  return typeof value === 'string' ? base64ToBytes(value) : new Uint8Array(value);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const hashed = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, source));
  return [...hashed].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function wrapKey(pin: string, salt: Uint8Array, iterations: number): Promise<AESEncryptionKey> {
  const derived = await pbkdf2Async(sha256, pin, salt, {
    c: iterations,
    dkLen: 32,
    asyncTick: 12,
  });
  const keyBytes = Uint8Array.from(derived);
  if (derived instanceof Uint8Array) wipe(derived);
  const key = await AESEncryptionKey.import(keyBytes);
  wipe(keyBytes);
  return key;
}

export async function createEnvelope(pin: string, vaultKey: AESEncryptionKey): Promise<Envelope> {
  const salt = await getRandomBytesAsync(16);
  const wrappingKey = await wrapKey(pin, salt, KDF_ITERATIONS);
  const raw = new Uint8Array(await vaultKey.bytes());
  const sealed = await aesEncryptAsync(raw, wrappingKey);
  wipe(raw);
  const combined = await sealed.combined('base64');
  return {
    salt: bytesToBase64(salt),
    iterations: KDF_ITERATIONS,
    sealed: typeof combined === 'string' ? combined : bytesToBase64(combined),
  };
}

export async function openEnvelope(pin: string, envelope: Envelope): Promise<AESEncryptionKey> {
  const wrappingKey = await wrapKey(pin, base64ToBytes(envelope.salt), envelope.iterations);
  const opened = await aesDecryptAsync(AESSealedData.fromCombined(envelope.sealed), wrappingKey, {
    output: 'bytes',
  });
  const raw = await asBytes(opened);
  const key = await AESEncryptionKey.import(raw);
  wipe(raw);
  return key;
}

export async function sealBytes(key: AESEncryptionKey, plain: Uint8Array): Promise<Uint8Array> {
  const sealed = await aesEncryptAsync(plain, key);
  return asBytes(await sealed.combined('bytes'));
}

export async function openBytes(key: AESEncryptionKey, sealedBytes: Uint8Array): Promise<Uint8Array> {
  const opened = await aesDecryptAsync(AESSealedData.fromCombined(sealedBytes), key, { output: 'bytes' });
  return asBytes(opened);
}
