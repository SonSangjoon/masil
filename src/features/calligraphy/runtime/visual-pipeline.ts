import {
  compute,
  effect,
  frame,
  sampler,
  type Buffer,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from "vgpu";

import {
  DETECTOR_INPUT_BYTES,
  DETECTOR_SIZE,
  LANDMARK_INPUT_BYTES,
  LANDMARK_POINTS_BUFFER_BYTES,
  LANDMARK_SIZE,
  MAX_HANDS,
} from "./hand-model-contract";
import type { HandRoi } from "./hand-pipeline";
import compositeWgsl from "./composite.wgsl";
import handWgsl from "./hand.wgsl";
import handCropWgsl from "./hand-crop.wgsl";
import paintWgsl from "./paint.wgsl";

export const MASK_WIDTH = 960;
export const MASK_HEIGHT = 540;
export const MASK_TEXELS = MASK_WIDTH * MASK_HEIGHT;
export const MASK_BYTES = MASK_TEXELS * 4;
// Keep this in lockstep with the 12-float BrushState shared by the WGSL stages.
export const BRUSH_BUFFER_BYTES = 48 * MAX_HANDS;
const ROI_SLOT_COUNT = MAX_HANDS + 1;
const ROI_STRIDE_FLOATS = 4;
export const ROI_BYTES = ROI_SLOT_COUNT * ROI_STRIDE_FLOATS * 4;
export const ROI_DETECTOR_SLOT = MAX_HANDS;

const PAINT_WORKGROUPS = Math.ceil(MASK_TEXELS / 64);
const CROP_WORKGROUP_SIZE = 8;

export interface HandResultInput {
  readonly landmarks?: Buffer;
  readonly presence: number;
}

interface VisualFrameOptions {
  readonly dpr?: number;
  readonly showCursor?: boolean;
  readonly showCamera?: boolean;
}

export interface PaintPoint {
  readonly x: number;
  readonly y: number;
}

type Owned = {
  dispose?: () => void;
  destroy?: () => void;
};

function bytes(view: Float32Array | Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    view.buffer as ArrayBuffer,
    view.byteOffset,
    view.byteLength
  );
}

export function createLandmarkBuffer(
  gpu: Gpu,
  label = "air-painting",
  slot = 0
): Buffer {
  return gpu.device.createBuffer({
    size: LANDMARK_POINTS_BUFFER_BYTES,
    usage: ["storage", "copy_dst"],
    label: `${label}-landmarks-${slot}`,
  });
}

export function writeLandmarks(buffer: Buffer, landmarks: Float32Array): void {
  buffer.write(bytes(landmarks));
}

