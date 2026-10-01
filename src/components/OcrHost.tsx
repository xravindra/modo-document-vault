import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  attachOcrRunner,
  completeOcr,
  markOcrReady,
  ocrIsCurrent,
  pauseOcr,
  type OcrJob,
} from '@/lib/ocrBridge';
import { loadPdfViewer } from '@/lib/pdfPage';

const CHUNK = 24_000;
const READY_MS = 45_000;

const BRIDGE = `
var jobId = 0;
var chunks = [];
function post(payload) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
}
var boots = setInterval(function () { post({ booted: true }); }, 400);
window.startJob = function (id) {
  clearInterval(boots);
  jobId = id;
  chunks = [];
  if (window.__tessFailed || typeof Tesseract === 'undefined') {
    post({ id: id, ok: false, text: '' });
    return;
  }
  post({ id: id, ready: true });
};
window.pushChunk = function (part) { chunks.push(part); };
function bytesFromChunks() {
  var binary = atob(chunks.join(''));
  chunks = [];
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
window.finishImage = function (mime) {
  var id = jobId;
  try {
    var bytes = bytesFromChunks();
    var blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    Tesseract.createWorker('eng+mar', 1, { logger: function () {} })
      .then(function (worker) {
        return worker.recognize(blob).then(function (result) {
          var text = (result && result.data && result.data.text) || '';
          return worker.terminate().then(function () { return text; });
        });
      })
      .then(function (text) { post({ id: id, ok: true, text: text || '' }); })
      .catch(function () { post({ id: id, ok: false, text: '' }); });
  } catch (error) {
    post({ id: id, ok: false, text: '' });
  }
};
function renderPage(pdf, index) {
  return pdf.getPage(index).then(function (page) {
    var canvas = document.createElement('canvas');
    var base = page.getViewport({ scale: 1 });
    var scale = Math.min(2, 1400 / Math.max(1, base.width));
    var viewport = page.getViewport({ scale: scale });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
      return canvas;
    });
  });
}
window.finishPdf = function () {
  var id = jobId;
  if (typeof pdfjsLib === 'undefined') {
    post({ id: id, ok: false, text: '' });
    return;
  }
  try {
    var bytes = bytesFromChunks();
    pdfjsLib.getDocument({ data: bytes, disableRange: true, disableStream: true, useSystemFonts: true, isEvalSupported: true }).promise
      .then(function (pdf) {
        var last = Math.min(pdf.numPages || 1, 8);
        var page = 1;
        var parts = [];
        var worker;
        function next() {
          if (page > last) return worker.terminate().then(function () { return parts.join('\\n'); });
          var index = page;
          page += 1;
          return renderPage(pdf, index).then(function (canvas) {
            return worker.recognize(canvas).then(function (result) {
              parts.push((result && result.data && result.data.text) || '');
              canvas.width = 0;
              canvas.height = 0;
              return next();
            });
          });
        }
        return Tesseract.createWorker('eng+mar', 1, { logger: function () {} }).then(function (created) {
          worker = created;
          return next();
        });
      })
      .then(function (text) { post({ id: id, ok: true, text: text || '' }); })
      .catch(function () { post({ id: id, ok: false, text: '' }); });
  } catch (error) {
    post({ id: id, ok: false, text: '' });
  }
};
post({ booted: true });
`;

function shell(worker: string, main: string): string {
  const pdf = worker && main ? '<script>' + worker + '</script><script>' + main + '</script>' : '';
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>' +
    pdf +
    '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js" onerror="window.__tessFailed=true"></script><script>' +
    BRIDGE +
    '</script></body></html>'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function OcrHost() {
  const ref = useRef<WebView>(null);
  const pending = useRef<OcrJob | null>(null);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);
  const [html, setHtml] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      let worker = '';
      let main = '';
      try {
        const viewer = await loadPdfViewer();
        worker = viewer.worker;
        main = viewer.main;
      } catch {
        worker = '';
        main = '';
      }
      if (live) setHtml(shell(worker, main));
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    return attachOcrRunner(
      (job) => {
        const view = ref.current;
        if (!view) {
          completeOcr(job.id, false, '');
          return;
        }
        pending.current = job;
        if (readyTimer.current) clearTimeout(readyTimer.current);
        view.injectJavaScript(`window.startJob(${job.id});true;`);
        readyTimer.current = setTimeout(() => {
          if (ocrIsCurrent(job.id)) completeOcr(job.id, false, '');
        }, READY_MS);
      },
      () => {
        pauseOcr();
        setGeneration((value) => value + 1);
      },
    );
  }, []);

  async function sendChunks(job: OcrJob) {
    if (sending.current) return;
    sending.current = true;
    if (readyTimer.current) clearTimeout(readyTimer.current);
    readyTimer.current = null;
    const view = ref.current;
    try {
      if (!view) {
        completeOcr(job.id, false, '');
        return;
      }
      for (let index = 0; index < job.base64.length; index += CHUNK) {
        if (!ocrIsCurrent(job.id)) return;
        view.injectJavaScript(`window.pushChunk(${JSON.stringify(job.base64.slice(index, index + CHUNK))});true;`);
        await delay(8);
      }
      if (!ocrIsCurrent(job.id) || !ref.current) return;
      if (job.kind === 'pdf') ref.current.injectJavaScript('window.finishPdf();true;');
      else ref.current.injectJavaScript(`window.finishImage(${JSON.stringify(job.mime)});true;`);
    } finally {
      sending.current = false;
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    let data: { booted?: boolean; ready?: boolean; id?: number; ok?: boolean; text?: string };
    try {
      data = JSON.parse(event.nativeEvent.data) as typeof data;
    } catch {
      return;
    }
    if (data.booted) {
      markOcrReady();
      ref.current?.injectJavaScript('clearInterval(boots);true;');
      return;
    }
    if (data.ready && typeof data.id === 'number') {
      const job = pending.current;
      if (job && job.id === data.id) void sendChunks(job);
      return;
    }
    if (typeof data.id === 'number' && typeof data.ok === 'boolean') completeOcr(data.id, data.ok, data.text ?? '');
  }

  function failCurrent() {
    const job = pending.current;
    if (job && ocrIsCurrent(job.id)) completeOcr(job.id, false, '');
  }

  if (!html) return null;

  return (
    <View collapsable={false} pointerEvents="none" style={styles.host}>
      <WebView
        key={generation}
        ref={ref}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        cacheEnabled
        domStorageEnabled
        javaScriptEnabled
        mixedContentMode="always"
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net/' }}
        androidLayerType="hardware"
        style={styles.web}
        onContentProcessDidTerminate={failCurrent}
        onError={failCurrent}
        onMessage={onMessage}
        onRenderProcessGone={() => {
          const job = pending.current;
          if (job && ocrIsCurrent(job.id)) completeOcr(job.id, false, '');
          else {
            pauseOcr();
            setGeneration((value) => value + 1);
          }
          return true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, top: 0, width: 1, height: 0, overflow: 'hidden' },
  web: { width: 320, height: 320, opacity: 0.99, backgroundColor: 'transparent' },
});
