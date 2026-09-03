export const MAX_CALLIGRAPHY_RENDER_PIXELS = 2560 * 1440;

export interface CalligraphyRenderSize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export function resolveCalligraphyRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxPixels = MAX_CALLIGRAPHY_RENDER_PIXELS,
): CalligraphyRenderSize {
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  const desiredPixelRatio = Math.min(
    2,
    Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1),
  );
  const budgetPixelRatio = Math.sqrt(
    maxPixels / (safeWidth * safeHeight),
  );
  const pixelRatio = Math.min(desiredPixelRatio, budgetPixelRatio);

  return {
    width: Math.max(1, Math.floor(safeWidth * pixelRatio)),
    height: Math.max(1, Math.floor(safeHeight * pixelRatio)),
    pixelRatio,
  };
}
