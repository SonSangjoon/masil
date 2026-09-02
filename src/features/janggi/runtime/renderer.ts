import type { Effect, Geometry, Gpu, Surface, Target } from "vgpu";
import { draw, effect, frame, geometry, storage, surface, target } from "vgpu";
import { box, cylinder, perspectiveCamera, torus } from "vgpu/scene";

import presentWgsl from "@/features/presence/runtime/hero-fractal-present.wgsl";
import type {
  JanggiGameState,
  JanggiGridPoint,
  JanggiMove,
  JanggiMoveState,
} from "@/features/janggi/model/game";
import boardWgsl from "./janggi-board.wgsl";
import piecesWgsl from "./janggi-pieces.wgsl";

type JanggiRenderer = {
  ready: Promise<void>;
  setBoardState: (
    game: JanggiGameState,
    state: JanggiMoveState,
    move: JanggiMove | null,
  ) => void;
  dispose: () => void;
};

export type JanggiVisualState = {
  cameraFocus: number;
  moveProgress: number;
};

type RendererOptions = {
  canvas: HTMLCanvasElement;
  game: JanggiGameState;
  onVisualState?: (state: JanggiVisualState) => void;
};

const OVERVIEW_CAMERA_POSITION = [0, 10.8, 2.3] as const;
const OVERVIEW_CAMERA_TARGET = [0, 0, 0] as const;
const CAMERA_UP = [0, 1, 0] as const;
const OVERVIEW_CAMERA_FOV = 39;
const FOCUS_CAMERA_FOV = 29;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function lerpVector(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  amount: number,
) {
  return [
    lerp(start[0], end[0], amount),
    lerp(start[1], end[1], amount),
    lerp(start[2], end[2], amount),
  ] as const;
}

function numericMoveState(state: JanggiMoveState) {
  if (state === "suggested") return 1;
  if (state === "moved") return 2;
  return 0;
}

function gridToWorld(point: JanggiGridPoint) {
  return {
    x: (point.col - 4) * 0.58,
    z: (point.row - 4.5) * 0.61,
  };
}

function cameraFor(
  aspect: number,
  focus = 0,
  move: JanggiMove | null = null,
  moveProgress = 0,
) {
  const easedFocus = easeInOut(focus);
  const start = gridToWorld(move?.from ?? { row: 7, col: 2 });
  const end = gridToWorld(move?.to ?? { row: 7, col: 2 });
  const travel = easeInOut(clamp01((moveProgress - 0.16) / 0.66));
  const subject = {
    x: lerp(start.x, end.x, travel),
    z: lerp(start.z, end.z, travel),
  };
  const angleSeed = move ? ((move.pieceIndex % 7) - 3) * 0.075 : 0;
  const orbit = -0.62 + angleSeed + moveProgress * 0.52;
  const radius = 4.75;
  const focusCameraPosition = [
    subject.x + Math.sin(orbit) * radius,
    3.65 + Math.sin(moveProgress * Math.PI) * 0.2,
    subject.z + Math.cos(orbit) * radius,
  ] as const;
  const focusCameraTarget = [subject.x, 0.2, subject.z] as const;
  return perspectiveCamera({
    fov: lerp(OVERVIEW_CAMERA_FOV, FOCUS_CAMERA_FOV, easedFocus),
    aspect,
    near: 0.05,
    far: 30,
    position: lerpVector(
      OVERVIEW_CAMERA_POSITION,
      focusCameraPosition,
      easedFocus,
    ),
    target: lerpVector(
      OVERVIEW_CAMERA_TARGET,
      focusCameraTarget,
      easedFocus,
    ),
    up: CAMERA_UP,
  });
}

export function projectJanggiPoint({
  width,
  height,
  col,
  row,
  lift = 0,
  cameraFocus = 0,
  move = null,
  moveProgress = 0,
}: {
  width: number;
  height: number;
  col: number;
  row: number;
  lift?: number;
  cameraFocus?: number;
  move?: JanggiMove | null;
  moveProgress?: number;
}) {
  const camera = cameraFor(
    width / Math.max(height, 1),
    cameraFocus,
    move,
    moveProgress,
  );
  const matrix = camera.viewProjectionMatrix;
  const x = (col - 4) * 0.58;
  const y = 0.31 + lift;
  const z = (row - 4.5) * 0.61;
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  const perspectiveScale = Math.min(1.08, Math.max(0.76, 8.8 / clipW));
  return {
    left: (ndcX * 0.5 + 0.5) * 100,
    top: (1 - (ndcY * 0.5 + 0.5)) * 100,
    scale: perspectiveScale,
  };
}

