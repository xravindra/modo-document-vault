import { cbc } from '@noble/ciphers/aes.js';
import { md5 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { inflate } from 'pako';

const PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00,
  0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

type PdfName = { kind: 'name'; value: string };
type PdfNum = { kind: 'num'; value: number };
type PdfStr = { kind: 'string'; bytes: Uint8Array };
type PdfRef = { kind: 'ref'; id: number; gen: number };
type PdfBool = { kind: 'bool'; value: boolean };
type PdfNull = { kind: 'null' };
type PdfArray = { kind: 'array'; items: PdfValue[] };
type PdfDict = { kind: 'dict'; entries: [string, PdfValue][] };
type PdfStream = { kind: 'stream'; dict: PdfDict; data: Uint8Array };
type PdfValue = PdfName | PdfNum | PdfStr | PdfRef | PdfBool | PdfNull | PdfArray | PdfDict | PdfStream;
type PdfObj = { id: number; gen: number; value: PdfValue };
type XrefEntry =
  | { id: number; gen: number; kind: 'free' }
  | { id: number; gen: number; kind: 'plain'; offset: number }
  | { id: number; gen: number; kind: 'compressed' };
type CipherName = 'rc4' | 'aes' | 'none';
type Access = {
  fileKey: Uint8Array;
  version: number;
  strings: CipherName;
  streams: CipherName;
  encryptMetadata: boolean;
};

export function openPdf(bytes: Uint8Array, password: string): Uint8Array {
  if (bytes.length < 8 || bytes[0] !== 0x25) couldNot('not a pdf');
  const found = readXrefs(bytes);
  const objects = loadPlainObjects(bytes, found.xref);
  const encryptId = refId(dictGet(found.trailer, 'Encrypt'));
  const encrypt = encryptId === null ? undefined : objects.get(encryptId);
  if (!encrypt || encrypt.value.kind !== 'dict') return bytes;
  const access = deriveAccess(encrypt.value, found.trailer, password);
  const output = new Map<number, PdfObj>();
  for (const obj of objects.values()) {
    if (found.xrefIds.has(obj.id) || obj.id === encrypt.id) continue;
    if (obj.value.kind === 'stream' && dictName(obj.value.dict, 'Type') === 'ObjStm') {
      const decrypted = decryptStream(access, obj.value, obj.id, obj.gen);
      const plain = inflateStream(obj.value.dict, decrypted);
      const count = dictNum(obj.value.dict, 'N') ?? 0;
      const first = dictNum(obj.value.dict, 'First') ?? 0;
      const inners = parseObjectStream(plain, count, first);
      const keepStrings = stringsAlreadyPlain(inners.map((inner) => inner.value));
      for (const inner of inners) {
        if (output.has(inner.id) || inner.id === encrypt.id) continue;
        const value = keepStrings ? inner.value : decryptValue(access, inner.value, inner.id, 0);
        output.set(inner.id, { id: inner.id, gen: 0, value });
      }
      continue;
    }
    output.set(obj.id, { id: obj.id, gen: obj.gen, value: decryptValue(access, obj.value, obj.id, obj.gen) });
  }
  const root = dictGet(found.trailer, 'Root');
  if (root?.kind !== 'ref') couldNot('missing root');
  const info = dictGet(found.trailer, 'Info');
  return buildPdf([...output.values()], root, info?.kind === 'ref' ? info : null, fileIds(found.trailer));
}

function deriveAccess(encrypt: PdfDict, trailer: PdfDict, password: string): Access {
  const version = dictNum(encrypt, 'V') ?? 0;
  const revision = dictNum(encrypt, 'R') ?? 0;
  const ownerKey = stringBytes(dictGet(encrypt, 'O'));
  const userKey = stringBytes(dictGet(encrypt, 'U'));
  if (!ownerKey || !userKey) couldNot('missing keys');
  const encryptMetadata = dictBool(encrypt, 'EncryptMetadata') !== false;
  const strings = cryptMethod(encrypt, 'StrF', version);
  const streams = cryptMethod(encrypt, 'StmF', version);
  if (version === 5 && (revision === 5 || revision === 6)) {
    const fileKey = aes256FileKey(password, revision, ownerKey, userKey, encrypt);
    return { fileKey, version, strings: 'aes', streams: 'aes', encryptMetadata };
  }
  if ((version === 1 || version === 2 || version === 4) && revision >= 2 && revision <= 4) {
    const lengthBits = dictNum(encrypt, 'Length') ?? (revision === 2 ? 40 : 128);
    const keyLength = Math.max(5, Math.min(16, Math.floor(lengthBits / 8)));
    const fileId = fileIds(trailer)?.[0] ?? new Uint8Array();
    const permissions = dictNum(encrypt, 'P') ?? 0;
    const fileKey = legacyFileKey(password, ownerKey, userKey, permissions, fileId, revision, keyLength, encryptMetadata);
    const access = { fileKey, version, strings, streams, encryptMetadata };
    if (version < 4) {
      access.strings = 'rc4';
      access.streams = 'rc4';
    }
    return access;
  }
  unsupported(version, revision);
}

function aes256FileKey(password: string, revision: number, ownerKey: Uint8Array, userKey: Uint8Array, encrypt: PdfDict): Uint8Array {
  const pwd = utf8(password).slice(0, 127);
  const user = revision === 6 ? validateAes256(pwd, userKey, new Uint8Array(), stringBytes(dictGet(encrypt, 'UE'))) : validateAes256r5(pwd, userKey, new Uint8Array(), stringBytes(dictGet(encrypt, 'UE')));
  if (user) return user;
  const owner = revision === 6 ? validateAes256(pwd, ownerKey, userKey, stringBytes(dictGet(encrypt, 'OE'))) : validateAes256r5(pwd, ownerKey, userKey, stringBytes(dictGet(encrypt, 'OE')));
  if (owner) return owner;
  wrongPassword();
}

function validateAes256(password: Uint8Array, key: Uint8Array, userKey: Uint8Array, wrapped: Uint8Array | null): Uint8Array | null {
  if (key.length < 48 || !wrapped) return null;
  const hash = hash2B(password, key.slice(32, 40), userKey);
  if (!sameBytes(hash, key.slice(0, 32))) return null;
  const opener = hash2B(password, key.slice(40, 48), userKey);
  return aesDecrypt(opener, new Uint8Array(16), wrapped, false);
}

function validateAes256r5(password: Uint8Array, key: Uint8Array, userKey: Uint8Array, wrapped: Uint8Array | null): Uint8Array | null {
  if (key.length < 48 || !wrapped) return null;
  const check = sha256(concat(password, key.slice(32, 40), userKey));
  if (!sameBytes(check, key.slice(0, 32))) return null;
  const opener = sha256(concat(password, key.slice(40, 48), userKey));
  return aesDecrypt(opener, new Uint8Array(16), wrapped, false);
}

function hash2B(password: Uint8Array, salt: Uint8Array, userKey: Uint8Array): Uint8Array {
  let key = sha256(concat(password, salt, userKey));
  let round = 0;
  while (round < 512) {
    const block = concat(password, key, userKey);
    const repeated = new Uint8Array(block.length * 64);
    for (let index = 0; index < 64; index += 1) repeated.set(block, index * block.length);
    const encrypted = aesEncrypt(key.slice(0, 16), key.slice(16, 32), repeated);
    let sum = 0;
    for (let index = 0; index < 16; index += 1) sum += encrypted[index];
    const choice = sum % 3;
    key = choice === 0 ? sha256(encrypted) : choice === 1 ? sha384(encrypted) : sha512(encrypted);
    round += 1;
    if (round >= 64 && encrypted[encrypted.length - 1] <= round - 32) break;
  }
  return key.slice(0, 32);
}

function legacyFileKey(
  password: string,
  ownerKey: Uint8Array,
  userKey: Uint8Array,
  permissions: number,
  fileId: Uint8Array,
  revision: number,
  keyLength: number,
  encryptMetadata: boolean,
): Uint8Array {
  const fromUser = encryptionKey(padPassword(utf8(password)), ownerKey, permissions, fileId, revision, keyLength, encryptMetadata);
  if (userPasswordMatches(fromUser, userKey, fileId, revision)) return fromUser;
  const recovered = recoverUserPassword(padPassword(utf8(password)), ownerKey, revision, keyLength);
  const fromOwner = encryptionKey(padPassword(recovered), ownerKey, permissions, fileId, revision, keyLength, encryptMetadata);
  if (userPasswordMatches(fromOwner, userKey, fileId, revision)) return fromOwner;
  wrongPassword();
}

function encryptionKey(
  padded: Uint8Array,
  ownerKey: Uint8Array,
  permissions: number,
  fileId: Uint8Array,
  revision: number,
  keyLength: number,
  encryptMetadata: boolean,
): Uint8Array {
  const extra = revision >= 4 && !encryptMetadata ? 4 : 0;
  const input = new Uint8Array(padded.length + ownerKey.length + 4 + fileId.length + extra);
  let offset = 0;
  input.set(padded, offset);
  offset += padded.length;
  input.set(ownerKey, offset);
  offset += ownerKey.length;
  const perms = permissions | 0;
  input[offset++] = perms & 255;
  input[offset++] = (perms >> 8) & 255;
  input[offset++] = (perms >> 16) & 255;
  input[offset++] = (perms >> 24) & 255;
  input.set(fileId, offset);
  if (extra) input.fill(0xff, input.length - 4);
  let hash = md5(input);
  if (revision >= 3) {
    for (let index = 0; index < 50; index += 1) hash = md5(hash.slice(0, keyLength));
  }
  return hash.slice(0, keyLength);
}

function userPasswordMatches(fileKey: Uint8Array, userKey: Uint8Array, fileId: Uint8Array, revision: number): boolean {
  if (revision === 2) return sameBytes(rc4(fileKey, PADDING), userKey);
  let value = rc4(fileKey, md5(concat(PADDING, fileId)));
  for (let index = 1; index <= 19; index += 1) value = rc4(xorKey(fileKey, index), value);
  return sameBytes(value.slice(0, 16), userKey.slice(0, 16));
}

function recoverUserPassword(paddedOwner: Uint8Array, ownerKey: Uint8Array, revision: number, keyLength: number): Uint8Array {
  let hash = md5(paddedOwner);
  if (revision >= 3) {
    for (let index = 0; index < 50; index += 1) hash = md5(hash);
  }
  const key = hash.slice(0, keyLength);
  if (revision === 2) return rc4(key, ownerKey);
  let value: Uint8Array = ownerKey.slice();
  for (let index = 19; index >= 0; index -= 1) value = rc4(xorKey(key, index), value);
  return value;
}

function cryptMethod(encrypt: PdfDict, which: 'StmF' | 'StrF', version: number): CipherName {
  if (version >= 5) return 'aes';
  if (version < 4) return 'rc4';
  const filterName = dictName(encrypt, which) ?? 'Identity';
  if (filterName === 'Identity') return 'none';
  const filters = dictGet(encrypt, 'CF');
  const filter = filters?.kind === 'dict' ? dictGet(filters, filterName) : undefined;
  const method = filter?.kind === 'dict' ? (dictName(filter, 'CFM') ?? 'V2') : 'V2';
  if (method === 'None' || method === 'Identity') return 'none';
  if (method === 'AESV2' || method === 'AESV3') return 'aes';
  return 'rc4';
}

function stringsAlreadyPlain(values: PdfValue[]): boolean {
  const samples: Uint8Array[] = [];
  const visit = (value: PdfValue) => {
    if (value.kind === 'string') {
      if (value.bytes.length >= 8) samples.push(value.bytes);
      return;
    }
    if (value.kind === 'array') value.items.forEach(visit);
    else if (value.kind === 'dict') value.entries.forEach(([, item]) => visit(item));
  };
  values.forEach(visit);
  if (samples.length === 0) return false;
  const plain = samples.filter(looksPlain).length;
  return plain * 2 >= samples.length;
}

function looksPlain(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const pairs = Math.floor((bytes.length - 2) / 2);
    if (pairs < 2) return false;
    let readable = 0;
    for (let index = 0; index < pairs; index += 1) {
      const high = bytes[2 + index * 2];
      const low = bytes[3 + index * 2];
      if (high === 0 && low >= 0x20 && low < 0x7f) readable += 1;
    }
    return readable * 4 >= pairs * 3;
  }
  let readable = 0;
  for (const byte of bytes) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte < 0x7f)) readable += 1;
  }
  return readable * 4 >= bytes.length * 3;
}

