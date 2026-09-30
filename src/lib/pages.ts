import type { DocumentPage, Extraction, VaultDocument } from './types';

export const MAX_PAGES = 8;

const unread: Extraction = {
  engine: 'metadata',
  text: '',
  fields: [],
  note: 'Nothing was read from this page.',
};

export function documentPages(doc: VaultDocument): DocumentPage[] {
  if (doc.pages && doc.pages.length > 0) return doc.pages;
  return [
    {
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      byteLength: doc.byteLength,
      sha256: doc.sha256,
      extraction: doc.extraction,
    },
  ];
}

export function pageExtraction(doc: VaultDocument, index: number): Extraction {
  const pages = documentPages(doc);
  const page = pages[index] ?? pages[0];
  if (page?.extraction) return page.extraction;
  if (index <= 0) return doc.extraction;
  return unread;
}

export function pageBlobName(id: string, index: number): string {
  return index === 0 ? `${id}.bin` : `${id}.${index}.bin`;
}

export function pageTwinBlobName(id: string, index: number): string {
  return `${pageBlobName(id, index)}.twin`;
}
