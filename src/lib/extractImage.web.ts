export async function extractImageText(
  bytes: Uint8Array,
  mime: string,
): Promise<{ text: string; note: string }> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: () => undefined,
    });
    try {
      const blob = new Blob([new Uint8Array(bytes)], { type: mime || 'image/png' });
      const result = await worker.recognize(blob);
      return {
        text: result.data.text ?? '',
        note: 'Text was recognized on this device. The English language pack is downloaded once by the recognition engine. The photo itself is not uploaded.',
      };
    } finally {
      await worker.terminate();
    }
  } catch {
    return {
      text: '',
      note: 'Text recognition could not start. The photo is still stored. Try again when this browser can download the recognition pack.',
    };
  }
}