function decryptValue(access: Access, value: PdfValue, id: number, gen: number): PdfValue {
  if (value.kind === 'string') return { kind: 'string', bytes: decryptBytes(access, access.strings, value.bytes, id, gen, false) };
  if (value.kind === 'array') return { kind: 'array', items: value.items.map((item) => decryptValue(access, item, id, gen)) };
  if (value.kind === 'dict') {
    return { kind: 'dict', entries: value.entries.map(([key, item]) => [key, decryptValue(access, item, id, gen)]) };
  }
  if (value.kind === 'stream') {
    const dict = decryptValue(access, value.dict, id, gen);
    if (dict.kind !== 'dict') return value;
    return { kind: 'stream', dict, data: decryptStream(access, { kind: 'stream', dict: value.dict, data: value.data }, id, gen) };
  }
  return value;
}

function decryptStream(access: Access, stream: PdfStream, id: number, gen: number): Uint8Array {
  if (dictName(stream.dict, 'Type') === 'Metadata' && !access.encryptMetadata) return stream.data;
  return decryptBytes(access, access.streams, stream.data, id, gen, true);
}

function decryptBytes(access: Access, method: CipherName, data: Uint8Array, id: number, gen: number, stream: boolean): Uint8Array {
  if (method === 'none' || data.length === 0) return data;
  const key = objectKey(access, method, id, gen);
  if (method === 'rc4') return rc4(key, data);
  if (data.length < 16) return data;
  const body = data.subarray(16);
  if (body.length % 16 !== 0) {
    if (stream) couldNot('bad aes stream');
    return data;
  }
  try {
    return aesDecrypt(key, data.slice(0, 16), body, true);
  } catch (error) {
    if (stream) couldNot(error instanceof Error ? error.message : 'bad aes stream');
    return data;
  }
}

