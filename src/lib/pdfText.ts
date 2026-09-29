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

function isOperator(content: string, index: number, operator: string): boolean {
  if (!content.startsWith(operator, index)) return false;
  const before = index === 0 || /[\s\]>]/.test(content[index - 1] ?? '');
  const after = content[index + operator.length];
  return before && (after === undefined || /[\s\[</(]/.test(after));
}

function textFromContent(content: string): string {
  let output = '';
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '(') {
      let cursor = index + 1;
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
      output += decodeLiteral(body);
      index = cursor;
      continue;
    }
    if (isOperator(content, index, 'T*') || isOperator(content, index, 'Td') || isOperator(content, index, 'TD')) {
      if (!output.endsWith('\n')) output += '\n';
    }
  }
  return output
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, lineIndex, lines) => line.length > 0 || lines[lineIndex - 1]?.length > 0)
    .join('\n')
    .trim();
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
  const sample = latin1(bytes.subarray(0, Math.min(bytes.length, 2000)));
  return sample.includes('Tj') || sample.includes('TJ') || sample.includes('(');
}

export function extractPdfText(data: Uint8Array): string {
  const pieces: string[] = [];
  let cursor = 0;
  while (cursor < data.length && pieces.join('\n').length < MAX_TEXT) {
    const marker = indexOfBytes(data, STREAM, cursor);
    if (marker < 0) break;
    const payload = streamPayload(data, marker);
    if (!payload) {
      cursor = marker + STREAM.length;
      continue;
    }
    const raw = data.subarray(payload.start, payload.end);
    const windowStart = Math.max(0, marker - 400);
    const header = data.subarray(windowStart, marker);
    const flate = indexOfBytes(header, FLATE) >= 0;
    let decoded = raw;
    if (flate) {
      try {
        decoded = inflate(raw);
      } catch {
        cursor = payload.end + ENDSTREAM.length;
        continue;
      }
    }
    if (looksLikeText(decoded)) {
      const text = textFromContent(latin1(decoded));
      if (text) pieces.push(text);
    }
    cursor = payload.end + ENDSTREAM.length;
  }
  return pieces.join('\n').slice(0, MAX_TEXT).trim();
}
