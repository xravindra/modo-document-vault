import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { safeFileName } from './bytes';

export async function deliverFile(filename: string, bytes: Uint8Array, mime: string): Promise<void> {
  const file = new File(Paths.cache, safeFileName(filename));
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
}

export async function previewUri(bytes: Uint8Array, mime: string): Promise<{ uri: string; revoke: () => void }> {
  const extension = mime.includes('pdf') ? 'pdf' : mime.split('/')[1] || 'bin';
  const file = new File(Paths.cache, `modo-preview-${Date.now()}.${extension}`);
  file.create();
  file.write(bytes);
  return {
    uri: file.uri,
    revoke: () => {
      if (file.exists) file.delete();
    },
  };
}
