import { pdfBytesForLock } from './pdfPrepare';
import { lockPdf, unlockPdf } from './pdfUnlock';

const ENCRYPT = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74];

export function pdfIsPasswordProtected(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return false;
  const last = bytes.length - ENCRYPT.length;
  for (let index = 0; index <= last; index += 1) {
    let matched = true;
    for (let offset = 0; offset < ENCRYPT.length; offset += 1) {
      if (bytes[index + offset] !== ENCRYPT[offset]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const next = bytes[index + ENCRYPT.length];
    if (
      next === 0x20 ||
      next === 0x09 ||
      next === 0x0a ||
      next === 0x0d ||
      next === 0x3c ||
      (next !== undefined && next >= 0x30 && next <= 0x39)
    ) {
      return true;
    }
  }
  return false;
}

export async function lockDocumentFile(bytes: Uint8Array, mime: string, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Choose a password for the locked file.');
  try {
    const pdf = await pdfBytesForLock(bytes, mime);
    const locked = await lockPdf(pdf, password);
    if (locked.length < 5 || locked[0] !== 0x25 || !pdfIsPasswordProtected(locked)) {
      throw new Error('Could not lock this document.');
    }
    return locked;
  } catch (error) {
    if (error instanceof Error && /could not lock|choose a password|lock file can protect|could not read this photo|cannot lock or unlock/i.test(error.message)) {
      throw error;
    }
    throw new Error('Could not lock this document.');
  }
}

export async function removePdfPassword(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  try {
    const opened = await unlockPdf(bytes, password);
    if (opened.length < 5 || opened[0] !== 0x25) {
      throw new Error('Could not remove the password from this document.');
    }
    return opened;
  } catch (error) {
    if (error instanceof Error && error.message === 'Could not remove the password from this document.') throw error;
    if (error instanceof Error && error.message.startsWith('This device cannot remove a PDF password')) throw error;
    if (isWrongPassword(error)) throw new Error('That password does not open this document.');
    throw new Error('Could not remove the password from this document.');
  }
}

function isWrongPassword(error: unknown): boolean {
  return error instanceof Error && (error.name === 'PdfPasswordError' || /invalid password/i.test(error.message));
}
