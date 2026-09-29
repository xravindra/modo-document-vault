export async function readLocalUri(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected file could not be read.');
  return new Uint8Array(await response.arrayBuffer());
}
