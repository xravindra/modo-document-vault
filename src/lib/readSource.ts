import { base64ToBytes } from './bytes';
import { readLocalUri } from './readBytes';

export async function readSource(asset: {
  uri?: string;
  base64?: string | null;
  file?: { arrayBuffer(): Promise<ArrayBuffer> } | null;
}): Promise<Uint8Array> {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  if (asset.base64) return base64ToBytes(asset.base64);
  if (asset.uri) return readLocalUri(asset.uri);
  throw new Error('The selected file could not be read.');
}
