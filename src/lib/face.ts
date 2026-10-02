const A4 = 297 / 210;

/** One height for every document on this screen, sized for a phone. */
export function documentFace(screenHeight: number): number {
  const height = Number.isFinite(screenHeight) && screenHeight > 0 ? screenHeight : 800;
  return Math.round(Math.min(340, Math.max(240, height * 0.38)));
}

/** Height stays the shared face. Width follows the page, height divided by width. */
export function frameSize(screenHeight: number, heightOverWidth: number): { width: number; height: number } {
  const height = documentFace(screenHeight);
  const ratio = heightOverWidth > 0.2 && heightOverWidth < 6 ? heightOverWidth : A4;
  return { height, width: Math.max(72, Math.round(height / ratio)) };
}
