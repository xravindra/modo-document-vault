export async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Copy is not available in this browser.');
  }
  await navigator.clipboard.writeText(value);
}
