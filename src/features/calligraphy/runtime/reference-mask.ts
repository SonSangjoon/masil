const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1024;

export type CalligraphyReferenceMask = {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
};

function fallbackFontSize(characterCount: number) {
  if (characterCount <= 1) return REFERENCE_HEIGHT * 0.72;
  if (characterCount === 2) return REFERENCE_WIDTH * 0.34;
  if (characterCount === 3) return REFERENCE_WIDTH * 0.24;
  return REFERENCE_WIDTH * 0.18;
}

async function bitmapFromUrl(referenceImageUrl: string) {
  const parsed = new URL(referenceImageUrl, window.location.href);
  const response = await fetch(referenceImageUrl, {
    credentials:
      parsed.protocol !== "data:" && parsed.origin === window.location.origin
        ? "same-origin"
        : "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("The calligraphy reference could not load.");
  return createImageBitmap(await response.blob());
}

async function bitmapFromCharacter(character: string) {
  await document.fonts?.ready.catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = REFERENCE_WIDTH;
  canvas.height = REFERENCE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The calligraphy reference mask is unavailable.");

  const characters = Array.from(character);
  const fontSize = fallbackFontSize(characters.length);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `600 ${fontSize}px STKaiti, KaiTi, "Kaiti SC", "Noto Serif CJK KR", "Noto Serif KR", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fontKerning = "normal";
  context.letterSpacing = "-0.08em";
  context.fillText(character, canvas.width / 2, canvas.height / 2);
  return createImageBitmap(canvas);
}

export async function createCalligraphyReferenceMask(
  character: string,
  referenceImageUrl?: string,
): Promise<CalligraphyReferenceMask | undefined> {
  if (!character) return undefined;

  let bitmap: ImageBitmap;
  if (referenceImageUrl) {
    try {
      bitmap = await bitmapFromUrl(referenceImageUrl);
    } catch {
      bitmap = await bitmapFromCharacter(character);
    }
  } else {
    bitmap = await bitmapFromCharacter(character);
  }

  return { bitmap, width: bitmap.width, height: bitmap.height };
}
