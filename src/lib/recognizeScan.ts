import { recognizeBytes } from './ocrBridge';

export async function recognizeScan(bytes: Uint8Array): Promise<{ text: string; note: string }> {
  return recognizeBytes('pdf', bytes, 'application/pdf');
}
