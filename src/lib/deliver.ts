import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { safeFileName } from './bytes';

export type ShareDocumentInput = {
  title: string;
  text: string;
  file: { fileName: string; mime: string; bytes: Uint8Array } | null;
};

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

function cancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /cancel|dismiss|abort/i.test(error.message));
}

export async function shareDocument(input: ShareDocumentInput): Promise<ShareOutcome> {
  const text = input.text.trim();
  if (input.file) {
    const stored = new File(Paths.cache, safeFileName(input.file.fileName));
    if (stored.exists) stored.delete();
    stored.create();
    stored.write(input.file.bytes);
    if (Platform.OS === 'ios') {
      try {
        const result = await Share.share({ title: input.title, message: text || input.title, url: stored.uri });
        return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
      } catch (error) {
        if (cancelled(error)) return 'cancelled';
      }
    }
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(stored.uri, { mimeType: input.file.mime, dialogTitle: input.title });
    return 'shared';
  }
  if (!text) throw new Error('There is nothing to share from this document.');
  try {
    const result = await Share.share({ title: input.title, message: text });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch (error) {
    if (cancelled(error)) return 'cancelled';
    throw error;
  }
}

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
