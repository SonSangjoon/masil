import { surface, type Gpu, type Surface } from "vgpu";

import {
  createVisualPipeline,
  type PaintPoint,
  type VisualPipeline,
} from "./visual-pipeline";

export interface PointerRenderer {
  readonly ready: Promise<void>;
  clear(): void;
  begin(point: PaintPoint): void;
  move(point: PaintPoint): void;
  end(): void;
  dispose(): void;
}

export function createPointerRenderer(canvas: HTMLCanvasElement): PointerRenderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let pipeline: VisualPipeline | undefined;
  let observer: ResizeObserver | undefined;
  let animationFrame = 0;
  let resizeFrame = 0;
  let active = false;
  let previous: PaintPoint = { x: 0.5, y: 0.5 };

  const resize = () => {
    resizeFrame = 0;
    if (disposed || !output) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    output.resize([
      Math.max(1, Math.round(rect.width * dpr)),
      Math.max(1, Math.round(rect.height * dpr)),
    ]);
  };

  const requestResize = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resize);
  };

  const draw = () => {
    animationFrame = 0;
    if (disposed || !pipeline || !output) return;
    pipeline.renderVisualFrame(output, {
      dpr: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
      showCursor: true,
      showCamera: false,
    });
    animationFrame = requestAnimationFrame(draw);
  };

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    gpu = await init();
    if (disposed) {
      gpu.dispose();
      gpu = undefined;
      return;
    }
    output = surface(gpu, canvas, { autoResize: false });
    pipeline = createVisualPipeline(gpu, {
      sourceWidth: 960,
      sourceHeight: 540,
      label: "masil-air-calligraphy-pointer",
    });
    observer = new ResizeObserver(requestResize);
    observer.observe(canvas);
    resize();
    animationFrame = requestAnimationFrame(draw);
  };

  const ready = initialize();

  return {
    ready,
    clear() {
      pipeline?.clearMask();
      active = false;
    },
    begin(point) {
      previous = point;
      active = true;
      pipeline?.paintPointer(point, point, false);
    },
    move(point) {
      pipeline?.paintPointer(previous, point, active);
      previous = point;
    },
    end() {
      pipeline?.paintPointer(previous, previous, false);
      active = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      pipeline?.dispose();
      gpu?.dispose();
    },
  };
}
