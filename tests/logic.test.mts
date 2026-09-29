import assert from 'node:assert/strict';
import test from 'node:test';
import { deflate } from 'pako';

import { parseBackup, serializeBackup } from '../src/lib/backup.ts';
import { base64ToBytes, bytesToBase64 } from '../src/lib/bytes.ts';
import { inferKind, parseFields } from '../src/lib/fields.ts';
import { extractPdfText } from '../src/lib/pdfText.ts';
import { buildSamplePassportPdf } from '../src/lib/samplePdf.ts';

test('base64 round trip', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 255, 10, 64]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('sample passport text and fields', () => {
  const text = extractPdfText(buildSamplePassportPdf());
  assert.match(text, /ADEYEMI/);
  assert.match(text, /E12345678/);
  const fields = parseFields(text);
  const passport = fields.find((field) => field.key === 'passport');
  const surname = fields.find((field) => field.key === 'surname');
  const birth = fields.find((field) => field.key === 'dob');
  assert.equal(passport?.value, 'E12345678');
  assert.equal(surname?.value, 'ADEYEMI');
  assert.equal(birth?.value, '14 MAR 1992');
  assert.equal(inferKind(text), 'identity');
});

test('pdf text ignores strings that are not shown', () => {
  const content = [
    'BT',
    '(ignore this parenthetical)',
    '(Policy No: AB-99) Tj',
    '<48656C6C6F> Tj',
    '[(Wor) 40 (ld)] TJ',
    '(###@@@###) Tj',
    'ET',
  ].join('\n');
  const bytes = new TextEncoder().encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const text = extractPdfText(bytes);
  assert.match(text, /Policy No: AB-99/);
  assert.match(text, /Hello/);
  assert.match(text, /World/);
  assert.doesNotMatch(text, /ignore this/);
  assert.doesNotMatch(text, /###/);
});

test('pdf text uses a unicode map instead of raw character codes', () => {
  const cmap = 'beginbfchar\n<01> <0048>\n<02> <0069>\nendbfchar\n';
  const content = `BT\n(${String.fromCharCode(1, 2)}) Tj\nET`;
  const file = `stream\n${cmap}endstream\nstream\n${content}\nendstream`;
  assert.equal(extractPdfText(new TextEncoder().encode(file)), 'Hi');
});

test('flate-encoded pdf text', () => {
  const content = new TextEncoder().encode('BT\n(Policy No: AB-99) Tj\nET');
  const compressed = deflate(content);
  const head = new TextEncoder().encode(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`);
  const tail = new TextEncoder().encode('\nendstream');
  const pdf = new Uint8Array(head.length + compressed.length + tail.length);
  pdf.set(head, 0);
  pdf.set(compressed, head.length);
  pdf.set(tail, head.length + compressed.length);
  const text = extractPdfText(pdf);
  assert.match(text, /Policy No: AB-99/);
  assert.equal(parseFields(text).find((field) => field.key === 'policy')?.value, 'AB-99');
});

test('mrz passport fields', () => {
  const text = [
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
  ].join('\n');
  const fields = parseFields(text);
  assert.equal(fields.find((field) => field.key === 'surname')?.value, 'ERIKSSON');
  assert.equal(fields.find((field) => field.key === 'passport')?.value, 'L898902C3');
});

test('backup parser rejects unsafe files', () => {
  const good = serializeBackup({
    format: 'modo-vault',
    version: 1,
    exportedAt: 1,
    envelope: { salt: 'aa', iterations: 1, sealed: 'bb' },
    files: { 'catalog.bin': 'YQ==' },
  });
  assert.equal(parseBackup(good).files['catalog.bin'], 'YQ==');
  const bad = new TextEncoder().encode(JSON.stringify({ format: 'modo-vault', version: 1, envelope: { salt: 'a', iterations: 1, sealed: 'b' }, files: { '../secret': 'no' } }));
  assert.throws(() => parseBackup(bad), /unsafe|MODO backup/);
});
