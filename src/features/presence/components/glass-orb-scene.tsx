"use client";

import { useEffect, useRef, useState } from "react";

type GlassRenderer = {
  ready: Promise<void>;
  setSphereMix: (value: number) => void;
  setVitality: (value: number) => void;
  setTransition: (value: number) => void;
  dispose: () => void;
};

type OrbMood = "idle" | "ink" | "janggi" | "stories" | "support";
type OrbPresence =
  | "ready"
  | "listening"
  | "receiving"
  | "creating"
  | "speaking"
  | "awaiting"
  | "connected";

const MOOD_FILTERS: Record<OrbMood, string> = {
  idle: "brightness-100 saturate-100",
  ink: "brightness-[1.02] saturate-[0.98]",
  janggi: "brightness-[0.98] contrast-[1.02] saturate-[1.02]",
  stories: "brightness-[1.04] saturate-[0.98]",
  support: "brightness-[1.04] saturate-[0.82] contrast-[1.03]",
};

const PRESENCE_LABELS: Record<OrbPresence, string> = {
  ready: "Agent와 연결됨",
  listening: "Agent가 듣는 중",
  receiving: "WebMCP 요청을 받는 중",
  creating: "공간을 만드는 중",
  speaking: "MASIL이 말하는 중",
  awaiting: "확인을 기다리는 중",
  connected: "로컬 연결 결과가 준비됨",
};

const PRESENCE_VITALITY: Record<OrbPresence, number> = {
  ready: 0.86,
  listening: 0.96,
  receiving: 0.82,
  creating: 1,
  speaking: 0.92,
  awaiting: 0.48,
  connected: 0.72,
};

export function GlassOrbScene({
  connected,
  mood,
  presence,
  mode = "hero",
  transitionProgress = 0,
}: {
  connected: boolean;
  mood: OrbMood;
  presence: OrbPresence;
  mode?: "hero" | "prompt";
  transitionProgress?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GlassRenderer | null>(null);
  const presenceRef = useRef(presence);
  const connectedRef = useRef(connected);
  const transitionRef = useRef(transitionProgress);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let renderer: GlassRenderer | null = null;

    const start = async () => {
      try {
        if (!navigator.gpu) {
          throw new Error("WebGPU is not available in this browser.");
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const { createRenderer } =
          await import("@/features/presence/runtime/renderer");
        if (cancelled) return;

        renderer = createRenderer({
          canvas,
          transparent: true,
        });
        rendererRef.current = renderer;
        renderer.setSphereMix(1);
        renderer.setVitality(
          connectedRef.current ? PRESENCE_VITALITY[presenceRef.current] : 0.28,
        );
        renderer.setTransition(transitionRef.current);
        await renderer.ready;

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("MASIL orb scene could not start", error);
        setStatus("error");
      }
    };

    void start();

    return () => {
      cancelled = true;
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, [mode]);

  useEffect(() => {
    connectedRef.current = connected;
    presenceRef.current = presence;
    transitionRef.current = transitionProgress;
    rendererRef.current?.setVitality(
      connected ? PRESENCE_VITALITY[presence] : 0.28,
    );
    rendererRef.current?.setTransition(
      Math.min(1, Math.max(0, transitionProgress)),
    );
  }, [connected, presence, transitionProgress]);

  const visualFilter = connected
    ? MOOD_FILTERS[mood]
    : "grayscale saturate-[0.08] brightness-[1.03] contrast-[0.9]";
  const isFluidTransition = mode === "hero" && transitionProgress > 0;
  const transitionAmount = Math.min(1, Math.max(0, transitionProgress));
  const movementProgress =
    transitionAmount * transitionAmount * (3 - 2 * transitionAmount);
  const heroSize = Math.min(
    368,
    Math.max(288, (viewport.width || 1280) * 0.25),
  );
  const activitySize = (viewport.width || 1280) >= 640 ? 100 : 88;
  // Keep the hero Orb clearly above the copy. The canvas itself is centered by
  // the single Tailwind translate below; the inline transform only owns the
  // vertical hand-off movement.
  const heroTop = (viewport.height || 800) * 0.5 - 244;
  const activityTop = (viewport.width || 1280) >= 640 ? 84 : 80;
  const heroCenter = heroTop + heroSize * 0.5;
  const activityCenter = activityTop + activitySize * 0.5;
  const movementY = (activityCenter - heroCenter) * movementProgress;
  const fluidScale = isFluidTransition
    ? 1 + (activitySize / heroSize - 1) * movementProgress
    : 1;

  return (
    <div
      className={
        mode === "hero"
          ? `masil-orb-stage pointer-events-none absolute left-1/2 top-[calc(50%_-_15.25rem)] h-[clamp(18rem,25vw,23rem)] w-[clamp(18rem,25vw,23rem)] -translate-x-1/2 ${isFluidTransition ? "z-[100]" : "z-20"}`
          : "masil-orb-stage pointer-events-none absolute left-1/2 top-[5rem] z-20 size-[5.5rem] -translate-x-1/2 opacity-95 sm:top-[5.25rem] sm:size-[6.25rem]"
      }
      style={
        mode === "hero"
          ? {
              transform: `translateY(${movementY}px) scale(${fluidScale})`,
              transformOrigin: "50% 50%",
            }
          : undefined
      }
      data-testid="glass-orb-scene"
      data-presence={presence}
      data-connected={connected}
    >
      <canvas
        ref={canvasRef}
        className={`masil-orb-canvas block h-full w-full touch-none transition-[filter,opacity,transform] duration-[1200ms] ease-[cubic-bezier(.16,1,.3,1)] ${visualFilter} ${
          status === "ready" ? "opacity-100" : "opacity-0"
        } ${presence === "receiving" || presence === "listening" ? "scale-[1.025]" : "scale-100"}`}
        aria-label={
          connected
            ? "Agent와 연결되어 말과 선택에 반응하는 MASIL Orb"
            : "Agent 연결을 기다리는 MASIL Orb"
        }
      />

      {status === "ready" ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="sr-only" role="status">
            {PRESENCE_LABELS[presence]}
          </span>
        </div>
      ) : null}

      {status === "loading" ? (
        <p
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm tracking-[-0.01em] text-muted-foreground"
          role="status"
        >
          공간을 여는 중…
        </p>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="max-w-sm text-base leading-7 text-muted-foreground">
            이 브라우저에서는 동적 공간을 열 수 없습니다. WebGPU를 지원하는
            브라우저에서 다시 시도해 주세요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
