export async function recognizeScan(_bytes: Uint8Array): Promise<{ text: string; note: string }> {
  return {
    text: '',
    note: 'This PDF has no readable text layer. A scan can be added as a photo in the web app for recognition.',
  };
}
