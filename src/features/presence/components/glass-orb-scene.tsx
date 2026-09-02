"use client";

import { useEffect, useRef, useState } from "react";

type GlassRenderer = {
  ready: Promise<void>;
  setSphereMix: (value: number) => void;
  setVitality: (value: number) => void;
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
  ready: 0.48,
  listening: 0.9,
  receiving: 0.72,
  creating: 1,
  speaking: 0.84,
  awaiting: 0.28,
  connected: 0.58,
};

export function GlassOrbScene({
  mood,
  presence,
  mode = "hero",
}: {
  mood: OrbMood;
  presence: OrbPresence;
  mode?: "hero" | "prompt";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GlassRenderer | null>(null);
  const presenceRef = useRef(presence);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

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

        const { createRenderer } = await import(
          "@/features/presence/runtime/renderer"
        );
        if (cancelled) return;

        renderer = createRenderer({
          canvas,
          transparent: true,
        });
        rendererRef.current = renderer;
        renderer.setSphereMix(1);
        renderer.setVitality(PRESENCE_VITALITY[presenceRef.current]);
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
    presenceRef.current = presence;
    rendererRef.current?.setVitality(PRESENCE_VITALITY[presence]);
  }, [presence]);

  return (
    <div
      className={
        mode === "hero"
          ? "masil-orb-stage pointer-events-none absolute left-1/2 top-[2.5rem] h-[clamp(18rem,25vw,23rem)] w-[clamp(18rem,25vw,23rem)] -translate-x-1/2"
          : "masil-orb-stage pointer-events-none absolute left-1/2 top-[5rem] z-20 size-[5.5rem] -translate-x-1/2 opacity-95 sm:top-[5.25rem] sm:size-[6.25rem]"
      }
      data-testid="glass-orb-scene"
      data-presence={presence}
    >
      <canvas
        ref={canvasRef}
        className={`masil-orb-canvas block h-full w-full touch-none transition-[filter,opacity,transform] duration-1000 ${MOOD_FILTERS[mood]} ${
          status === "ready" ? "opacity-100" : "opacity-0"
        } ${presence === "receiving" || presence === "listening" ? "scale-[1.025]" : "scale-100"}`}
        aria-label="말과 선택에 반응하며 빛이 달라지는 MASIL Orb"
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
