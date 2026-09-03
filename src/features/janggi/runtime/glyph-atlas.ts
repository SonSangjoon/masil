import type { Gpu, Texture } from "vgpu";

import type { JanggiPiece } from "@/features/janggi/model/game";

const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 4;
const CELL_SIZE = 128;
const FONT_FAMILY =
  'STKaiti, KaiTi, "Kaiti SC", AppleMyungjo, "Noto Serif CJK KR", "Noto Serif KR", serif';

function glyphFontSize(piece: JanggiPiece) {
  if (piece.kind === "king") return 92;
  if (piece.kind === "soldier" || piece.kind === "sa") return 82;
  return 88;
}

/**
 * Rasterize each fixed Janggi glyph once, then let the vGPU piece shader sample
 * it on the physical top face. The DOM never positions or animates the labels.
 */
export async function createJanggiGlyphAtlas(
  gpu: Gpu,
  pieces: readonly JanggiPiece[],
): Promise<Texture> {
  await document.fonts.ready;

  const atlas = document.createElement("canvas");
  atlas.width = ATLAS_COLUMNS * CELL_SIZE;
  atlas.height = ATLAS_ROWS * CELL_SIZE;
  const context = atlas.getContext("2d");
  if (!context) throw new Error("Could not create the Janggi glyph atlas");

  context.clearRect(0, 0, atlas.width, atlas.height);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  for (const piece of pieces) {
    const column = piece.index % ATLAS_COLUMNS;
    const row = Math.floor(piece.index / ATLAS_COLUMNS);
    const centerX = column * CELL_SIZE + CELL_SIZE * 0.5;
    const centerY = row * CELL_SIZE + CELL_SIZE * 0.5;
    context.font = `800 ${glyphFontSize(piece)}px ${FONT_FAMILY}`;
    const metrics = context.measureText(piece.label);
    const baselineY =
      centerY +
      ((metrics.actualBoundingBoxAscent || glyphFontSize(piece) * 0.76) -
        (metrics.actualBoundingBoxDescent || glyphFontSize(piece) * 0.12)) /
        2;
    context.fillText(piece.label, centerX, baselineY);
  }

  const atlasPixels = context.getImageData(
    0,
    0,
    atlas.width,
    atlas.height,
  ).data;

  const texture = gpu.device.createTexture({
    size: [atlas.width, atlas.height],
    format: "rgba8unorm",
    usage: ["copy_dst", "texture_binding"],
    label: "masil-janggi-glyph-atlas",
  });
  // writeTexture is used instead of copyExternalImageToTexture so the atlas is
  // identical in Chrome extension sessions and the Codex in-app browser.
  gpu.gpu.queue.writeTexture(
    { texture: texture.gpu },
    atlasPixels,
    { bytesPerRow: atlas.width * 4, rowsPerImage: atlas.height },
    { width: atlas.width, height: atlas.height, depthOrArrayLayers: 1 },
  );
  return texture;
}
