import { inflate } from 'pako';

const STREAM = ascii('stream');
const ENDSTREAM = ascii('endstream');
const FLATE = ascii('FlateDecode');
const MAX_STREAM = 1_500_000;
const MAX_TEXT = 200_000;

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  const end = haystack.length - needle.length;
  for (let index = from; index <= end; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  const size = 4096;
  for (let index = 0; index < bytes.length; index += size) {
    const slice = bytes.subarray(index, Math.min(index + size, bytes.length));
    text += String.fromCharCode(...slice);
  }
  return text;
}

function decodeLiteral(body: string): string {
  let output = '';
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '\\') {
      output += char;
      continue;
    }
    const next = body[index + 1];
    if (next === undefined) break;
    if (next === 'n') output += '\n';
    else if (next === 'r') output += '\r';
    else if (next === 't') output += '\t';
    else if (next === 'b') output += '\b';
    else if (next === 'f') output += '\f';
    else if (next === '(' || next === ')' || next === '\\') output += next;
    else if (next >= '0' && next <= '7') {
      let octal = next;
      let cursor = index + 2;
      while (octal.length < 3 && body[cursor] !== undefined && body[cursor] >= '0' && body[cursor] <= '7') {
        octal += body[cursor];
        cursor += 1;
      }
      output += String.fromCharCode(parseInt(octal, 8));
      index = cursor - 1;
      continue;
    } else if (next === '\n' || next === '\r') {
      index += next === '\r' && body[index + 2] === '\n' ? 2 : 1;
      continue;
    } else output += next;
    index += 1;
  }
  return output;
}

function readLiteralSpan(content: string, start: number): { value: string; next: number } {
  let cursor = start + 1;
  let body = '';
  let depth = 1;
  while (cursor < content.length && depth > 0) {
    const char = content[cursor];
    if (char === '\\') {
      body += char + (content[cursor + 1] ?? '');
      cursor += 2;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    body += char;
    cursor += 1;
  }
  return { value: decodeLiteral(body), next: Math.min(cursor + 1, content.length) };
}

function utf16be(bytes: number[], start: number): string {
  let text = '';
  for (let index = start; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
  }
  return text;
}

function looksLikeUtf16(bytes: number[]): boolean {
  if (bytes.length < 4 || bytes.length % 2 !== 0) return false;
  let likely = 0;
  const pairs = bytes.length / 2;
  for (let index = 0; index < bytes.length; index += 2) {
    const code = ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0);
    if (code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20) likely += 1;
    else if ((bytes[index] ?? 0) === 0x00 && code >= 0x20 && code !== 0x7f) likely += 1;
    else if (code >= 0x0900 && code <= 0x097f) likely += 1;
  }
  return likely / pairs >= 0.75;
}

function decodeHex(body: string): string {
  const hex = body.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(value)) return '';
    bytes.push(value);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes, 2);
  if (looksLikeUtf16(bytes)) return utf16be(bytes, 0);
  let text = '';
  const size = 4096;
  for (let index = 0; index < bytes.length; index += size) {
    text += String.fromCharCode(...bytes.slice(index, index + size));
  }
  return text;
}

function readHexSpan(content: string, start: number): { value: string; next: number } {
  const end = content.indexOf('>', start + 1);
  if (end < 0) return { value: '', next: content.length };
  return { value: decodeHex(content.slice(start + 1, end)), next: end + 1 };
}

function readTextArray(content: string, start: number): { value: string; next: number } {
  let cursor = start + 1;
  let value = '';
  let depth = 1;
  while (cursor < content.length && depth > 0) {
    const char = content[cursor];
    if (char === '(') {
      const literal = readLiteralSpan(content, cursor);
      value += literal.value;
      cursor = literal.next;
      continue;
    }
    if (char === '<' && content[cursor + 1] !== '<') {
      const hex = readHexSpan(content, cursor);
      value += hex.value;
      cursor = hex.next;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    cursor += 1;
  }
  return { value, next: Math.min(cursor + 1, content.length) };
}

function decodePdfUnicode(value: string): string {
  if (value.length >= 2 && value.charCodeAt(0) === 0xfe && value.charCodeAt(1) === 0xff) {
    let text = '';
    for (let index = 2; index + 1 < value.length; index += 2) {
      text += String.fromCharCode((value.charCodeAt(index) << 8) | value.charCodeAt(index + 1));
    }
    return text;
  }
  return value;
}

function unicodeHex(hex: string): string {
  let text = '';
  for (let index = 0; index + 3 < hex.length; index += 4) {
    text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16));
  }
  return text;
}

