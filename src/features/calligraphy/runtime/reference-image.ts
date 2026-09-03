const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const SAMPLE_EDGE = 320;
const TARGET_ASPECT_RATIO = 3 / 2;
const ASPECT_RATIO_TOLERANCE = 0.015;
const MIN_REFERENCE_WIDTH = 1200;
const MIN_REFERENCE_HEIGHT = 800;
const MIN_TRANSPARENT_RATIO = 0.12;
const MIN_EDGE_TRANSPARENT_RATIO = 0.8;
const MIN_DARK_VISIBLE_RATIO = 0.72;
const MIN_FOREGROUND_RATIO = 0.001;
const MAX_FOREGROUND_RATIO = 0.65;
const MIN_INK_HEIGHT_RATIO = 0.46;
const MAX_INK_HEIGHT_RATIO = 0.84;
const MAX_INK_WIDTH_RATIO = 0.88;

const MIN_INK_WIDTH_RATIO_BY_CHARACTER_COUNT = {
  1: 0.24,
  2: 0.42,
  3: 0.58,
  4: 0.68,
} as const;

export const CALLIGRAPHY_REFERENCE_SPEC = {
  formats: ["image/png", "image/webp"],
  canvas: {
    aspectRatio: "3:2",
    recommendedWidth: 1536,
    recommendedHeight: 1024,
    minimumWidth: MIN_REFERENCE_WIDTH,
    minimumHeight: MIN_REFERENCE_HEIGHT,
  },
  background:
    "Real transparent alpha (RGBA alpha=0), never white paper or baked checkerboard pixels.",
  ink: "Black brush-calligraphy only; no seal, signature, decoration, translation, or extra text.",
  composition: {
    outerSafeMargin: "At least 8% on every edge.",
    inkHeight: "46-84% of canvas height.",
    minimumInkWidthByCharacterCount: MIN_INK_WIDTH_RATIO_BY_CHARACTER_COUNT,
    maximumInkWidth: "88% of canvas width.",
    layout: "Keep the complete 1-4 character phrase on one horizontal canvas.",
  },
  transport:
    "PNG/WebP data URL, same-origin URL, or CORS-readable HTTPS URL available to the MASIL page.",
} as const;

export type CalligraphyReferenceValidation = {
  mimeType: "image/png" | "image/webp";
  width: number;
  height: number;
  aspectRatio: number;
  transparentRatio: number;
  edgeTransparentRatio: number;
  darkVisibleRatio: number;
  foregroundRatio: number;
  inkBounds: {
    widthRatio: number;
    heightRatio: number;
  };
  trueAlpha: true;
};

function roundedRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function assertReferenceUrl(referenceImageUrl: string) {
  const parsed = new URL(referenceImageUrl, window.location.href);
  const dataImage = /^data:image\/(png|webp);base64,/i.test(referenceImageUrl);
  const unsupportedDataImage = /^data:image\//i.test(referenceImageUrl) && !dataImage;
  if (unsupportedDataImage) {
    throw new Error("REFERENCE_IMAGE_FORMAT_REQUIRES_PNG_OR_WEBP");
  }
  const sameOrigin = parsed.origin === window.location.origin;
  if (!dataImage && !sameOrigin && parsed.protocol !== "https:") {
    throw new Error("REFERENCE_IMAGE_MUST_BE_SAFE_URL");
  }
  return { dataImage, sameOrigin };
}

