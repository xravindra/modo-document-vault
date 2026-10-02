import { Asset } from 'expo-asset';

const workerModule = require('../../assets/pdfjs/pdf.worker.min.pdfjs') as number;
const mainModule = require('../../assets/pdfjs/pdf.min.pdfjs') as number;

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
};

export type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: ArrayBuffer; disableRange: boolean; disableStream: boolean }) => {
    promise: Promise<{ getPage: (page: number) => Promise<PdfPage> }>;
  };
};

let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (loading) return loading;
  loading = (async () => {
    const main = Asset.fromModule(mainModule);
    const worker = Asset.fromModule(workerModule);
    await Promise.all([main.downloadAsync(), worker.downloadAsync()]);
    const [mainCode, workerCode] = await Promise.all([
      fetch(main.uri).then((response) => response.text()),
      fetch(worker.uri).then((response) => response.text()),
    ]);
    const script = document.createElement('script');
    script.text = mainCode;
    document.head.appendChild(script);
    const pdfjs = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
    if (!pdfjs) throw new Error('Could not show this PDF.');
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    return pdfjs;
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