function absorbCmap(content: string, map: Map<number, string>) {
  for (const block of content.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1]?.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ?? []) {
      const source = pair[1] ?? '';
      const dest = pair[2] ?? '';
      if (source.length > 4 || dest.length < 4) continue;
      map.set(Number.parseInt(source, 16), unicodeHex(dest));
    }
  }
  for (const block of content.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1]?.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ?? []) {
      const start = Number.parseInt(range[1] ?? '', 16);
      const end = Number.parseInt(range[2] ?? '', 16);
      let dest = Number.parseInt((range[3] ?? '').slice(0, 4), 16);
      if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(dest) || end < start || end - start > 512) continue;
      for (let code = start; code <= end; code += 1) {
        map.set(code, String.fromCharCode(dest));
        dest += 1;
      }
    }
  }
}

function applyCmap(value: string, map: Map<number, string>): string {
  if (map.size === 0 || !value) return value;
  const latin = value.match(/[A-Za-z]/g)?.length ?? 0;
  if (latin / value.length > 0.6 || /[\u0900-\u097F]/.test(value)) return value;
  let wide = false;
  for (const key of map.keys()) {
    if (key > 255) {
      wide = true;
      break;
    }
  }
  let text = '';
  let hits = 0;
  if (wide && value.length >= 2) {
    for (let index = 0; index + 1 < value.length; index += 2) {
      const code = (value.charCodeAt(index) << 8) | (value.charCodeAt(index + 1) & 255);
      const mapped = map.get(code);
      if (mapped) {
        text += mapped;
        hits += 1;
      } else text += `${value[index] ?? ''}${value[index + 1] ?? ''}`;
    }
    if (value.length % 2 === 1) text += value[value.length - 1] ?? '';
  } else {
    for (let index = 0; index < value.length; index += 1) {
      const mapped = map.get(value.charCodeAt(index));
      if (mapped) {
        text += mapped;
        hits += 1;
      } else text += value[index] ?? '';
    }
  }
  return hits > 0 ? text : value;
}

const ORDINARY = /[\p{L}\p{M}\p{N}\s.,:;'"()/+@#%&$*€£₹।॥-]/gu;

function readableRatio(value: string): number {
  const visible = value.replace(/\p{Cf}/gu, '');
  if (!visible) return 1;
  const ordinary = visible.match(ORDINARY)?.length ?? 0;
  return ordinary / visible.length;
}

function usableString(value: string): string {
  let cleaned = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) {
      cleaned += ' ';
      continue;
    }
    if (code < 32 || code === 127) continue;
    cleaned += char;
  }
  if (cleaned.length > 2000) return '';
  if (cleaned.length > 12 && readableRatio(cleaned) < 0.8) return '';
  return cleaned;
}

function keepFragment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const visible = trimmed.replace(/\p{Cf}/gu, '');
  const letters = visible.match(/\p{L}/gu)?.length ?? 0;
  if (1 - readableRatio(visible) > 0.34) return false;
  if (letters > 0) return true;
  return trimmed.length <= 40 && /\p{N}/u.test(trimmed);
}

function keepLine(line: string): boolean {
  const trimmed = line.replace(/[ \t]+/g, ' ').trim();
  if (!trimmed) return false;
  const visible = trimmed.replace(/\p{Cf}/gu, '');
  const letters = visible.match(/\p{L}/gu)?.length ?? 0;
  if (1 - readableRatio(visible) > 0.2) return false;
  if (letters >= 2) return true;
  return trimmed.length <= 40 && /[\p{L}\p{N}]/u.test(trimmed);
}

export function presentableText(value: string): string {
  const lines = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(keepLine);
  const unique: string[] = [];
  for (const line of lines) {
    if (unique[unique.length - 1] !== line) unique.push(line);
  }
  return unique.join('\n').slice(0, MAX_TEXT).trim();
}

function textFromContent(content: string, map: Map<number, string>): string {
  let line = '';
  const lines: string[] = [];
  const operands: Array<{ kind: 'string' | 'array'; value: string } | { kind: 'other' }> = [];

  function breakLine() {
    lines.push(line);
    line = '';
  }

  function lastShown(): string {
    for (let index = operands.length - 1; index >= 0; index -= 1) {
      const token = operands[index];
      if (token?.kind === 'string' || token?.kind === 'array') return token.value;
    }
    return '';
  }

  let index = 0;
  while (index < content.length) {
    const char = content[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '%') {
      while (index < content.length && content[index] !== '\n') index += 1;
      continue;
    }
    if (char === '(') {
      const literal = readLiteralSpan(content, index);
      operands.push({ kind: 'string', value: literal.value });
      index = literal.next;
      continue;
    }
    if (char === '<' && content[index + 1] !== '<') {
      const hex = readHexSpan(content, index);
      operands.push({ kind: 'string', value: hex.value });
      index = hex.next;
      continue;
    }
    if (char === '[') {
      const array = readTextArray(content, index);
      operands.push({ kind: 'array', value: array.value });
      index = array.next;
      continue;
    }
    if (char === '<' || char === '>' || char === ']' || char === '{' || char === '}') {
      operands.push({ kind: 'other' });
      index += char === '<' && content[index + 1] === '<' ? 2 : 1;
      if (content[index - 1] === '>' && content[index] === '>') index += 1;
      continue;
    }
    const start = index + (char === '/' ? 1 : 0);
    index = start;
    while (index < content.length && !/[\s[\]<>(){}/%]/.test(content[index] ?? '')) index += 1;
    if (char === '/') {
      operands.push({ kind: 'other' });
      continue;
    }
    const word = content.slice(start, index);
    if (word === 'Tj' || word === "'" || word === '"' || word === 'TJ') {
      const shown = usableString(applyCmap(decodePdfUnicode(lastShown()), map));
      if (keepFragment(shown)) line += shown;
      if (word === "'" || word === '"') breakLine();
      operands.length = 0;
      continue;
    }
    if (word === 'T*' || word === 'Td' || word === 'TD' || word === 'Tm' || word === 'ET') {
      if (line) breakLine();
      operands.length = 0;
      continue;
    }
    operands.push({ kind: 'other' });
    if (operands.length > 8) operands.shift();
  }
  if (line) lines.push(line);
  return presentableText(lines.join('\n'));
}

