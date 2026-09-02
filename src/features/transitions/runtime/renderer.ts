import type { Draw, Gpu, Surface } from "vgpu";
import { draw, frame, surface } from "vgpu";

import transitionWgsl from "./world-transition.wgsl";

export type TransitionActivity = "calligraphy" | "janggi";

export interface WorldTransitionRenderer {
  readonly ready: Promise<void>;
  play(activity: TransitionActivity, onCovered: () => void): Promise<void>;
  preview(activity: TransitionActivity, progress: number): Promise<void>;
  cancel(): void;
  dispose(): void;
}

const TRANSITION_DURATION_MS = 1840;
const COVER_PROGRESS = 0.59;

export function createWorldTransitionRenderer(
  canvas: HTMLCanvasElement,
): WorldTransitionRenderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let transitionDraw: Draw | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let animationFrame = 0;
  let resizeFrame = 0;
  let activeResolve: (() => void) | undefined;
  let activeOnCovered: (() => void) | undefined;
  let covered = false;
  let startedAt = 0;
  let activityValue = 0;
  let currentProgress = 1;

  const render = (progress: number, time: number) => {
    if (disposed || !gpu || !output || !transitionDraw) return;
    currentProgress = progress;
    transitionDraw.set({
      params: {
        resolution: output.size,
        time: time * 0.001,
        progress,
        activity: activityValue,
      },
    });
    frame(gpu, (currentFrame) => {
      currentFrame.pass(
        {
          target: output!,
          clear: [0, 0, 0, 0],
        },
        (pass) => pass.draw(transitionDraw!),
      );
    });
  };

  const finishActive = () => {
    if (!covered) {
      covered = true;
      activeOnCovered?.();
    }
    activeOnCovered = undefined;
    const resolve = activeResolve;
    activeResolve = undefined;
    resolve?.();
  };

  const animate = (time: number) => {
    animationFrame = 0;
    if (disposed) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reducedMotion ? 260 : TRANSITION_DURATION_MS;
    const progress = Math.min(1, Math.max(0, (time - startedAt) / duration));
    if (!covered && progress >= COVER_PROGRESS) {
      covered = true;
      activeOnCovered?.();
    }
    render(progress, time);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    finishActive();
  };

  const resize = () => {
    resizeFrame = 0;
    if (disposed || !output) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    output.resize([
      Math.max(1, Math.round(rect.width * dpr)),
      Math.max(1, Math.round(rect.height * dpr)),
    ]);
    render(currentProgress, performance.now());
  };

  const requestResize = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resize);
  };

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    gpu = await init();
    if (disposed) {
      gpu.dispose();
      return;
    }
    output = surface(gpu, canvas, {
      alphaMode: "premultiplied",
      clearColor: [0, 0, 0, 0],
      dpr: [1, 2],
      label: "masil-world-transition-output",
    });
    transitionDraw = draw(gpu, {
      shader: transitionWgsl,
      vertices: 3,
      depth: false,
      blend: "premultiplied",
      label: "masil-world-transition-field",
    });
    await transitionDraw.compile({ colors: [output.format] });
    if (disposed) return;
    resizeObserver = new ResizeObserver(requestResize);
    resizeObserver.observe(canvas);
    resize();
  };

  const ready = initialize();

  const cancel = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    render(1, performance.now());
    finishActive();
  };

  const play = async (
    activity: TransitionActivity,
    onCovered: () => void,
  ) => {
    await ready;
    if (disposed || !gpu || !output || !transitionDraw) {
      onCovered();
      return;
    }
    cancel();
    activityValue = activity === "janggi" ? 1 : 0;
    covered = false;
    activeOnCovered = onCovered;
    startedAt = performance.now();
    return new Promise<void>((resolve) => {
      activeResolve = resolve;
      render(0, startedAt);
      animationFrame = requestAnimationFrame(animate);
    });
  };

  const preview = async (
    activity: TransitionActivity,
    progress: number,
  ) => {
    await ready;
    if (disposed || !gpu || !output || !transitionDraw) return;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    activityValue = activity === "janggi" ? 1 : 0;
    render(Math.min(1, Math.max(0, progress)), performance.now());
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeObserver?.disconnect();
    activeResolve?.();
    activeResolve = undefined;
    gpu?.dispose();
  };

  return { ready, play, preview, cancel, dispose };
}
