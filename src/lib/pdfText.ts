import { inflate } from 'pako';

const STREAM = ascii('stream');
const ENDSTREAM = ascii('endstream');
const FLATE = ascii('FlateDecode');
const MAX_STREAM = 5_000_000;
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

function decodeHex(body: string): string {
  const hex = body.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(value)) return '';
    bytes.push(value);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
    }
    return text;
  }
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
  const plain = value.match(/[A-Za-z]/g)?.length ?? 0;
  if (plain / value.length > 0.6) return value;
  let text = '';
  let hits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const mapped = map.get(value.charCodeAt(index));
    if (mapped) {
      text += mapped;
      hits += 1;
    } else text += value[index];
  }
  return hits > 0 ? text : value;
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
  if (cleaned.length > 12) {
    const ordinary = cleaned.match(/[\p{L}\p{N}\s.,:;'"()/+@#%&$*€£-]/gu)?.length ?? 0;
    if (ordinary / cleaned.length < 0.8) return '';
  }
  return cleaned;
}

function keepFragment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const letters = trimmed.match(/\p{L}/gu)?.length ?? 0;
  const odd = trimmed.match(/[^\p{L}\p{N}\s.,:;'"()/+@#%&$*€£<>_-]/gu)?.length ?? 0;
  if (odd > trimmed.length * 0.34) return false;
  if (letters > 0) return true;
  return trimmed.length <= 40 && /\p{N}/u.test(trimmed);
}

function keepLine(line: string): boolean {
  const trimmed = line.replace(/[ \t]+/g, ' ').trim();
  if (!trimmed) return false;
  const letters = trimmed.match(/\p{L}/gu)?.length ?? 0;
  const odd = trimmed.match(/[^\p{L}\p{N}\s.,:;'"()/+@#%&$*€£<>_-]/gu)?.length ?? 0;
  if (odd > trimmed.length * 0.2) return false;
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
  if (end < 0 || end - start > MAX_STREAM) return null;
  return { start, end };
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = latin1(bytes.subarray(0, Math.min(bytes.length, 12_000)));
  return /[\s)\]]Tj(?:\s|$)/.test(sample) || /[\s)\]]TJ(?:\s|$)/.test(sample);
}

function decodedStream(data: Uint8Array, marker: number, payload: { start: number; end: number }): Uint8Array | null {
  const raw = data.subarray(payload.start, payload.end);
  const header = data.subarray(Math.max(0, marker - 400), marker);
  if (indexOfBytes(header, FLATE) < 0) return raw;
  try {
    return inflate(raw);
  } catch {
    return null;
  }
}

export function extractPdfText(data: Uint8Array): string {
  const streams: Uint8Array[] = [];
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
    if (decoded) streams.push(decoded);
    cursor = payload.end + ENDSTREAM.length;
  }

  const map = new Map<number, string>();
  for (const stream of streams) {
    const text = latin1(stream.subarray(0, Math.min(stream.length, 200_000)));
    if (text.includes('beginbfchar') || text.includes('beginbfrange')) absorbCmap(text, map);
  }

  const pieces: string[] = [];
  for (const stream of streams) {
    if (pieces.join('\n').length >= MAX_TEXT) break;
    if (!looksLikeText(stream)) continue;
    const text = textFromContent(latin1(stream), map);
    if (text) pieces.push(text);
  }
  return pieces.join('\n').slice(0, MAX_TEXT).trim();
}
