import type { Envelope } from './backup';
import * as blobs from './blobStore';

const NAME = 'envelope.json';

export function isStoredEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.salt === 'string' && typeof record.iterations === 'number' && typeof record.sealed === 'string';
}

export async function readEnvelopeFile(): Promise<Envelope | null> {
  try {
    const bytes = await blobs.readBlob(NAME);
    if (!bytes) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isStoredEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeEnvelopeFile(envelope: Envelope): Promise<void> {
  await blobs.writeBlob(NAME, new TextEncoder().encode(JSON.stringify(envelope)));
}

export async function clearEnvelopeFile(): Promise<void> {
  try {
    await blobs.removeBlob(NAME);
  } catch {
    // The keychain copy is cleared by the caller too.
  }
}
