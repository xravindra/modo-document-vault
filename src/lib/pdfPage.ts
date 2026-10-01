import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

const VIEWER = '3.11.174';

const workerAsset = require('../../assets/pdfjs/pdf.worker.min.pdfjs') as number;
const mainAsset = require('../../assets/pdfjs/pdf.min.pdfjs') as number;

const fonts: Record<string, number> = {
  'LiberationSans-Regular.ttf': require('../../assets/pdfjs/fonts/LiberationSans-Regular.ttf') as number,
  'LiberationSans-Bold.ttf': require('../../assets/pdfjs/fonts/LiberationSans-Bold.ttf') as number,
  'LiberationSans-Italic.ttf': require('../../assets/pdfjs/fonts/LiberationSans-Italic.ttf') as number,
  'LiberationSans-BoldItalic.ttf': require('../../assets/pdfjs/fonts/LiberationSans-BoldItalic.ttf') as number,
};

type Viewer = { fontUrl: string; worker: string; main: string };

let ready: Promise<Viewer> | null = null;

function viewerRoot(): Directory {
  return new Directory(Paths.cache, 'modo-pdfjs');
}

async function readAsset(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('Could not load the PDF viewer.');
  return new File(uri).text();
}

async function copyAsset(moduleId: number, destination: File): Promise<void> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('Could not load the PDF viewer.');
  if (destination.exists) destination.delete();
  new File(uri).copySync(destination);
}

function replaceText(file: File, contents: string): void {
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
}

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function scriptBody(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script');
}

async function prepareViewer(): Promise<Viewer> {
  const root = viewerRoot();
  root.create({ intermediates: true, idempotent: true });
  const fontsDir = new Directory(root, 'standard_fonts');
  fontsDir.create({ intermediates: true, idempotent: true });
  const marker = new File(root, `fonts-${VIEWER}`);
  const fontsReady = Object.keys(fonts).every((name) => {
    const file = new File(fontsDir, name);
    return file.exists && file.size > 0;
  });
  if (!marker.exists || !fontsReady) {
    for (const [name, moduleId] of Object.entries(fonts)) {
      await copyAsset(moduleId, new File(fontsDir, name));
    }
    replaceText(marker, 'ok');
  }
  const [worker, main] = await Promise.all([readAsset(workerAsset), readAsset(mainAsset)]);
  return { fontUrl: withSlash(fontsDir.uri), worker: scriptBody(worker), main: scriptBody(main) };
}

export function loadPdfViewer(): Promise<Viewer> {
  if (!ready) {
    ready = prepareViewer().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

function pageScript(base64: string, fontUrl: string): string {
  return `var b64=${JSON.stringify(base64)};var fontUrl=${JSON.stringify(fontUrl)};
function fail(){document.title='failed';document.body.innerHTML='<p style="font:16px sans-serif;color:#101614;padding:16px;margin:0">Could not show this PDF.</p>';}
function paint(){
  var width=window.innerWidth,height=window.innerHeight;
  if(width<2||height<2){requestAnimationFrame(paint);return;}
  if(window.__modoPdf)return;
  window.__modoPdf=true;
  if(typeof pdfjsLib==='undefined'){fail();return;}
  try{
    var binary=atob(b64);
    var bytes=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    pdfjsLib.getDocument({data:bytes,disableRange:true,disableStream:true,useSystemFonts:true,standardFontDataUrl:fontUrl,isEvalSupported:true}).promise
      .then(function(pdf){return pdf.getPage(1);})
      .then(function(page){
        var canvas=document.getElementById('page');
        var base=page.getViewport({scale:1});
        var pixelRatio=Math.min(window.devicePixelRatio||1,2);
        var scale=(width/base.width)*pixelRatio;
        var viewport=page.getViewport({scale:scale});
        canvas.width=Math.max(1,Math.floor(viewport.width));
        canvas.height=Math.max(1,Math.floor(viewport.height));
        canvas.style.width='100%';
        canvas.style.height='auto';
        return page.render({canvasContext:canvas.getContext('2d'),viewport:viewport}).promise;
      })
      .then(function(){ document.title = 'shown'; })
      .catch(fail);
  }catch(e){fail();}
}
if(document.readyState==='complete')paint();else window.addEventListener('load',paint);`;
}

function buildHtml(viewer: Viewer, base64: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>' +
    '<style>html,body{margin:0;height:100%;background:#fff;overflow:hidden}canvas{display:block;width:100%;height:auto}</style>' +
    '</head><body><canvas id="page"></canvas><script>' +
    viewer.worker +
    '</script><script>' +
    viewer.main +
    '</script><script>' +
    pageScript(base64, viewer.fontUrl) +
    '</script></body></html>'
  );
}

export async function renderPdfPage(pdfUri: string): Promise<File> {
  const viewer = await loadPdfViewer();
  const encoded = (await new File(pdfUri).base64()).replace(/\s/g, '');
  const page = new File(viewerRoot(), `page-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.html`);
  page.create();
  page.write(buildHtml(viewer, encoded));
  return page;
}
