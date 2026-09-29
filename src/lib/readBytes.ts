import { File } from 'expo-file-system';

export async function readLocalUri(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  return new Uint8Array(await file.bytes());
}
