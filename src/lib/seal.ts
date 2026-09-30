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

async function asBytes(value: string | Uint8Array): Promise<Uint8Array> {
  return typeof value === 'string' ? base64ToBytes(value) : new Uint8Array(value);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const hashed = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, source));
  return [...hashed].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function derivePinKey(pin: string, salt: Uint8Array, iterations: number): Uint8Array {
  const secret = new TextEncoder().encode(pin);
  const saltCopy = new Uint8Array(salt);
  return new Uint8Array(pbkdf2(sha256, secret, saltCopy, { c: iterations, dkLen: 32 }));
}

async function wrapKey(pin: string, salt: Uint8Array, iterations: number): Promise<AESEncryptionKey> {
  const keyBytes = derivePinKey(pin, salt, iterations);
  const key = await AESEncryptionKey.import(new Uint8Array(keyBytes));
  wipe(keyBytes);
  return key;
}

export async function createEnvelope(pin: string, vaultKey: AESEncryptionKey): Promise<Envelope> {
  const salt = new Uint8Array(await getRandomBytesAsync(16));
  const wrappingKey = await wrapKey(pin, salt, KDF_ITERATIONS);
  const raw = new Uint8Array(await vaultKey.bytes());
  const sealed = await aesEncryptAsync(raw, wrappingKey);
  wipe(raw);
  const combined = await sealed.combined('base64');
  return {
    salt: bytesToBase64(salt),
    iterations: KDF_ITERATIONS,
    pinLength: pin.length,
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
