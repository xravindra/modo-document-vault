import { recognizeBytes } from './ocrBridge';

export async function extractImageText(
  bytes: Uint8Array,
  mime: string,
): Promise<{ text: string; note: string }> {
  return recognizeBytes('image', bytes, mime || 'image/jpeg');
}