function objectKey(access: Access, method: CipherName, id: number, gen: number): Uint8Array {
  if (access.version >= 5) return access.fileKey;
  const aes = method === 'aes';
  const input = new Uint8Array(access.fileKey.length + 5 + (aes ? 4 : 0));
  input.set(access.fileKey);
  let offset = access.fileKey.length;
  input[offset++] = id & 255;
  input[offset++] = (id >> 8) & 255;
  input[offset++] = (id >> 16) & 255;
  input[offset++] = gen & 255;
  input[offset++] = (gen >> 8) & 255;
  if (aes) {
    input[offset++] = 0x73;
    input[offset++] = 0x41;
    input[offset++] = 0x6c;
    input[offset++] = 0x54;
  }
  return md5(input).slice(0, Math.min(access.fileKey.length + 5, 16));
}

function aesEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbc(key, iv, { disablePadding: true }).encrypt(data);
}

function aesDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array, padding: boolean): Uint8Array {
  return cbc(key, iv, { disablePadding: !padding }).decrypt(data);
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const state = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) state[index] = index;
  let jay = 0;
  for (let index = 0; index < 256; index += 1) {
    jay = (jay + state[index] + key[index % key.length]) & 255;
    const swap = state[index];
    state[index] = state[jay];
    state[jay] = swap;
  }
  const out = new Uint8Array(data.length);
  let eye = 0;
  jay = 0;
  for (let index = 0; index < data.length; index += 1) {
    eye = (eye + 1) & 255;
    jay = (jay + state[eye]) & 255;
    const swap = state[eye];
    state[eye] = state[jay];
    state[jay] = swap;
    out[index] = data[index] ^ state[(state[eye] + state[jay]) & 255];
  }
  return out;
}

