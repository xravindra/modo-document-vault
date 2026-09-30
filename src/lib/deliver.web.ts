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

function asFile(file: NonNullable<ShareDocumentInput['file']>): File {
  return new File([new Uint8Array(file.bytes)], safeFileName(file.fileName), {
    type: file.mime || 'application/octet-stream',
  });
}

export async function shareDocument(input: ShareDocumentInput): Promise<ShareOutcome> {
  const text = input.text.trim();
  const payload = input.file ? asFile(input.file) : null;
  if (payload && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (navigator.canShare?.({ files: [payload] })) {
        await navigator.share({ title: input.title, text, files: [payload] });
        return 'shared';
      }
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  } else if (!payload && text && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: input.title, text });
      return 'shared';
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  }
  if (input.file) {
    await deliverFile(input.file.fileName, input.file.bytes, input.file.mime);
    return 'downloaded';
  }
  if (text && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return 'downloaded';
  }
  throw new Error('Sharing is not available on this device.');
}

export async function deliverFile(filename: string, bytes: Uint8Array, mime: string): Promise<void> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(filename);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function previewUri(bytes: Uint8Array, mime: string): Promise<{ uri: string; revoke: () => void }> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  return { uri: url, revoke: () => URL.revokeObjectURL(url) };
}
