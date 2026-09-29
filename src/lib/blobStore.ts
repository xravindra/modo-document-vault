import { Directory, File, Paths } from 'expo-file-system';

const ROOT = 'modo-vault';

function directory(): Directory {
  const dir = new Directory(Paths.document, ROOT);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function entry(name: string): File {
  return new File(directory(), name);
}

export async function readBlob(name: string): Promise<Uint8Array | null> {
  const file = entry(name);
  if (!file.exists) return null;
  return new Uint8Array(await file.bytes());
}

export async function writeBlob(name: string, data: Uint8Array): Promise<void> {
  const file = entry(name);
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  file.write(data);
}

export async function removeBlob(name: string): Promise<void> {
  const file = entry(name);
  if (file.exists) file.delete();
}

export async function listBlobs(): Promise<string[]> {
  const dir = directory();
  if (!dir.exists) return [];
  return dir.list().map((item) => item.name);
}

export async function clearBlobs(): Promise<void> {
  const dir = new Directory(Paths.document, ROOT);
  if (dir.exists) dir.delete();
}
