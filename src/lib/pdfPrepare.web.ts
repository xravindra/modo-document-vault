import { base64ToBytes } from './bytes';

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

export async function pdfBytesForLock(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  if (isPdf(bytes) || mime.includes('pdf')) return bytes;
  const jpeg = isJpeg(bytes) || mime === 'image/jpeg' ? bytes : await imageToJpeg(bytes, mime);
  const { imagesToPdf } = await import('pdfstudio');
  return imagesToPdf([jpeg]);
}

async function imageToJpeg(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  if (!isImage(mime)) throw new Error('Lock file can protect a PDF or a photo.');
  const blob = new Blob([new Uint8Array(bytes)], { type: mime || 'image/*' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Lock file could not read this photo.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context || canvas.width < 1 || canvas.height < 1) throw new Error('Lock file could not read this photo.');
    context.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const encoded = dataUrl.split(',')[1] ?? '';
    if (!encoded) throw new Error('Lock file could not read this photo.');
    return base64ToBytes(encoded);
  } finally {
    URL.revokeObjectURL(url);
  }
}