function xorKey(key: Uint8Array, round: number): Uint8Array {
  const next = new Uint8Array(key.length);
  for (let index = 0; index < key.length; index += 1) next[index] = key[index] ^ round;
  return next;
}

function padPassword(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(32);
  if (bytes.length >= 32) padded.set(bytes.subarray(0, 32));
  else {
    padded.set(bytes);
    padded.set(PADDING.subarray(0, 32 - bytes.length), bytes.length);
  }
  return padded;
}

function readXrefs(bytes: Uint8Array): { xref: Map<number, XrefEntry>; trailer: PdfDict; xrefIds: Set<number> } {
  const xref = new Map<number, XrefEntry>();
  const xrefIds = new Set<number>();
  let trailer: PdfDict | null = null;
  const seen = new Set<number>();
  let offset = startXref(bytes);
  let newest = true;
  while (offset > 0 && !seen.has(offset)) {
    seen.add(offset);
    const section = readXrefAt(bytes, offset, xrefIds);
    for (const entry of section.entries) {
      if (newest || !xref.has(entry.id)) xref.set(entry.id, entry);
    }
    if (newest) trailer = section.trailer;
    newest = false;
    offset = section.prev ?? 0;
  }
  if (!trailer) couldNot('missing trailer');
  return { xref, trailer, xrefIds };
}

function readXrefAt(bytes: Uint8Array, offset: number, xrefIds: Set<number>): { entries: XrefEntry[]; trailer: PdfDict; prev?: number } {
  const parser = new Parser(bytes, offset);
  parser.skip();
  if (parser.keyword('xref')) return parseXrefTable(parser);
  const object = parseObjectAt(bytes, offset, () => couldNot('bad xref length'));
  if (object.value.kind !== 'stream') couldNot('bad xref');
  xrefIds.add(object.id);
  const data = inflateStream(object.value.dict, object.value.data);
  const entries = decodeXrefStream(object.value.dict, data);
  return { entries, trailer: object.value.dict, prev: dictNum(object.value.dict, 'Prev') };
}

function parseXrefTable(parser: Parser): { entries: XrefEntry[]; trailer: PdfDict; prev?: number } {
  const entries: XrefEntry[] = [];
  while (parser.i < parser.bytes.length) {
    parser.skip();
    if (parser.keyword('trailer')) break;
    const start = parser.parseNumber();
    const count = parser.parseNumber();
    while (parser.peek() !== 0x0a && parser.peek() !== 0x0d && parser.peek() >= 0) parser.i += 1;
    if (parser.peek() === 0x0d) parser.i += 1;
    if (parser.peek() === 0x0a) parser.i += 1;
    for (let index = 0; index < count; index += 1) {
      const line = parser.bytes.subarray(parser.i, parser.i + 20);
      parser.i += 20;
      const at = Number(latin1(line.subarray(0, 10)));
      const gen = Number(latin1(line.subarray(11, 16)));
      const id = start + index;
      entries.push(line[17] === 0x6e ? { id, gen, kind: 'plain', offset: at } : { id, gen, kind: 'free' });
    }
  }
  const trailer = parser.parseDict();
  return { entries, trailer, prev: dictNum(trailer, 'Prev') };
}