export function createVisualPipeline(
  gpu: Gpu,
  options: {
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly label?: string;
  }
) {
  const label = options.label ?? "air-painting";
  let sourceWidth = options.sourceWidth;
  let sourceHeight = options.sourceHeight;
  let displayWidth = sourceWidth;
  let displayHeight = sourceHeight;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error(
      `Frame size must be positive, received ${sourceWidth}x${sourceHeight}.`
    );
  }

  const owned: Owned[] = [];
  const own = <T extends Owned>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  const release = (resource: Owned) => {
    const index = owned.indexOf(resource);
    if (index < 0) return;
    owned.splice(index, 1);
    if (resource.dispose) resource.dispose();
    else resource.destroy?.();
  };
  const releaseMany = (resources: readonly Owned[]) => {
    let failure: unknown;
    for (const resource of resources) {
      try {
        release(resource);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  };
  const releaseAll = () => releaseMany([...owned].reverse());
  const createBuffer = (
    suffix: string,
    size: number,
    usage: ("storage" | "copy_src" | "copy_dst")[] = ["storage", "copy_dst"]
  ) =>
    own(
      gpu.device.createBuffer({
        size,
        usage,
        label: `${label}-${suffix}`,
      })
    );

  try {
    const mask = createBuffer("mask", MASK_BYTES);
    const brushes = createBuffer("brushes", BRUSH_BUFFER_BYTES);
    const rois = createBuffer("rois", ROI_BYTES);
    const detectorInput = createBuffer("detector-input", DETECTOR_INPUT_BYTES, [
      "storage",
      "copy_src",
      "copy_dst",
    ]);
    const landmarkInputs = Array.from({ length: MAX_HANDS }, (_, slot) =>
      createBuffer(`landmark-input-${slot}`, LANDMARK_INPUT_BYTES, [
        "storage",
        "copy_src",
        "copy_dst",
      ])
    );
    const idleLandmarks = createBuffer(
      "landmarks-idle",
      LANDMARK_POINTS_BUFFER_BYTES
    );
    let analysisFrameTexture = own(
      createFrameTexture(gpu, label, sourceWidth, sourceHeight)
    );
    let displayFrameTexture = own(
      createFrameTexture(gpu, `${label}-display`, sourceWidth, sourceHeight)
    );
    const linearSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const crop = compute(gpu, handCropWgsl, { label: `${label}-crop` });
    const hand = compute(gpu, handWgsl, { label: `${label}-hand` });
    const paint = compute(gpu, paintWgsl, { label: `${label}-paint` });
    const composite = effect(gpu, compositeWgsl, {
      label: `${label}-composite`,
    });
    const roiScratch = new Float32Array(ROI_STRIDE_FLOATS);
    const pointerBrushes = new Float32Array(BRUSH_BUFFER_BYTES / 4);

    const dispatchPaint = (radius = 18) => {
      paint.set({
        uniforms: {
          mask_size: [MASK_WIDTH, MASK_HEIGHT],
          radius,
          feather: 3.5,
          decay: 1,
          clear_epsilon: 1 / 255,
        },
        brushes,
        mask,
      });
      paint.dispatch(PAINT_WORKGROUPS);
    };

    const writeRoi = (slot: number, roi: HandRoi) => {
      if (!Number.isInteger(slot) || slot < 0 || slot >= ROI_SLOT_COUNT) {
        throw new Error(
          `ROI slot ${slot} is out of range (0..${ROI_SLOT_COUNT - 1}).`
        );
      }
      roiScratch.set([roi.cx, roi.cy, roi.size, roi.rotation]);
      rois.write(bytes(roiScratch), slot * ROI_STRIDE_FLOATS * 4);
    };
    const writeDetectorRoi = () => {
      writeRoi(ROI_DETECTOR_SLOT, {
        cx: sourceWidth / 2,
        cy: sourceHeight / 2,
        size: Math.max(sourceWidth, sourceHeight),
        rotation: 0,
      });
    };
    const dispatchCrop = (
      roiIndex: number,
      outSize: number,
      output: Buffer
    ) => {
      crop.set({
        crop: {
          source: [sourceWidth, sourceHeight],
          out_size: outSize,
          roi_index: roiIndex,
        },
        src: analysisFrameTexture,
        samp: linearSampler,
        rois,
        out_buf: output,
      });
      const groups = Math.ceil(outSize / CROP_WORKGROUP_SIZE);
      crop.dispatch(groups, groups);
    };
    writeDetectorRoi();

    return {
      get sourceWidth() {
        return sourceWidth;
      },
      get sourceHeight() {
        return sourceHeight;
      },
      detectorInput,
      landmarkInput(slot: number) {
        const buffer = landmarkInputs[slot];
        if (!buffer) throw new Error(`Landmark slot ${slot} is out of range.`);
        return buffer;
      },
      writeRoi,
      cropDetectorInput() {
        dispatchCrop(ROI_DETECTOR_SLOT, DETECTOR_SIZE, detectorInput);
      },
      cropLandmarkInput(slot: number) {
        const buffer = landmarkInputs[slot];
        if (!buffer) throw new Error(`Landmark slot ${slot} is out of range.`);
        dispatchCrop(slot, LANDMARK_SIZE, buffer);
      },
      consumeHandLandmarks(
        results: readonly HandResultInput[],
        dtSeconds: number,
        options: { readonly reset?: boolean } = {}
      ) {
        const presence = [0, 0];
        const ran = [0, 0];
        const buffers: (Buffer | undefined)[] = [];
        for (let slot = 0; slot < Math.min(results.length, MAX_HANDS); slot++) {
          const result = results[slot];
          if (!result?.landmarks) continue;
          buffers[slot] = result.landmarks;
          presence[slot] = Number.isFinite(result.presence)
            ? result.presence
            : 0;
          ran[slot] = 1;
        }
        hand.set({
          uniforms: {
            source: [sourceWidth, sourceHeight],
            display: [displayWidth, displayHeight],
            presence,
            ran,
            dt: dtSeconds,
            enter_confidence: 0.45,
            stay_confidence: 0.3,
            ema_tau: 0.075,
            max_jump: 0.18 * Math.SQRT2,
            reset: options.reset ? 1 : 0,
            crop_size: LANDMARK_SIZE,
            loopback_scale: 2,
          },
          lm0: buffers[0] ?? idleLandmarks,
          lm1: buffers[1] ?? idleLandmarks,
          rois,
          brushes,
        });
        hand.dispatch(1);
        dispatchPaint(14);
      },
      paintPointer(
        previous: PaintPoint,
        current: PaintPoint,
        stroke: boolean,
        engaged = true,
        openness = engaged ? 0.22 : 1
      ) {
        pointerBrushes.fill(0);
        pointerBrushes.set(
          [
            previous.x,
            previous.y,
            current.x,
            current.y,
            1,
            1,
            0,
            engaged ? 1 : 0,
            stroke ? 1 : 0,
            13,
            13,
            openness,
          ],
          0
        );
        brushes.write(bytes(pointerBrushes));
        dispatchPaint(13);
      },
      renderVisualFrame(
        output: Surface | Target,
        options: VisualFrameOptions = {}
      ) {
        const dpr = Math.min(2, Math.max(0.25, options.dpr ?? 1));
        composite.set({
          uniforms: {
            resolution: output.size,
            mask_size: [MASK_WIDTH, MASK_HEIGHT],
            show_cursor: options.showCursor === false ? 0 : 1,
            show_camera: options.showCamera === true ? 1 : 0,
            cursor_radius: 23,
            grain_cell: 4 * dpr,
          },
          mask,
          brushes,
          frameTexture: displayFrameTexture,
          frameSampler: linearSampler,
        });
        frame(gpu, (currentFrame) => {
          currentFrame.pass({ target: output }, (pass) => pass.draw(composite));
        });
      },
      writeFrame(rgba: Uint8Array) {
        const expected = sourceWidth * sourceHeight * 4;
        if (rgba.byteLength !== expected) {
          throw new Error(
            `Frame upload expects ${expected} bytes for ${sourceWidth}x${sourceHeight}, received ${rgba.byteLength}.`
          );
        }
        gpu.gpu.queue.writeTexture(
          { texture: analysisFrameTexture.gpu },
          bytes(rgba),
          { bytesPerRow: sourceWidth * 4, rowsPerImage: sourceHeight },
          { width: sourceWidth, height: sourceHeight }
        );
        gpu.gpu.queue.writeTexture(
          { texture: displayFrameTexture.gpu },
          bytes(rgba),
          { bytesPerRow: sourceWidth * 4, rowsPerImage: sourceHeight },
          { width: sourceWidth, height: sourceHeight }
        );
      },
      copyAnalysisFrame(source: GPUCopyExternalImageSource) {
        gpu.gpu.queue.copyExternalImageToTexture(
          { source },
          { texture: analysisFrameTexture.gpu },
          { width: sourceWidth, height: sourceHeight }
        );
      },
      copyDisplayFrame(source: GPUCopyExternalImageSource) {
        gpu.gpu.queue.copyExternalImageToTexture(
          { source },
          { texture: displayFrameTexture.gpu },
          { width: sourceWidth, height: sourceHeight }
        );
      },
      resizeDisplay(nextWidth: number, nextHeight: number) {
        if (!(nextWidth > 0) || !(nextHeight > 0)) return;
        displayWidth = nextWidth;
        displayHeight = nextHeight;
      },
      clearMask() {
        mask.write(new Uint8Array(MASK_BYTES));
        brushes.write(new Uint8Array(BRUSH_BUFFER_BYTES));
      },
      resizeSource(nextWidth: number, nextHeight: number) {
        if (!(nextWidth > 0) || !(nextHeight > 0)) return;
        if (nextWidth === sourceWidth && nextHeight === sourceHeight) return;
        let nextAnalysisFrame: Texture | undefined;
        let nextDisplayFrame: Texture | undefined;
        try {
          nextAnalysisFrame = own(
            createFrameTexture(gpu, label, nextWidth, nextHeight)
          );
          nextDisplayFrame = own(
            createFrameTexture(
              gpu,
              `${label}-display`,
              nextWidth,
              nextHeight
            )
          );
        } catch (error) {
          try {
            releaseMany(
              [nextDisplayFrame, nextAnalysisFrame].filter(Boolean) as Owned[]
            );
          } catch {}
          throw error;
        }
        const previous = [displayFrameTexture, analysisFrameTexture];
        sourceWidth = nextWidth;
        sourceHeight = nextHeight;
        analysisFrameTexture = nextAnalysisFrame;
        displayFrameTexture = nextDisplayFrame;
        releaseMany(previous);
        writeDetectorRoi();
      },
      dispose: releaseAll,
    };
  } catch (error) {
    try {
      releaseAll();
    } catch {}
    throw error;
  }
}

export type VisualPipeline = ReturnType<typeof createVisualPipeline>;

function createFrameTexture(
  gpu: Gpu,
  label: string,
  sourceWidth: number,
  sourceHeight: number
): Texture {
  return gpu.device.createTexture({
    size: [sourceWidth, sourceHeight],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
    label: `${label}-frame`,
  });
}
