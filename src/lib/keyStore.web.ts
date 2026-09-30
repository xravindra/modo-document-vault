import type { Envelope } from './backup';
import { clearEnvelopeFile, isStoredEnvelope, readEnvelopeFile, writeEnvelopeFile } from './envelopeFile';

const ENVELOPE = 'modo.envelope';

export type BioMode = 'off' | 'gate' | 'hardware';

export async function readEnvelope(): Promise<Envelope | null> {
  const fromFile = await readEnvelopeFile();
  if (fromFile) return fromFile;
  const raw = readLocalEnvelope();
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
    // localStorage can still hold the PIN wrap.
  }
  try {
    localStorage.setItem(ENVELOPE, encoded);
    saved = true;
  } catch {
    // The file copy is enough when it succeeded.
  }
  if (!saved) throw new Error('The PIN could not be saved on this device. Try again.');
}

export async function clearEnvelope(): Promise<void> {
  await clearEnvelopeFile();
  localStorage.removeItem(ENVELOPE);
}

function readLocalEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(ENVELOPE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readBioMode(): Promise<BioMode> {
  return 'off';
}

export async function readBiometricKey(_mode: BioMode): Promise<string | null> {
  return null;
}

export async function writeBiometricKey(_hex: string): Promise<BioMode> {
  return 'off';
}

export async function clearBiometricKey(): Promise<void> {
  return undefined;
}