function streamPayload(data: Uint8Array, marker: number): { start: number; end: number } | null {
  let start = marker + STREAM.length;
  if (data[start] === 13 && data[start + 1] === 10) start += 2;
  else if (data[start] === 10 || data[start] === 13) start += 1;
  const end = indexOfBytes(data, ENDSTREAM, start);
  if (end < 0) return null;
  return { start, end };
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = latin1(bytes.subarray(0, Math.min(bytes.length, 12_000)));
  return /[\s)\]]Tj(?:\s|$)/.test(sample) || /[\s)\]]TJ(?:\s|$)/.test(sample);
}

function isImageStream(data: Uint8Array, marker: number): boolean {
  const header = latin1(data.subarray(Math.max(0, marker - 900), marker));
  const dictAt = header.lastIndexOf('<<');
  const dict = dictAt >= 0 ? header.slice(dictAt) : header;
  if (/\/Subtype\s*\/Image\b/.test(dict)) return true;
  return /\/Width\b/.test(dict) && /\/Height\b/.test(dict) && /\/ColorSpace\b/.test(dict);
}

function decodedStream(data: Uint8Array, marker: number, payload: { start: number; end: number }): Uint8Array | null {
  if (isImageStream(data, marker)) return null;
  const raw = data.subarray(payload.start, payload.end);
  const header = data.subarray(Math.max(0, marker - 400), marker);
  if (indexOfBytes(header, FLATE) < 0) {
    if (raw.length > MAX_STREAM && !looksLikeText(raw)) return null;
    return raw.length > MAX_STREAM ? raw.subarray(0, MAX_STREAM) : raw;
  }
  if (raw.length > MAX_STREAM) return null;
  try {
    const inflated = inflate(raw);
    if (inflated.length > MAX_STREAM && !looksLikeText(inflated.subarray(0, 12_000))) return null;
    return inflated.length > MAX_STREAM ? inflated.subarray(0, MAX_STREAM) : inflated;
  } catch {
    return null;
  }
}

function visitStreams(data: Uint8Array, visit: (decoded: Uint8Array) => void) {
  let cursor = 0;
  while (cursor < data.length) {
    const marker = indexOfBytes(data, STREAM, cursor);
    if (marker < 0) break;
    const payload = streamPayload(data, marker);
    if (!payload) {
      cursor = marker + STREAM.length;
      continue;
    }
    const decoded = decodedStream(data, marker, payload);
    if (decoded) visit(decoded);
    cursor = payload.end + ENDSTREAM.length;
  }
}

export function pdfPageRatio(data: Uint8Array): number {
  const sample = latin1(data.subarray(0, Math.min(data.length, 250_000)));
  const box = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(sample);
  if (!box) return 792 / 612;
  let width = Math.abs(Number(box[3]) - Number(box[1]));
  let height = Math.abs(Number(box[4]) - Number(box[2]));
  if (!(width > 0) || !(height > 0)) return 792 / 612;
  if (/\/Rotate\s+(?:90|270)\b/.test(sample)) {
    const swap = width;
    width = height;
    height = swap;
  }
  const ratio = height / width;
  return ratio >= 0.2 && ratio <= 6 ? ratio : 792 / 612;
}

export function extractPdfText(data: Uint8Array): string {
  const map = new Map<number, string>();
  visitStreams(data, (decoded) => {
    const sample = latin1(decoded.subarray(0, Math.min(decoded.length, 200_000)));
    if (sample.includes('beginbfchar') || sample.includes('beginbfrange')) absorbCmap(sample, map);
  });

  const pieces: string[] = [];
  let used = 0;
  visitStreams(data, (decoded) => {
    if (used >= MAX_TEXT) return;
    if (!looksLikeText(decoded)) return;
    const text = textFromContent(latin1(decoded), map);
    if (!text) return;
    pieces.push(text);
    used += text.length + 1;
  });
  return pieces.join('\n').slice(0, MAX_TEXT).trim();
}
