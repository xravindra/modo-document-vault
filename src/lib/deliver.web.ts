import { safeFileName } from './bytes';

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
