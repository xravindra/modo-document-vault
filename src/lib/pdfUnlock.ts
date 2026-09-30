import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { openPdf } from './pdfOpen';

const DEVICE = 'This device cannot lock or unlock a PDF. Open the vault in a browser to do that.';

type Toolkit = {
  unlock: (pdf: Uint8Array, options: { password: string }) => Promise<Uint8Array>;
  lock: (pdf: Uint8Array, options: { userPassword: string }) => Promise<Uint8Array>;
};

let toolkitPromise: Promise<Toolkit> | null = null;

export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  return openPdf(bytes, password);
}

export async function lockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const pdf = await toolkit();
  return pdf.lock(bytes, { userPassword: password });
}

function toolkit(): Promise<Toolkit> {
  if (!toolkitPromise) {
    toolkitPromise = loadToolkit().catch((error: unknown) => {
      toolkitPromise = null;
      throw error;
    });
  }
  return toolkitPromise;
}

async function loadToolkit(): Promise<Toolkit> {
  const wasmApi = globalThis.WebAssembly;
  if (!wasmApi?.compile) throw new Error(DEVICE);
  const asset = Asset.fromModule(require('../../assets/qpdf.wasm') as number);
  if (!asset.downloaded) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error(DEVICE);
  const wasmBytes = await readWasm(uri);
  const copy = new ArrayBuffer(wasmBytes.byteLength);
  new Uint8Array(copy).set(wasmBytes);
  let wasmModule: WebAssembly.Module;
  try {
    wasmModule = await wasmApi.compile(copy);
  } catch {
    throw new Error(DEVICE);
  }
  const { createPdfToolkit } = await import('pdfstudio');
  return createPdfToolkit({ wasmModule });
}

async function readWasm(uri: string): Promise<Uint8Array> {
  try {
    const response = await fetch(uri);
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
  } catch {
    // A local file URI is read from disk below.
  }
  return new Uint8Array(await new File(uri).bytes());
}
