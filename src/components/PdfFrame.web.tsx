import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { createElement } from 'react';
import { View } from 'react-native';

const workerModule = require('../../assets/pdfjs/pdf.worker.min.pdfjs') as number;
const mainModule = require('../../assets/pdfjs/pdf.min.pdfjs') as number;

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: ArrayBuffer; disableRange: boolean; disableStream: boolean }) => {
    promise: Promise<{ getPage: (page: number) => Promise<PdfPage> }>;
  };
};

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
};

let loading: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
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

export function PdfFrame({ uri, ratio }: { uri: string; ratio: number; resetKey?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const height = width > 0 ? Math.max(1, Math.round(width * ratio)) : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 2) return undefined;
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const bytes = await fetch(uri).then((response) => response.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data: bytes, disableRange: true, disableStream: true }).promise;
        const page = await pdf.getPage(1);
        if (!live) return;
        const base = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (width / base.width) * pixelRatio;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not show this PDF.');
        await page.render({ canvasContext: context, viewport }).promise;
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [uri, width]);

  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={{
        alignSelf: 'stretch',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        height,
        margin: 0,
        padding: 0,
        borderWidth: 0,
        backgroundColor: '#ffffff',
      }}
    >
      {failed
        ? createElement('p', { style: { margin: 0, padding: 16, color: '#1c1915' } }, 'Could not show this PDF.')
        : createElement('canvas', {
            ref: (node: HTMLCanvasElement | null) => {
              canvasRef.current = node;
            },
            style: {
              display: 'block',
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 0,
              border: 'none',
            },
          })}
    </View>
  );
}