export async function validateCalligraphyReferenceImage(
  referenceImageUrl: string,
  characterCount: number,
): Promise<CalligraphyReferenceValidation> {
  const { sameOrigin } = assertReferenceUrl(referenceImageUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);

  try {
    let response: Response;
    try {
      response = await fetch(referenceImageUrl, {
        credentials: sameOrigin ? "same-origin" : "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch {
      throw new Error("REFERENCE_IMAGE_FETCH_FAILED");
    }
    if (!response.ok) throw new Error("REFERENCE_IMAGE_FETCH_FAILED");

    const blob = await response.blob();
    if (blob.size > MAX_REFERENCE_BYTES) {
      throw new Error("REFERENCE_IMAGE_TOO_LARGE");
    }
    const mimeType = blob.type.split(";", 1)[0]?.toLowerCase();
    if (mimeType !== "image/png" && mimeType !== "image/webp") {
      throw new Error("REFERENCE_IMAGE_FORMAT_REQUIRES_PNG_OR_WEBP");
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      throw new Error("REFERENCE_IMAGE_DECODE_FAILED");
    }

    try {
      if (
        bitmap.width < MIN_REFERENCE_WIDTH ||
        bitmap.height < MIN_REFERENCE_HEIGHT
      ) {
        throw new Error(
          `REFERENCE_IMAGE_TOO_SMALL:use_${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedWidth}x${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedHeight}`,
        );
      }
      const aspectRatio = bitmap.width / bitmap.height;
      if (Math.abs(aspectRatio - TARGET_ASPECT_RATIO) > ASPECT_RATIO_TOLERANCE) {
        throw new Error(
          `REFERENCE_IMAGE_REQUIRES_3_BY_2:use_${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedWidth}x${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedHeight}`,
        );
      }
      const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("REFERENCE_IMAGE_INSPECTION_UNAVAILABLE");
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      let pixels: Uint8ClampedArray;
      try {
        pixels = context.getImageData(0, 0, width, height).data;
      } catch {
        throw new Error("REFERENCE_IMAGE_INSPECTION_UNAVAILABLE");
      }

      const total = width * height;
      const edgeBand = Math.max(1, Math.ceil(Math.min(width, height) * 0.06));
      let transparent = 0;
      let edgePixels = 0;
      let transparentEdge = 0;
      let visible = 0;
      let darkVisible = 0;
      let minInkX = width;
      let minInkY = height;
      let maxInkX = -1;
      let maxInkY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const alpha = pixels[offset + 3] ?? 0;
          const isTransparent = alpha <= 16;
          const isEdge =
            x < edgeBand ||
            x >= width - edgeBand ||
            y < edgeBand ||
            y >= height - edgeBand;

          if (isTransparent) transparent += 1;
          if (isEdge) {
            edgePixels += 1;
            if (isTransparent) transparentEdge += 1;
          }
          if (alpha > 32) {
            visible += 1;
            minInkX = Math.min(minInkX, x);
            minInkY = Math.min(minInkY, y);
            maxInkX = Math.max(maxInkX, x);
            maxInkY = Math.max(maxInkY, y);
            const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
            if (luminance <= 112) darkVisible += 1;
          }
        }
      }

      const transparentRatio = transparent / total;
      const edgeTransparentRatio = transparentEdge / Math.max(edgePixels, 1);
      const foregroundRatio = visible / total;
      const darkVisibleRatio = darkVisible / Math.max(visible, 1);
      const inkWidthRatio =
        maxInkX >= minInkX ? (maxInkX - minInkX + 1) / width : 0;
      const inkHeightRatio =
        maxInkY >= minInkY ? (maxInkY - minInkY + 1) / height : 0;
      const normalizedCharacterCount = Math.min(
        4,
        Math.max(1, Math.round(characterCount)),
      ) as 1 | 2 | 3 | 4;
      const minimumInkWidth =
        MIN_INK_WIDTH_RATIO_BY_CHARACTER_COUNT[normalizedCharacterCount];

      if (transparentRatio < MIN_TRANSPARENT_RATIO) {
        throw new Error("REFERENCE_IMAGE_REQUIRES_TRUE_ALPHA");
      }
      if (edgeTransparentRatio < MIN_EDGE_TRANSPARENT_RATIO) {
        throw new Error("REFERENCE_IMAGE_NEEDS_TRANSPARENT_MARGIN");
      }
      if (
        foregroundRatio < MIN_FOREGROUND_RATIO ||
        foregroundRatio > MAX_FOREGROUND_RATIO
      ) {
        throw new Error("REFERENCE_IMAGE_FOREGROUND_INVALID");
      }
      if (darkVisibleRatio < MIN_DARK_VISIBLE_RATIO) {
        throw new Error("REFERENCE_IMAGE_NEEDS_BLACK_INK_ONLY");
      }
      if (
        inkWidthRatio < minimumInkWidth ||
        inkHeightRatio < MIN_INK_HEIGHT_RATIO
      ) {
        throw new Error(
          `REFERENCE_IMAGE_INK_TOO_SMALL:fill_the_${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedWidth}x${CALLIGRAPHY_REFERENCE_SPEC.canvas.recommendedHeight}_canvas`,
        );
      }
      if (
        inkWidthRatio > MAX_INK_WIDTH_RATIO ||
        inkHeightRatio > MAX_INK_HEIGHT_RATIO
      ) {
        throw new Error("REFERENCE_IMAGE_NEEDS_SAFE_MARGIN");
      }

      return {
        mimeType,
        width: bitmap.width,
        height: bitmap.height,
        aspectRatio: roundedRatio(aspectRatio),
        transparentRatio: roundedRatio(transparentRatio),
        edgeTransparentRatio: roundedRatio(edgeTransparentRatio),
        darkVisibleRatio: roundedRatio(darkVisibleRatio),
        foregroundRatio: roundedRatio(foregroundRatio),
        inkBounds: {
          widthRatio: roundedRatio(inkWidthRatio),
          heightRatio: roundedRatio(inkHeightRatio),
        },
        trueAlpha: true,
      };
    } finally {
      bitmap.close();
    }
  } finally {
    window.clearTimeout(timeout);
  }
}