function decodeXrefStream(dict: PdfDict, data: Uint8Array): XrefEntry[] {
  const widths = dictGet(dict, 'W');
  const fields = widths?.kind === 'array' ? widths.items.map((item) => (item.kind === 'num' ? item.value : 0)) : [1, 2, 1];
  const [typeWidth, secondWidth, thirdWidth] = [fields[0] ?? 1, fields[1] ?? 2, fields[2] ?? 1];
  const width = typeWidth + secondWidth + thirdWidth;
  const { predictor, columns } = predictorOf(dict);
  const rows = predictor >= 10 ? unpredict(data, columns || width, predictor) : data;
  const size = dictNum(dict, 'Size') ?? 0;
  const index = dictGet(dict, 'Index');
  const ranges: number[] = [];
  if (index?.kind === 'array') {
    for (const item of index.items) if (item.kind === 'num') ranges.push(item.value);
  }
  if (ranges.length < 2) {
    ranges.length = 0;
    ranges.push(0, size);
  }
  const entries: XrefEntry[] = [];
  let cursor = 0;
  for (let range = 0; range + 1 < ranges.length; range += 2) {
    const start = ranges[range];
    const count = ranges[range + 1];
    for (let indexAt = 0; indexAt < count; indexAt += 1) {
      const row = rows.subarray(cursor, cursor + width);
      cursor += width;
      if (row.length < width) break;
      const type = typeWidth === 0 ? 1 : readInt(row, 0, typeWidth);
      const second = readInt(row, typeWidth, secondWidth);
      const third = thirdWidth === 0 ? 0 : readInt(row, typeWidth + secondWidth, thirdWidth);
      const id = start + indexAt;
      if (type === 0) entries.push({ id, gen: third || 65535, kind: 'free' });
      else if (type === 1) entries.push({ id, gen: third, kind: 'plain', offset: second });
      else entries.push({ id, gen: 0, kind: 'compressed' });
    }
  }
  return entries;
}

function loadPlainObjects(bytes: Uint8Array, xref: Map<number, XrefEntry>): Map<number, PdfObj> {
  const cache = new Map<number, PdfObj>();
  const loading = new Set<number>();
  const load = (id: number): PdfObj => {
    const hit = cache.get(id);
    if (hit) return hit;
    const entry = xref.get(id);
    if (!entry || entry.kind !== 'plain') couldNot(`missing object ${id}`);
    if (loading.has(id)) couldNot('length cycle');
    loading.add(id);
    const object = parseObjectAt(bytes, entry.offset, (ref) => {
      const target = load(ref.id);
      if (target.value.kind !== 'num') couldNot('bad length');
      return target.value.value;
    });
    object.id = id;
    object.gen = entry.gen;
    cache.set(id, object);
    loading.delete(id);
    return object;
  };
  for (const [id, entry] of xref) {
    if (entry.kind === 'plain') load(id);
  }
  return cache;
}

function parseObjectAt(bytes: Uint8Array, offset: number, lengthOf: (ref: PdfRef) => number): PdfObj {
  const parser = new Parser(bytes, offset);
  parser.skip();
  const id = parser.parseNumber();
  const gen = parser.parseNumber();
  parser.skip();
  if (!parser.keyword('obj')) couldNot('bad object');
  const value = parser.parseValue();
  parser.skip();
  if (value.kind === 'dict' && parser.keyword('stream')) {
    const declared = dictGet(value, 'Length');
    const length = declared?.kind === 'num' ? declared.value : declared?.kind === 'ref' ? lengthOf(declared) : couldNot('missing length');
    return { id, gen, value: { kind: 'stream', dict: value, data: parser.readStream(length) } };
  }
  return { id, gen, value };
}

function parseObjectStream(data: Uint8Array, count: number, first: number): { id: number; value: PdfValue }[] {
  const header = new Parser(data, 0);
  const numbers: number[] = [];
  for (let index = 0; index < count * 2; index += 1) numbers.push(header.parseNumber());
  const objects: { id: number; value: PdfValue }[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = numbers[index * 2];
    const start = first + numbers[index * 2 + 1];
    const end = index + 1 < count ? first + numbers[(index + 1) * 2 + 1] : data.length;
    objects.push({ id, value: new Parser(data.subarray(start, end), 0).parseValue() });
  }
  return objects;
}

class Parser {
  readonly bytes: Uint8Array;
  i: number;

  constructor(bytes: Uint8Array, i: number) {
    this.bytes = bytes;
    this.i = i;
  }

  peek(offset = 0): number {
    const at = this.i + offset;
    return at >= 0 && at < this.bytes.length ? this.bytes[at] : -1;
  }

  skip() {
    while (this.i < this.bytes.length) {
      const byte = this.bytes[this.i];
      if (byte === 0x25) {
        while (this.i < this.bytes.length && this.bytes[this.i] !== 0x0a && this.bytes[this.i] !== 0x0d) this.i += 1;
        continue;
      }
      if (byte === 0x00 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20) {
        this.i += 1;
        continue;
      }
      break;
    }
  }

