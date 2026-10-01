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

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (nodeOnly.has(moduleName)) return { type: 'empty' };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
