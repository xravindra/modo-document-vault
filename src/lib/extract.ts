import { extractImageText } from './extractImage';
import { inferKind, parseFields } from './fields';
import { extractPdfText, presentableText } from './pdfText';
import type { DocKind, Extraction } from './types';

export async function extractDocument(bytes: Uint8Array, mime: string, fileName: string): Promise<Extraction> {
  const lower = fileName.toLowerCase();
  const isPdf = mime.includes('pdf') || lower.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif|bmp|tif)$/i.test(lower);
  let text = '';
  let engine: Extraction['engine'] = 'metadata';
  let note = 'The original file is stored. No text layer was found to read.';

  if (isPdf) {
    text = extractPdfText(bytes);
    if (text.trim()) {
      engine = 'pdf-text';
      note = 'Read the digital text already inside the PDF. The original file stays encrypted.';
    } else {
      note = 'This PDF has no readable text layer. A scan can be added as a photo in the web app for recognition.';
    }
  } else if (isImage) {
    const recognized = await extractImageText(bytes, mime);
    note = recognized.note;
    if (recognized.text.trim()) {
      text = recognized.text;
      engine = 'ocr';
    }
  } else if (mime.startsWith('text/') || lower.endsWith('.txt')) {
    text = new TextDecoder().decode(bytes);
    engine = 'text';
    note = 'Read the text file directly, then sealed the original.';
  }

  const readable = presentableText(text);
  if (!readable && (engine === 'pdf-text' || engine === 'ocr' || engine === 'text')) {
    engine = 'metadata';
    note = isPdf
      ? 'This PDF has no readable text layer. A scan can be added as a photo in the web app for recognition.'
      : 'The original file is stored. No readable text was found.';
  }

  return {
    engine,
    text: readable,
    fields: parseFields(readable),
    note,
  };
}

export function suggestedKind(current: DocKind, text: string): DocKind {
  if (current !== 'other') return current;
  return inferKind(text);
}