  keyword(word: string): boolean {
    if (this.i + word.length > this.bytes.length) return false;
    for (let index = 0; index < word.length; index += 1) {
      if (this.bytes[this.i + index] !== word.charCodeAt(index)) return false;
    }
    if (!isDelim(this.peek(word.length))) return false;
    this.i += word.length;
    return true;
  }

  parseValue(): PdfValue {
    this.skip();
    const byte = this.peek();
    if (byte === 0x3c) return this.peek(1) === 0x3c ? this.parseDict() : this.parseHex();
    if (byte === 0x5b) return this.parseArray();
    if (byte === 0x28) return this.parseLiteral();
    if (byte === 0x2f) return this.parseName();
    if (this.keyword('true')) return { kind: 'bool', value: true };
    if (this.keyword('false')) return { kind: 'bool', value: false };
    if (this.keyword('null')) return { kind: 'null' };
    if (byte === 0x2b || byte === 0x2d || byte === 0x2e || (byte >= 0x30 && byte <= 0x39)) {
      const value = this.parseNumber();
      const after = this.i;
      this.skip();
      if (this.peek() === 0x2b || this.peek() === 0x2d || this.peek() === 0x2e || (this.peek() >= 0x30 && this.peek() <= 0x39)) {
        const gen = this.parseNumber();
        this.skip();
        if (this.keyword('R') && Number.isInteger(value) && Number.isInteger(gen)) return { kind: 'ref', id: value, gen };
      }
      this.i = after;
      return { kind: 'num', value };
    }
    couldNot('bad value');
  }

  parseNumber(): number {
    this.skip();
    const start = this.i;
    if (this.peek() === 0x2b || this.peek() === 0x2d) this.i += 1;
    let digits = false;
    while (this.peek() >= 0x30 && this.peek() <= 0x39) {
      this.i += 1;
      digits = true;
    }
    if (this.peek() === 0x2e) {
      this.i += 1;
      while (this.peek() >= 0x30 && this.peek() <= 0x39) {
        this.i += 1;
        digits = true;
      }
    }
    if (!digits) couldNot('bad number');
    return Number(latin1(this.bytes.subarray(start, this.i)));
  }

  parseName(): PdfName {
    this.i += 1;
    let value = '';
    while (!isDelim(this.peek())) {
      let byte = this.bytes[this.i];
      this.i += 1;
      if (byte === 0x23) {
        byte = Number.parseInt(latin1(this.bytes.subarray(this.i, this.i + 2)), 16);
        this.i += 2;
      }
      value += String.fromCharCode(byte);
    }
    return { kind: 'name', value };
  }

  parseHex(): PdfStr {
    this.i += 1;
    let hex = '';
    while (this.peek() !== 0x3e && this.peek() >= 0) {
      const byte = this.bytes[this.i];
      this.i += 1;
      if (byte !== 0x00 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0c && byte !== 0x0d && byte !== 0x20) hex += String.fromCharCode(byte);
    }
    if (this.peek() === 0x3e) this.i += 1;
    if (hex.length % 2 === 1) hex += '0';
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    return { kind: 'string', bytes };
  }

  parseLiteral(): PdfStr {
    this.i += 1;
    const out: number[] = [];
    let depth = 1;
    while (this.i < this.bytes.length && depth > 0) {
      const byte = this.bytes[this.i];
      this.i += 1;
      if (byte === 0x5c) {
        const next = this.bytes[this.i];
        this.i += 1;
        if (next === 0x6e) out.push(0x0a);
        else if (next === 0x72) out.push(0x0d);
        else if (next === 0x74) out.push(0x09);
        else if (next === 0x62) out.push(0x08);
        else if (next === 0x66) out.push(0x0c);
        else if (next === 0x28 || next === 0x29 || next === 0x5c) out.push(next);
        else if (next === 0x0d) {
          if (this.peek() === 0x0a) this.i += 1;
        } else if (next === 0x0a) {
          continue;
        } else if (next >= 0x30 && next <= 0x37) {
          let octal = next - 0x30;
          for (let count = 0; count < 2; count += 1) {
            const digit = this.peek();
            if (digit < 0x30 || digit > 0x37) break;
            this.i += 1;
            octal = (octal << 3) + (digit - 0x30);
          }
          out.push(octal & 255);
        } else if (next !== undefined) out.push(next);
      } else if (byte === 0x28) {
        depth += 1;
        out.push(byte);
      } else if (byte === 0x29) {
        depth -= 1;
        if (depth > 0) out.push(byte);
      } else out.push(byte);
    }
    return { kind: 'string', bytes: Uint8Array.from(out) };
  }

  parseArray(): PdfArray {
    this.i += 1;
    const items: PdfValue[] = [];
    while (this.i < this.bytes.length) {
      this.skip();
      if (this.peek() === 0x5d) {
        this.i += 1;
        break;
      }
      items.push(this.parseValue());
    }
    return { kind: 'array', items };
  }

