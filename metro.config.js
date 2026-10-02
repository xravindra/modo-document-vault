const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

for (const extension of ['wasm', 'pdfjs']) {
  if (!config.resolver.assetExts.includes(extension)) {
    config.resolver.assetExts.push(extension);
  }
}

const nodeOnly = new Set([
  'node:module',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:url',
  'node:crypto',
]);

const tslibEs = require.resolve('tslib/tslib.es6.js');
const pdfLibEsm = require.resolve('pdf-lib/dist/pdf-lib.esm.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (nodeOnly.has(moduleName)) return { type: 'empty' };
  // The package entry loads tslib's import build, which reads tslib.default.__extends.
  // The ESM bundle already contains those helpers.
  if (moduleName === 'pdf-lib' || moduleName === 'pdf-lib/dist/pdf-lib.esm.js') {
    return { type: 'sourceFile', filePath: pdfLibEsm };
  }
  if (moduleName === 'tslib') return { type: 'sourceFile', filePath: tslibEs };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
