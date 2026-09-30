import { exceedsFileLimit } from './bytes';

const TOO_LARGE = 'That file is over 12 MB. Choose a smaller one.';

export async function readLocalUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected file could not be read.');
  const declared = Number(response.headers.get('content-length'));
  if (exceedsFileLimit(declared)) throw new Error(TOO_LARGE);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (exceedsFileLimit(bytes.byteLength)) throw new Error(TOO_LARGE);
  return bytes;
}
