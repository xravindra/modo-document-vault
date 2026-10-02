import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { loadPdfViewer } from '@/lib/pdfPage';
import {
  attachRasterRunner,
  completeRaster,
  markRasterReady,
  pauseRaster,
  rasterIsCurrent,
} from '@/lib/rasterBridge';

const CHUNK = 24_000;

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
  post({ id: id, ready: true });
};
window.pushChunk = function (part) { chunks.push(part); };
window.finishRaster = function () {
  var id = jobId;
  if (typeof pdfjsLib === 'undefined') {
    post({ id: id, ok: false, jpeg: '' });
    return;
  }
  try {
    var binary = atob(chunks.join(''));
    chunks = [];
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    pdfjsLib.getDocument({ data: bytes, disableRange: true, disableStream: true, isEvalSupported: true }).promise
      .then(function (pdf) { return pdf.getPage(1); })
      .then(function (page) {
        var canvas = document.createElement('canvas');
        var base = page.getViewport({ scale: 1 });
        var scale = Math.min(2, 1400 / Math.max(1, base.width, base.height));
        var viewport = page.getViewport({ scale: scale });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
          return canvas.toDataURL('image/jpeg', 0.86);
        });
      })
      .then(function (jpeg) { post({ id: id, ok: true, jpeg: jpeg }); })
      .catch(function () { post({ id: id, ok: false, jpeg: '' }); });
  } catch (error) {
    post({ id: id, ok: false, jpeg: '' });
  }
};
post({ booted: true });
`;

function shell(worker: string, main: string): string {
  const pdf = worker && main ? '<script>' + worker + '</script><script>' + main + '</script>' : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>' + pdf + '<script>' + BRIDGE + '</script></body></html>';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function RasterHost() {
  const ref = useRef<WebView>(null);
  const pending = useRef<string>('');
  const pendingId = useRef(0);
  const sending = useRef(false);
  const [html, setHtml] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const viewer = await loadPdfViewer();
        if (live) setHtml(shell(viewer.worker, viewer.main));
      } catch {
        if (live) setHtml(shell('', ''));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    return attachRasterRunner(
      (job) => {
        const view = ref.current;
        if (!view) {
          completeRaster(job.id, false, '');
          return;
        }
        pending.current = job.base64;
        pendingId.current = job.id;
        view.injectJavaScript(`window.startJob(${job.id});true;`);
      },
      () => {
        pauseRaster();
        setGeneration((value) => value + 1);
      },
    );
  }, []);

  async function sendChunks(id: number, base64: string) {
    if (sending.current) return;
    sending.current = true;
    const view = ref.current;
    try {
      if (!view) {
        completeRaster(id, false, '');
        return;
      }
      for (let index = 0; index < base64.length; index += CHUNK) {
        if (!rasterIsCurrent(id)) return;
        view.injectJavaScript(`window.pushChunk(${JSON.stringify(base64.slice(index, index + CHUNK))});true;`);
        await delay(8);
      }
      if (!rasterIsCurrent(id) || !ref.current) return;
      ref.current.injectJavaScript('window.finishRaster();true;');
    } finally {
      sending.current = false;
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    let data: { booted?: boolean; ready?: boolean; id?: number; ok?: boolean; jpeg?: string };
    try {
      data = JSON.parse(event.nativeEvent.data) as typeof data;
    } catch {
      return;
    }
    if (data.booted) {
      markRasterReady();
      ref.current?.injectJavaScript('clearInterval(boots);true;');
      return;
    }
    if (data.ready && data.id === pendingId.current) {
      void sendChunks(pendingId.current, pending.current);
      return;
    }
    if (typeof data.id === 'number' && typeof data.ok === 'boolean') completeRaster(data.id, data.ok, data.jpeg ?? '');
  }

  if (!html) return null;

  return (
    <View collapsable={false} pointerEvents="none" style={styles.host}>
      <WebView
        key={generation}
        ref={ref}
        allowFileAccess
        cacheEnabled
        domStorageEnabled
        javaScriptEnabled
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://modo.local' }}
        style={styles.web}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, top: 0, width: 1, height: 0, overflow: 'hidden' },
  web: { width: 320, height: 320, opacity: 0.99, backgroundColor: 'transparent' },
});
