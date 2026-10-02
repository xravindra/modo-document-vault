import { base64ToBytes } from './bytes';
import { rasterizePdf } from './rasterBridge';

export async function pdfToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const jpeg = await rasterizePdf(bytes);
  const payload = jpeg.includes(',') ? (jpeg.split(',')[1] ?? '') : jpeg;
  return base64ToBytes(payload);
}
