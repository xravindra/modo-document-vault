export async function extractImageText(
  _bytes: Uint8Array,
  _mime: string,
): Promise<{ text: string; note: string }> {
  return {
    text: '',
    note: 'The photo is sealed on this device. Text recognition for photos runs in the web app, where the English and Marathi recognition packs can load.',
  };
}
