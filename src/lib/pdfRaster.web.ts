import { base64ToBytes } from '@/lib/bytes';
import { loadPdfJs } from '@/lib/pdfJs.web';

export async function pdfToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const pdfjs = await loadPdfJs();
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pdf = await pdfjs.getDocument({ data, disableRange: true, disableStream: true }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1400 / Math.max(1, base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not turn this PDF into an image.');
  await page.render({ canvasContext: context, viewport }).promise;
  const payload = canvas.toDataURL('image/jpeg', 0.86).split(',')[1] ?? '';
  return base64ToBytes(payload);
}
