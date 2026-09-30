type Toolkit = {
  unlock: (pdf: Uint8Array, options: { password: string }) => Promise<Uint8Array>;
  lock: (pdf: Uint8Array, options: { userPassword: string }) => Promise<Uint8Array>;
};

let toolkitPromise: Promise<Toolkit> | null = null;

export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const pdf = await toolkit();
  return pdf.unlock(bytes, { password });
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
  const { createPdfToolkit } = await import('pdfstudio');
  return createPdfToolkit({ wasmUrl: '/qpdf.wasm' });
}
