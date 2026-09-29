const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += ALPHABET[(triple >> 18) & 63];
    output += ALPHABET[(triple >> 12) & 63];
    output += b === undefined ? '=' : ALPHABET[(triple >> 6) & 63];
    output += c === undefined ? '=' : ALPHABET[triple & 63];
  }
  return output;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '');
  if (clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean)) {
    throw new Error('The encoded value is not valid base64.');
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const length = (clean.length / 4) * 3 - padding;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = ALPHABET.indexOf(clean[index] ?? '');
    const b = ALPHABET.indexOf(clean[index + 1] ?? '');
    const c = ALPHABET.indexOf(clean[index + 2] ?? '');
    const d = ALPHABET.indexOf(clean[index + 3] ?? '');
    if (a < 0 || b < 0 || (clean[index + 2] !== '=' && c < 0) || (clean[index + 3] !== '=' && d < 0)) {
      throw new Error('The encoded value is not valid base64.');
    }
    const triple = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    bytes[offset++] = (triple >> 16) & 255;
    if (clean[index + 2] !== '=') bytes[offset++] = (triple >> 8) & 255;
    if (clean[index + 3] !== '=') bytes[offset++] = triple & 255;
  }
  return bytes;
}

export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'document';
}