  parseDict(): PdfDict {
    this.i += 2;
    const entries: [string, PdfValue][] = [];
    while (this.i < this.bytes.length) {
      this.skip();
      if (this.peek() === 0x3e && this.peek(1) === 0x3e) {
        this.i += 2;
        break;
      }
      const name = this.parseName();
      entries.push([name.value, this.parseValue()]);
    }
    return { kind: 'dict', entries };
  }

  readStream(length: number): Uint8Array {
    if (this.peek() === 0x0d) {
      this.i += 1;
      if (this.peek() === 0x0a) this.i += 1;
    } else if (this.peek() === 0x0a) this.i += 1;
    const data = this.bytes.slice(this.i, this.i + length);
    if (data.length !== length) couldNot('short stream');
    this.i += length;
    this.skip();
    this.keyword('endstream');
    return data;
  }
}

function buildPdf(objects: PdfObj[], root: PdfRef, info: PdfRef | null, ids: [Uint8Array, Uint8Array] | null): Uint8Array {
  const body = new Buf();
  body.text('%PDF-1.7\n%\xFF\xFF\xFF\xFF\n');
  const rows: { id: number; gen: number; offset: number }[] = [];
  const sorted = objects.filter((object) => object.id > 0).sort((left, right) => left.id - right.id);
  for (const object of sorted) {
    rows.push({ id: object.id, gen: object.gen, offset: body.length });
    body.text(`${object.id} ${object.gen} obj\n`);
    writeValue(body, object.value);
    body.text('\nendobj\n');
  }
  const xrefAt = body.length;
  body.text('xref\n');
  const entries = [{ id: 0, gen: 65535, offset: 0, used: false }, ...rows.map((row) => ({ ...row, used: true }))];
  let index = 0;
  while (index < entries.length) {
    let end = index + 1;
    while (end < entries.length && entries[end].id === entries[end - 1].id + 1) end += 1;
    body.text(`${entries[index].id} ${end - index}\n`);
    for (let row = index; row < end; row += 1) {
      const item = entries[row];
      body.text(`${String(item.offset).padStart(10, '0')} ${String(item.gen).padStart(5, '0')} ${item.used ? 'n' : 'f'} \n`);
    }
    index = end;
  }
  body.text('trailer\n<< ');
  body.text(`/Size ${sorted.length ? sorted[sorted.length - 1].id + 1 : 1}`);
  body.text(` /Root ${root.id} ${root.gen} R`);
  if (info && sorted.some((object) => object.id === info.id)) body.text(` /Info ${info.id} ${info.gen} R`);
  if (ids) body.text(` /ID [<${hex(ids[0])}><${hex(ids[1])}>]`);
  body.text(' >>\n');
  body.text(`startxref\n${xrefAt}\n%%EOF\n`);
  return body.finish();
}

function writeValue(body: Buf, value: PdfValue) {
  if (value.kind === 'null') body.text('null');
  else if (value.kind === 'bool') body.text(value.value ? 'true' : 'false');
  else if (value.kind === 'num') body.text(Number.isInteger(value.value) ? String(value.value) : String(value.value));
  else if (value.kind === 'name') body.text(encodeName(value.value));
  else if (value.kind === 'string') body.text(`<${hex(value.bytes)}>`);
  else if (value.kind === 'ref') body.text(`${value.id} ${value.gen} R`);
  else if (value.kind === 'array') {
    body.text('[');
    value.items.forEach((item, index) => {
      if (index) body.text(' ');
      writeValue(body, item);
    });
    body.text(']');
  } else if (value.kind === 'dict') writeDict(body, value);
  else {
    const dict = withLength(value.dict, value.data.length);
    writeDict(body, dict);
    body.text('\nstream\n');
    body.bytes(value.data);
    body.text('\nendstream');
  }
}

function writeDict(body: Buf, dict: PdfDict) {
  body.text('<<');
  for (const [key, item] of dict.entries) {
    body.text(` ${encodeName(key)} `);
    writeValue(body, item);
  }
  body.text(' >>');
}

class Buf {
  private readonly chunks: Uint8Array[] = [];
  length = 0;

  text(value: string) {
    this.bytes(encodeLatin1(value));
  }

