import { surface, type Gpu, type Surface } from "vgpu";

import {
  createVisualPipeline,
  type PaintPoint,
  type VisualPipeline,
} from "./visual-pipeline";
import { resolveCalligraphyRenderSize } from "./render-resolution";

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
  let pointerSeen = false;
  let visualOpenness = 1;
  let targetOpenness = 1;
  let opennessVelocity = 0;
  let lastFrameMs = 0;
  let previous: PaintPoint = { x: 0.5, y: 0.5 };
  let hasRenderedPoint = false;
  let renderPixelRatio = 1;
  let pendingPointer:
    | {
        readonly point: PaintPoint;
        readonly stroke: boolean;
        readonly engaged: boolean;
      }
    | undefined;

  const requestDraw = () => {
    if (!disposed && !animationFrame) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  const resize = () => {
    resizeFrame = 0;
    if (disposed || !output) return;
    const rect = canvas.getBoundingClientRect();
    const size = resolveCalligraphyRenderSize(
      rect.width,
      rect.height,
      window.devicePixelRatio,
    );
    renderPixelRatio = size.pixelRatio;
    output.resize([size.width, size.height]);
    requestDraw();
  };

  const requestResize = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resize);
  };

  const draw = (now: number) => {
    animationFrame = 0;
    if (disposed || !pipeline || !output) return;
    const dt =
      lastFrameMs > 0
        ? Math.min(0.034, (now - lastFrameMs) / 1000)
        : 1 / 60;
    lastFrameMs = now;
    let opennessChanged = false;
    if (pointerSeen) {
      // A near-critically-damped spring gives press/release a deliberate settle
      // without the robotic constant-rate turn of a linear interpolation.
      const spring = 190;
      const damping = 25;
      const acceleration =
        (targetOpenness - visualOpenness) * spring -
        opennessVelocity * damping;
      opennessVelocity += acceleration * dt;
      let nextOpenness = Math.min(
        1,
        Math.max(0, visualOpenness + opennessVelocity * dt),
      );
      if (
        Math.abs(targetOpenness - nextOpenness) < 0.0005 &&
        Math.abs(opennessVelocity) < 0.006
      ) {
        nextOpenness = targetOpenness;
        opennessVelocity = 0;
      }
      if (Math.abs(nextOpenness - visualOpenness) > 0.0001) {
        visualOpenness = nextOpenness;
        opennessChanged = true;
      }
    }

    // Pointer hardware can report faster than the display refresh rate. Keep
    // the newest point and bridge from the last rendered point so a stroke
    // stays continuous without queueing one full-mask compute pass per event.
    const pending = pendingPointer;
    pendingPointer = undefined;
    if (pending) {
      const start = hasRenderedPoint ? previous : pending.point;
      pipeline.paintPointer(
        start,
        pending.point,
        pending.stroke,
        pending.engaged,
        visualOpenness,
      );
      previous = pending.point;
      hasRenderedPoint = true;
    } else if (pointerSeen && opennessChanged) {
      pipeline.paintPointer(
        previous,
        previous,
        false,
        active,
        visualOpenness,
      );
    }

    pipeline.renderVisualFrame(output, {
      dpr: renderPixelRatio,
      showCursor: true,
      showCamera: false,
    });

    const opennessSettled =
      Math.abs(targetOpenness - visualOpenness) < 0.0005 &&
      Math.abs(opennessVelocity) < 0.006;
    if (pendingPointer || (pointerSeen && !opennessSettled)) requestDraw();
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
  };

  const ready = initialize();

  return {
    ready,
    clear() {
      pipeline?.clearMask();
      active = false;
      pointerSeen = false;
      visualOpenness = 1;
      targetOpenness = 1;
      opennessVelocity = 0;
      pendingPointer = undefined;
      hasRenderedPoint = false;
      requestDraw();
    },
    begin(point) {
      previous = point;
      hasRenderedPoint = true;
      active = true;
      pointerSeen = true;
      targetOpenness = 0.08;
      pendingPointer = { point, stroke: false, engaged: true };
      requestDraw();
    },
    move(point) {
      pointerSeen = true;
      pendingPointer = { point, stroke: active, engaged: active };
      requestDraw();
    },
    end() {
      active = false;
      targetOpenness = 1;
      requestDraw();
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
