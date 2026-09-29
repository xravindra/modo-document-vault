import type { Envelope } from './backup';

const ENVELOPE = 'modo.envelope';

export type BioMode = 'off' | 'gate' | 'hardware';

export async function readEnvelope(): Promise<Envelope | null> {
  const raw = localStorage.getItem(ENVELOPE);
  if (!raw) return null;
  return JSON.parse(raw) as Envelope;
}

export async function writeEnvelope(envelope: Envelope): Promise<void> {
  localStorage.setItem(ENVELOPE, JSON.stringify(envelope));
}

export async function clearEnvelope(): Promise<void> {
  localStorage.removeItem(ENVELOPE);
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
