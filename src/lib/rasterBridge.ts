import { bytesToBase64 } from './bytes';

type Pending = {
  id: number;
  base64: string;
  resolve: (jpeg: string) => void;
  reject: (error: Error) => void;
};

const WAIT_MS = 45_000;
const FAILED = 'Could not turn this PDF into an image.';

let sequence = 0;
let booted = false;
let current: Pending | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const queue: Pending[] = [];
let starter: ((job: Pending) => void) | null = null;
let resetter: (() => void) | null = null;

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
    booted = false;
    job.reject(new Error(FAILED));
    resetter?.();
  }, WAIT_MS);
  starter(job);
}

export function attachRasterRunner(start: (job: Pending) => void, reset: () => void): () => void {
  starter = start;
  resetter = reset;
  pump();
  return () => {
    if (starter === start) starter = null;
    if (resetter === reset) resetter = null;
  };
}

export function markRasterReady(): void {
  booted = true;
  pump();
}

export function pauseRaster(): void {
  booted = false;
}

export function rasterIsCurrent(id: number): boolean {
  return current?.id === id;
}

export function completeRaster(id: number, ok: boolean, jpeg: string): void {
  if (!current || current.id !== id) return;
  const job = current;
  current = null;
  clearTimer();
  if (!ok || !jpeg) {
    booted = false;
    job.reject(new Error(FAILED));
    resetter?.();
    return;
  }
  job.resolve(jpeg);
  pump();
}

export function rasterizePdf(bytes: Uint8Array): Promise<string> {
  const base64 = bytesToBase64(bytes);
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    let settled = false;
    const job: Pending = {
      id,
      base64,
      resolve: (jpeg) => {
        if (settled) return;
        settled = true;
        clearTimeout(boot);
        resolve(jpeg);
      },
      reject: (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(boot);
        reject(error);
      },
    };
    const boot = setTimeout(() => {
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      if (current?.id === id) return;
      job.reject(new Error(FAILED));
    }, WAIT_MS);
    queue.push(job);
    pump();
  });
}
