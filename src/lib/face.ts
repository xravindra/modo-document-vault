const A4 = 297 / 210;

/** One height for every document on this screen, sized for a phone. */
export function documentFace(screenHeight: number): number {
  const height = Number.isFinite(screenHeight) && screenHeight > 0 ? screenHeight : 800;
  return Math.round(Math.min(340, Math.max(240, height * 0.38)));
}

/** Height stays the shared face. Width follows the page, height divided by width. */
export function frameSize(
  screenHeight: number,
  heightOverWidth: number,
  faceHeight?: number,
  maxWidth?: number,
): { width: number; height: number } {
  let height = faceHeight && faceHeight > 0 ? faceHeight : documentFace(screenHeight);
  const ratio = heightOverWidth > 0.2 && heightOverWidth < 6 ? heightOverWidth : A4;
  let width = Math.max(48, Math.round(height / ratio));
  if (maxWidth && width > maxWidth) {
    width = maxWidth;
    height = Math.max(48, Math.round(width * ratio));
  }
  return { height, width };
}
