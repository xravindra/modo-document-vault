import { Directory, File, Paths } from 'expo-file-system';

export type OcrKind = 'image' | 'pdf';

export type OcrJob = {
  id: number;
  kind: OcrKind;
  mime: string;
  base64: string;
};

type OcrResult = { text: string; note: string };

type Pending = OcrJob & { resolve: (result: OcrResult) => void };

const SUCCESS =
  'Text was recognized on this device in English and Marathi. Those language packs are downloaded once by the recognition engine. The file itself is not uploaded.';
const FAILED =
  'Text recognition could not start. The file is still stored. Try again when this phone can download the English and Marathi recognition packs.';
const EMPTY = 'No readable text was found.';

const WAIT_MS = 360_000;

let sequence = 0;
let booted = false;
let current: Pending | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const queue: Pending[] = [];
let starter: ((job: OcrJob) => void) | null = null;
let resetter: (() => void) | null = null;

function resultFor(ok: boolean, text: string): OcrResult {
  if (!ok) return { text: '', note: FAILED };
  if (!text.trim()) return { text: '', note: EMPTY };
  return { text, note: SUCCESS };
}

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function pump(): void {
  if (current || !booted || !starter || queue.length === 0) return;
  const job = queue.shift();
  if (!job) return;
  current = job;
  timer = setTimeout(() => {
    if (current?.id !== job.id) return;
    current = null;
    clearTimer();
    booted = false;
    job.resolve(resultFor(false, ''));
    resetter?.();
  }, WAIT_MS);
  starter(job);
}

export function attachOcrRunner(start: (job: OcrJob) => void, reset: () => void): () => void {
  starter = start;
  resetter = reset;
  pump();
  return () => {
    if (starter === start) starter = null;
    if (resetter === reset) resetter = null;
  };
}

export function markOcrReady(): void {
  booted = true;
  pump();
}

export function pauseOcr(): void {
  booted = false;
}

export function completeOcr(id: number, ok: boolean, text: string): void {
  if (!current || current.id !== id) return;
  const job = current;
  current = null;
  clearTimer();
  job.resolve(resultFor(ok, text));
  if (!ok) {
    booted = false;
    resetter?.();
    return;
  }
  pump();
}

export function ocrIsCurrent(id: number): boolean {
  return current?.id === id;
}

async function encodeBase64(bytes: Uint8Array): Promise<string> {
  const dir = new Directory(Paths.cache, 'modo-ocr');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `src-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.bin`);
  file.create();
  file.write(bytes);
  try {
    return (await file.base64()).replace(/\s/g, '');
  } finally {
    if (file.exists) file.delete();
  }
}

export async function recognizeBytes(kind: OcrKind, bytes: Uint8Array, mime: string): Promise<OcrResult> {
  const base64 = await encodeBase64(bytes);
  return new Promise((resolve) => {
    sequence += 1;
    queue.push({ id: sequence, kind, mime, base64, resolve });
    pump();
  });
}
