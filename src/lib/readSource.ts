import { base64ToBytes, exceedsFileLimit } from './bytes';
import { readLocalUri } from './readBytes';

const TOO_LARGE = 'That file is over 12 MB. Choose a smaller one.';

export async function readSource(asset: {
  uri?: string;
  base64?: string | null;
  file?: { arrayBuffer(): Promise<ArrayBuffer> } | null;
  size?: number | null;
}): Promise<Uint8Array> {
  if (exceedsFileLimit(asset.size)) throw new Error(TOO_LARGE);
  let bytes: Uint8Array;
  if (asset.file) bytes = new Uint8Array(await asset.file.arrayBuffer());
  else if (asset.base64) bytes = base64ToBytes(asset.base64);
  else if (asset.uri) return readLocalUri(asset.uri);
  else throw new Error('The selected file could not be read.');
  if (exceedsFileLimit(bytes.byteLength)) throw new Error(TOO_LARGE);
  return bytes;
}
