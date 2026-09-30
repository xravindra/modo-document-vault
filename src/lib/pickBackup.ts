import * as DocumentPicker from 'expo-document-picker';

import { readSource } from './readSource';

export async function pickBackupBytes(): Promise<Uint8Array | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
    type: ['application/json', 'text/json', 'application/octet-stream', '*/*'],
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  return readSource({
    uri: asset.uri,
    base64: asset.base64,
    file: 'file' in asset ? (asset.file as { arrayBuffer(): Promise<ArrayBuffer> } | undefined) : undefined,
  });
}
