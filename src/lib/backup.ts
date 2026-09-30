export type Envelope = {
  salt: string;
  iterations: number;
  sealed: string;
  pinLength?: number;
  version?: number;
  iv?: string;
};

export type BackupFile = {
  format: 'modo-vault';
  version: 1;
  exportedAt: number;
  envelope: Envelope;
  files: Record<string, string>;
};

function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.salt === 'string' && typeof record.iterations === 'number' && typeof record.sealed === 'string';
}

export function serializeBackup(backup: BackupFile): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(backup));
}

export function parseBackup(bytes: Uint8Array): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('This file is not a MODO backup.');
  }
  if (!data || typeof data !== 'object') throw new Error('This file is not a MODO backup.');
  const record = data as Record<string, unknown>;
  if (record.format !== 'modo-vault' || record.version !== 1 || !isEnvelope(record.envelope)) {
    throw new Error('This file is not a MODO backup.');
  }
  if (!record.files || typeof record.files !== 'object') throw new Error('This backup has no sealed files.');
  const files: Record<string, string> = {};
  for (const [name, value] of Object.entries(record.files)) {
    if (!/^[\w.-]+$/.test(name) || typeof value !== 'string') {
      throw new Error('This backup contains an unsafe file entry.');
    }
    files[name] = value;
  }
  if (!files['catalog.bin']) throw new Error('This backup is missing its catalog.');
  return {
    format: 'modo-vault',
    version: 1,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    envelope: record.envelope,
    files,
  };
}

export function backupSummary(bytes: Uint8Array): { sealedFiles: number; exportedAt: number } {
  const backup = parseBackup(bytes);
  return {
    sealedFiles: Math.max(0, Object.keys(backup.files).length - 1),
    exportedAt: backup.exportedAt,
  };
}
