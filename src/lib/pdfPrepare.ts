function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export async function pdfBytesForLock(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  if (isPdf(bytes) || mime.includes('pdf')) return bytes;
  if (isJpeg(bytes) || mime === 'image/jpeg') {
    const { imagesToPdf } = await import('pdfstudio');
    return imagesToPdf([bytes]);
  }
  throw new Error('Lock file can protect a PDF or a JPEG photo. Other files can be locked in the browser.');
}
