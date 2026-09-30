import { File } from 'expo-file-system';

import { exceedsFileLimit } from './bytes';

const TOO_LARGE = 'That file is over 12 MB. Choose a smaller one.';

export async function readLocalUri(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  if (exceedsFileLimit(file.size)) throw new Error(TOO_LARGE);
  const bytes = new Uint8Array(await file.bytes());
  if (exceedsFileLimit(bytes.byteLength)) throw new Error(TOO_LARGE);
  return bytes;
}
