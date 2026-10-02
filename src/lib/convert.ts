import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js';

export type CollageLayout = 'row' | 'grid';

export function canEmbedImage(mime: string): boolean {
  const kind = mime.toLowerCase();
  return kind.includes('png') || kind.includes('jpeg') || kind.includes('jpg');
}

export function renamedExtension(name: string, extension: string): string {
  const stem = name.replace(/\.[^.]+$/, '') || 'document';
  return `${stem}.${extension}`;
}

async function embed(pdf: PDFDocument, bytes: Uint8Array, mime: string) {
  if (!canEmbedImage(mime)) throw new Error('JPEG and PNG images can be placed on a page.');
  const copy = bytes.slice();
  return mime.toLowerCase().includes('png') ? pdf.embedPng(copy) : pdf.embedJpg(copy);
}

export async function imageToPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const image = await embed(pdf, bytes, mime);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return pdf.save();
}

export async function collagePdf(
  parts: { bytes: Uint8Array; mime: string }[],
  layout: CollageLayout,
): Promise<Uint8Array> {
  const usable = parts.filter((part) => canEmbedImage(part.mime)).slice(0, 4);
  if (usable.length < 2) throw new Error('A collage needs at least two JPEG or PNG images.');
  const pdf = await PDFDocument.create();
  const images = [];
  for (const part of usable) images.push(await embed(pdf, part.bytes, part.mime));
  const cols = layout === 'row' ? images.length : 2;
  const rows = layout === 'row' ? 1 : Math.ceil(images.length / 2);
  const cellW = 420;
  const cellH = layout === 'row' ? 560 : 420;
  const page = pdf.addPage([cols * cellW, rows * cellH]);
  images.forEach((image, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const scale = Math.min(cellW / image.width, cellH / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = col * cellW + (cellW - width) / 2;
    const y = page.getHeight() - (row * cellH + (cellH - height) / 2) - height;
    page.drawImage(image, { x, y, width, height });
  });
  return pdf.save();
}