export function createJanggiRenderer({
  canvas,
  game: initialGame,
  onVisualState,
}: RendererOptions): JanggiRenderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let scene: Target | undefined;
  let boardGeometry: Geometry | undefined;
  let pieceGeometry: Geometry | undefined;
  let pieceRingGeometry: Geometry | undefined;
  let pieceStateBuffer: ReturnType<typeof storage> | undefined;
  let present: Effect | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let visibilityObserver: IntersectionObserver | undefined;
  let frameId = 0;
  let visible = true;
  let game = initialGame;
  let moveState: JanggiMoveState = "idle";
  let activeMove: JanggiMove | null = initialGame.lastMove;
  let stateStartedAt = performance.now();
  let cameraFocus = 0;
  let cameraFocusAtChange = 0;
  let moveProgress = 0;
  let moveProgressAtChange = 0;
  let lastReportedCameraFocus = -1;
  let lastReportedMoveProgress = -1;
  const epoch = performance.now();

  const encodePieces = (state: JanggiGameState) => {
    const data = new Float32Array(32 * 4);
    for (const piece of state.pieces) {
      const offset = piece.index * 4;
      data[offset] = piece.col;
      data[offset + 1] = piece.row;
      data[offset + 2] = piece.side === "cho" ? 1 : 0;
      data[offset + 3] = piece.active ? 1 : 0;
    }
    return data;
  };

  const visualStateFor = (time: number) => {
    const elapsed = Math.max(0, (time - stateStartedAt) * 0.001);
    if (moveState === "suggested") {
      cameraFocus = lerp(
        cameraFocusAtChange,
        1,
        easeInOut(elapsed / 0.95),
      );
      moveProgress = 0;
    } else if (moveState === "moved") {
      moveProgress = lerp(
        moveProgressAtChange,
        1,
        easeInOut(elapsed / 1.6),
      );
      if (elapsed < 1.45) {
        cameraFocus = lerp(
          cameraFocusAtChange,
          1,
          easeInOut(elapsed / 0.38),
        );
      } else {
        cameraFocus = lerp(1, 0, easeInOut((elapsed - 1.45) / 0.95));
      }
    } else {
      cameraFocus = lerp(
        cameraFocusAtChange,
        0,
        easeInOut(elapsed / 0.82),
      );
      moveProgress = lerp(
        moveProgressAtChange,
        0,
        easeInOut(elapsed / 0.55),
      );
    }

    if (
      onVisualState &&
      (Math.abs(cameraFocus - lastReportedCameraFocus) > 0.002 ||
        Math.abs(moveProgress - lastReportedMoveProgress) > 0.002)
    ) {
      lastReportedCameraFocus = cameraFocus;
      lastReportedMoveProgress = moveProgress;
      onVisualState({ cameraFocus, moveProgress });
    }
  };

  const resize = () => {
    if (!output || !scene || disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const nextSize = [
      Math.max(1, Math.round(rect.width * dpr)),
      Math.max(1, Math.round(rect.height * dpr)),
    ] as const;
    output.resize(nextSize);
    scene.resize(nextSize);
  };

  const render = (time: number) => {
    frameId = 0;
    if (disposed || !gpu || !output || !scene || !present || !visible) return;
    visualStateFor(time);
    const camera = cameraFor(
      output.size[0] / Math.max(output.size[1], 1),
      cameraFocus,
      activeMove,
      moveProgress,
    );
    const params = {
      viewProjection: camera.viewProjectionMatrix,
      time: (time - epoch) * 0.001,
      moveState: numericMoveState(moveState),
      moveProgress,
      movePieceIndex: activeMove?.pieceIndex ?? -1,
      moveFromCol: activeMove?.from.col ?? 0,
      moveFromRow: activeMove?.from.row ?? 0,
      moveToCol: activeMove?.to.col ?? 0,
      moveToRow: activeMove?.to.row ?? 0,
    };
    const boardDraw = boardDrawRef;
    const piecesDraw = piecesDrawRef;
    const pieceRingsDraw = pieceRingsDrawRef;
    if (!boardDraw || !piecesDraw || !pieceRingsDraw || !pieceStateBuffer) return;
    const currentGpu = gpu;
    const currentOutput = output;
    const currentScene = scene;
    const currentPresent = present;
    boardDraw.set({ params, pieceStates: pieceStateBuffer });
    piecesDraw.set({
      params: { ...params, part: 0 },
      pieceStates: pieceStateBuffer,
    });
    pieceRingsDraw.set({
      params: { ...params, part: 1 },
      pieceStates: pieceStateBuffer,
    });
    currentPresent.set({ sceneTexture: currentScene });
    frame(currentGpu, (currentFrame) => {
      currentFrame.pass(
        { target: currentScene, clear: [0, 0, 0, 0] },
        (pass) => {
          pass.draw(boardDraw);
          pass.draw(piecesDraw);
          pass.draw(pieceRingsDraw);
        },
      );
      currentFrame.pass(
        { target: currentOutput, clear: [0, 0, 0, 0] },
        (pass) => pass.draw(currentPresent),
      );
    });
    frameId = requestAnimationFrame(render);
  };

  let boardDrawRef: ReturnType<typeof draw> | undefined;
  let piecesDrawRef: ReturnType<typeof draw> | undefined;
  let pieceRingsDrawRef: ReturnType<typeof draw> | undefined;

  const startAnimation = () => {
    if (!frameId && visible && !disposed) frameId = requestAnimationFrame(render);
  };

  const stopAnimation = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
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
      label: "masil-janggi-output",
    });
    scene = target(gpu, {
      size: output.size,
      format: output.format,
      depth: true,
      msaa: 4,
      label: "masil-janggi-scene",
    });
    boardGeometry = geometry(gpu, box({ size: 1 }));
    pieceGeometry = geometry(
      gpu,
      cylinder({
        radius: 1,
        height: 1,
        radialSegments: 8,
        heightSegments: 1,
        shading: "flat",
      }),
    );
    pieceRingGeometry = geometry(
      gpu,
      torus({
        radius: 0.79,
        tube: 0.048,
        radialSegments: 12,
        tubularSegments: 8,
        shading: "smooth",
      }),
    );
    pieceStateBuffer = storage(gpu, 32 * 4 * Float32Array.BYTES_PER_ELEMENT, "read");
    pieceStateBuffer.write(encodePieces(game));
    boardDrawRef = draw(gpu, {
      shader: boardWgsl,
      geometry: boardGeometry,
      cull: "back",
      label: "masil-janggi-board",
    });
    piecesDrawRef = draw(gpu, {
      shader: piecesWgsl,
      geometry: pieceGeometry,
      instances: 32,
      cull: "back",
      blend: "premultiplied",
      label: "masil-janggi-pieces",
    });
    pieceRingsDrawRef = draw(gpu, {
      shader: piecesWgsl,
      geometry: pieceRingGeometry,
      instances: 32,
      cull: "back",
      blend: "premultiplied",
      label: "masil-janggi-piece-rings",
    });
    present = effect(gpu, presentWgsl, {
      blend: "premultiplied",
      label: "masil-janggi-present",
    });
    await Promise.all([
      boardDrawRef.compile(scene),
      piecesDrawRef.compile(scene),
      pieceRingsDrawRef.compile(scene),
      present.compile({ colors: [output.format] }),
    ]);
    if (disposed) return;
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) startAnimation();
      else stopAnimation();
    });
    visibilityObserver.observe(canvas);
    resize();
    startAnimation();
  };

  const ready = initialize();

  const setBoardState = (
    nextGame: JanggiGameState,
    state: JanggiMoveState,
    move: JanggiMove | null,
  ) => {
    const moveChanged = move?.id !== activeMove?.id;
    cameraFocusAtChange = cameraFocus;
    moveProgressAtChange = state === "moved" && moveChanged ? 0 : moveProgress;
    if (state === "moved" && moveChanged) moveProgress = 0;
    game = nextGame;
    moveState = state;
    activeMove = move;
    pieceStateBuffer?.write(encodePieces(game));
    stateStartedAt = performance.now();
    startAnimation();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopAnimation();
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    (scene as Target & { destroy?: () => void })?.destroy?.();
    boardGeometry?.destroy();
    pieceGeometry?.destroy();
    pieceRingGeometry?.destroy();
    output?.dispose();
    gpu?.dispose();
  };

  return { ready, setBoardState, dispose };
}