  bytes(value: Uint8Array) {
    this.chunks.push(value);
    this.length += value.length;
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function inflateStream(dict: PdfDict, data: Uint8Array): Uint8Array {
  if (!hasFilter(dict, 'FlateDecode')) return data;
  try {
    return inflate(data);
  } catch {
    couldNot('bad flate');
  }
}

function predictorOf(dict: PdfDict): { predictor: number; columns: number } {
  const parms = dictGet(dict, 'DecodeParms');
  if (parms?.kind !== 'dict') return { predictor: 1, columns: 1 };
  return { predictor: dictNum(parms, 'Predictor') ?? 1, columns: dictNum(parms, 'Columns') ?? 1 };
}

function unpredict(data: Uint8Array, columns: number, predictor: number): Uint8Array {
  if (predictor < 10) return data;
  if (predictor > 15) unsupported(0, 0);
  const rowIn = columns + 1;
  const rows = Math.floor(data.length / rowIn);
  const out = new Uint8Array(rows * columns);
  let previous = new Uint8Array(columns);
  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * rowIn];
    const source = data.subarray(row * rowIn + 1, row * rowIn + 1 + columns);
    const decoded = new Uint8Array(columns);
    for (let index = 0; index < columns; index += 1) {
      const left = index > 0 ? decoded[index - 1] : 0;
      const up = previous[index];
      const upperLeft = index > 0 ? previous[index - 1] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = Math.floor((left + up) / 2);
      else if (filter === 4) predicted = paeth(left, up, upperLeft);
      decoded[index] = (source[index] + predicted) & 255;
    }
    out.set(decoded, row * columns);
    previous = decoded;
  }
  return out;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function withLength(dict: PdfDict, length: number): PdfDict {
  return { kind: 'dict', entries: [...dict.entries.filter(([key]) => key !== 'Length'), ['Length', { kind: 'num', value: length }]] };
}

function hasFilter(dict: PdfDict, name: string): boolean {
  const filter = dictGet(dict, 'Filter');
  if (filter?.kind === 'name') return filter.value === name;
  return filter?.kind === 'array' && filter.items.some((item) => item.kind === 'name' && item.value === name);
}

function dictGet(dict: PdfDict, name: string): PdfValue | undefined {
  return dict.entries.find(([key]) => key === name)?.[1];
}

function dictNum(dict: PdfDict, name: string): number | undefined {
  const value = dictGet(dict, name);
  return value?.kind === 'num' ? value.value : undefined;
}

function dictName(dict: PdfDict, name: string): string | undefined {
  const value = dictGet(dict, name);
  return value?.kind === 'name' ? value.value : undefined;
}

function dictBool(dict: PdfDict, name: string): boolean | undefined {
  const value = dictGet(dict, name);
  return value?.kind === 'bool' ? value.value : undefined;
}

function stringBytes(value: PdfValue | undefined): Uint8Array | null {
  return value?.kind === 'string' ? value.bytes : null;
}

function refId(value: PdfValue | undefined): number | null {
  return value?.kind === 'ref' ? value.id : null;
}

function fileIds(trailer: PdfDict): [Uint8Array, Uint8Array] | null {
  const id = dictGet(trailer, 'ID');
  if (id?.kind !== 'array' || id.items.length < 2) return null;
  const first = id.items[0];
  const second = id.items[1];
  if (first?.kind !== 'string' || second?.kind !== 'string') return null;
  return [first.bytes, second.bytes];
}

function startXref(bytes: Uint8Array): number {
  const marker = 'startxref';
  let found = -1;
  const from = Math.max(0, bytes.length - 65536);
  for (let index = from; index <= bytes.length - marker.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < marker.length; offset += 1) {
      if (bytes[index + offset] !== marker.charCodeAt(offset)) {
        matched = false;
        break;
      }
    }
    if (matched) found = index;
  }
  if (found < 0) couldNot('missing startxref');
  let index = found + marker.length;
  while (index < bytes.length && (bytes[index] === 0x20 || bytes[index] === 0x0a || bytes[index] === 0x0d || bytes[index] === 0x09)) index += 1;
  let value = 0;
  while (index < bytes.length && bytes[index] >= 0x30 && bytes[index] <= 0x39) {
    value = value * 10 + (bytes[index] - 0x30);
    index += 1;
  }
  return value;
}

function readInt(bytes: Uint8Array, offset: number, width: number): number {
  let value = 0;
  for (let index = 0; index < width; index += 1) value = value * 256 + (bytes[offset + index] ?? 0);
  return value;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

function encodeLatin1(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) out[index] = value.charCodeAt(index) & 255;
  return out;
}

function encodeName(value: string): string {
  let text = '/';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 33 || code > 126 || '()<>[]{}/%#'.includes(value[index])) text += `#${code.toString(16).padStart(2, '0')}`;
    else text += value[index];
  }
  return text;
}

function hex(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) text += bytes[index].toString(16).padStart(2, '0');
  return text;
}

function isDelim(byte: number): boolean {
  return (
    byte < 0 ||
    byte === 0x00 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20 ||
    byte === 0x28 ||
    byte === 0x29 ||
    byte === 0x3c ||
    byte === 0x3e ||
    byte === 0x5b ||
    byte === 0x5d ||
    byte === 0x7b ||
    byte === 0x7d ||
    byte === 0x2f ||
    byte === 0x25
  );
}

function wrongPassword(): never {
  const error = new Error('That password does not open this document.');
  error.name = 'PdfPasswordError';
  throw error;
}

function unsupported(version: number, revision: number): never {
  throw new Error(`This PDF uses a lock this device cannot open. V=${version} R=${revision}`);
}

function couldNot(reason: string): never {
  const error = new Error('Could not remove the password from this document.');
  error.cause = reason;
  throw error;
}
