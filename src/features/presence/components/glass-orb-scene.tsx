"use client";

import { useEffect, useRef, useState } from "react";

type GlassRenderer = {
  ready: Promise<void>;
  setSphereMix: (value: number) => void;
  setVitality: (value: number) => void;
  setTransition: (value: number) => void;
  setForm: (value: number) => void;
  setBehavior: (value: number) => void;
  react: (kind: OrbReactionKind) => void;
  dispose: () => void;
};

const rendererModulePromise =
  typeof window === "undefined"
    ? null
    : import("@/features/presence/runtime/renderer");

export type OrbMood = "idle" | "ink" | "janggi" | "stories" | "support";
export type OrbLanguage = "ko" | "en";
export type OrbPresence =
  | "ready"
  | "listening"
  | "receiving"
  | "creating"
  | "speaking"
  | "awaiting"
  | "connected";
export type OrbLayoutMode = "hero" | "calligraphy-choice" | "prompt";
export type OrbForm = "body" | "calligraphy-droplet";
export type OrbReactionKind = "recoil" | "celebrate";

export type OrbReaction = {
  id: string;
  kind: OrbReactionKind;
  delayMs?: number;
};

const MOOD_FILTERS: Record<OrbMood, string> = {
  idle: "brightness-100 saturate-100",
  ink: "brightness-[1.02] saturate-[0.98]",
  janggi: "brightness-[0.98] contrast-[1.02] saturate-[1.02]",
  stories: "brightness-[1.04] saturate-[0.98]",
  support: "brightness-[1.04] saturate-[0.82] contrast-[1.03]",
};

const PRESENCE_LABELS: Record<
  OrbLanguage,
  Record<OrbPresence, string>
> = {
  ko: {
    ready: "Agent와 연결됨",
    listening: "Agent가 듣는 중",
    receiving: "WebMCP 요청을 받는 중",
    creating: "공간을 만드는 중",
    speaking: "MASIL이 말하는 중",
    awaiting: "확인을 기다리는 중",
    connected: "로컬 연결 결과가 준비됨",
  },
  en: {
    ready: "Connected to the Agent",
    listening: "The Agent is listening",
    receiving: "Receiving a WebMCP request",
    creating: "Creating the space",
    speaking: "MASIL is speaking",
    awaiting: "Waiting for confirmation",
    connected: "The local connection result is ready",
  },
};

const ORB_COPY: Record<
  OrbLanguage,
  {
    connectedLabel: string;
    waitingLabel: string;
    waitingStatus: string;
    loading: string;
    error: string;
  }
> = {
  ko: {
    connectedLabel: "Agent와 연결되어 말과 선택에 반응하는 MASIL Orb",
    waitingLabel: "Agent 연결을 기다리는 MASIL Orb",
    waitingStatus: "Agent 연결을 기다리는 중",
    loading: "공간을 여는 중…",
    error:
      "이 브라우저에서는 동적 공간을 열 수 없습니다. WebGPU를 지원하는 브라우저에서 다시 시도해 주세요.",
  },
  en: {
    connectedLabel: "MASIL Orb responding to the Agent's words and choices",
    waitingLabel: "MASIL Orb waiting for an Agent connection",
    waitingStatus: "Waiting for an Agent connection",
    loading: "Opening your space…",
    error:
      "This browser cannot open the interactive space. Please try again in a browser that supports WebGPU.",
  },
};

const PRESENCE_VITALITY: Record<OrbPresence, number> = {
  ready: 0.92,
  listening: 0.98,
  receiving: 0.82,
  creating: 1,
  speaking: 0.96,
  awaiting: 0.48,
  connected: 0.72,
};

// The renderer treats these as distinct body languages, not as a generic
// speed control: listening leans in, receiving ripples, creating circulates,
// speaking pulses, and awaiting settles into a watchful rhythm.
const PRESENCE_BEHAVIOR: Record<OrbPresence, number> = {
  ready: 0,
  listening: 1,
  receiving: 2,
  creating: 3,
  speaking: 4,
  awaiting: 5,
  connected: 6,
};

export function GlassOrbScene({
  calligraphyWriting = false,
  connected,
  form = "body",
  language = "ko",
  mood,
  presence,
  reaction = null,
  mode = "hero",
  showcase = false,
  transitionTargetMode = "prompt",
  transitionProgress = 0,
}: {
  calligraphyWriting?: boolean;
  connected: boolean;
  form?: OrbForm;
  language?: OrbLanguage;
  mood: OrbMood;
  presence: OrbPresence;
  reaction?: OrbReaction | null;
  mode?: OrbLayoutMode;
  showcase?: boolean;
  transitionTargetMode?: Exclude<OrbLayoutMode, "hero">;
  transitionProgress?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutMotionRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);
  const layoutAnimationRef = useRef<Animation | null>(null);
  const reactionAnimationRef = useRef<Animation | null>(null);
  const reactionTimeoutRef = useRef<number | null>(null);
  const handledReactionRef = useRef<string | null>(null);
  const previousLayoutRef = useRef<{
    mode: OrbLayoutMode;
    size: number;
    top: number;
  } | null>(null);
  const rendererRef = useRef<GlassRenderer | null>(null);
  const presenceRef = useRef(presence);
  const connectedRef = useRef(connected);
  const calligraphyWritingRef = useRef(calligraphyWriting);
  const formRef = useRef(form);
  const modeRef = useRef(mode);
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

  // The WebGPU renderer belongs to the Orb, not to a screen mode. Keeping this
  // effect mount-only preserves one canvas and one animation clock everywhere.
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

        const { createRenderer } = await (
          rendererModulePromise ??
          import("@/features/presence/runtime/renderer")
        );
        if (cancelled) return;

        renderer = createRenderer({
          canvas,
          transparent: true,
        });
        rendererRef.current = renderer;
        renderer.setSphereMix(1);
        renderer.setVitality(
          connectedRef.current
            ? calligraphyWritingRef.current
              ? 1
              : PRESENCE_VITALITY[presenceRef.current]
            : 0.28,
        );
        renderer.setBehavior(
          modeRef.current === "calligraphy-choice" ||
            calligraphyWritingRef.current
            ? 7
            : PRESENCE_BEHAVIOR[presenceRef.current],
        );
        renderer.setForm(formRef.current === "calligraphy-droplet" ? 1 : 0);
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
  }, []);

  useEffect(() => {
    connectedRef.current = connected;
    calligraphyWritingRef.current = calligraphyWriting;
    presenceRef.current = presence;
    formRef.current = form;
    modeRef.current = mode;
    transitionRef.current = transitionProgress;
    rendererRef.current?.setVitality(
      connected
        ? calligraphyWriting
          ? 1
          : PRESENCE_VITALITY[presence]
        : 0.28,
    );
    rendererRef.current?.setBehavior(
      mode === "calligraphy-choice" || calligraphyWriting
        ? 7
        : PRESENCE_BEHAVIOR[presence],
    );
    rendererRef.current?.setForm(form === "calligraphy-droplet" ? 1 : 0);
    rendererRef.current?.setTransition(
      Math.min(1, Math.max(0, transitionProgress)),
    );
  }, [calligraphyWriting, connected, form, mode, presence, transitionProgress]);

  const reactionId = reaction?.id;
  const reactionKind = reaction?.kind;
  const reactionDelayMs = reaction?.delayMs ?? 0;

  useEffect(() => {
    if (!reactionId || !reactionKind) {
      handledReactionRef.current = null;
      return;
    }
    if (handledReactionRef.current === reactionId) return;
    handledReactionRef.current = reactionId;

    const playReaction = () => {
      reactionTimeoutRef.current = null;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!reducedMotion) rendererRef.current?.react(reactionKind);

      const element = reactionRef.current;
      if (!element) return;
      reactionAnimationRef.current?.cancel();
      const keyframes: Keyframe[] =
        reactionKind === "recoil"
          ? [
              { offset: 0, transform: "translate3d(0, 0, 0) scale(1)" },
              {
                offset: 0.1,
                transform: "translate3d(-5%, 2%, 0) scale(.9, .94)",
              },
              {
                offset: 0.2,
                transform: "translate3d(4%, -1.5%, 0) scale(.94, .91)",
              },
              {
                offset: 0.31,
                transform: "translate3d(-4.5%, 1%, 0) scale(.92, .95)",
              },
              {
                offset: 0.43,
                transform: "translate3d(3.4%, -1%, 0) scale(.95, .93)",
              },
              {
                offset: 0.58,
                transform: "translate3d(-2.2%, .7%, 0) scale(.965, .97)",
              },
              {
                offset: 0.74,
                transform: "translate3d(1.2%, -.35%, 0) scale(.985)",
              },
              { offset: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ]
          : [
              { offset: 0, transform: "translate3d(0, 0, 0) scale(1)" },
              {
                offset: 0.17,
                transform: "translate3d(0, -24%, 0) scale(.94, 1.09)",
              },
              {
                offset: 0.32,
                transform: "translate3d(0, 3%, 0) scale(1.06, .92)",
              },
              {
                offset: 0.51,
                transform: "translate3d(0, -15%, 0) scale(.97, 1.06)",
              },
              {
                offset: 0.66,
                transform: "translate3d(0, 1.5%, 0) scale(1.035, .96)",
              },
              {
                offset: 0.82,
                transform: "translate3d(0, -6%, 0) scale(.99, 1.025)",
              },
              { offset: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ];

      reactionAnimationRef.current = element.animate(keyframes, {
        duration: reducedMotion
          ? 1
          : reactionKind === "recoil"
            ? 920
            : 1220,
        easing: "cubic-bezier(.22,.7,.2,1)",
      });
    };

    if (reactionDelayMs > 0) {
      reactionTimeoutRef.current = window.setTimeout(
        playReaction,
        reactionDelayMs,
      );
    } else {
      playReaction();
    }

    return () => {
      if (reactionTimeoutRef.current !== null) {
        window.clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = null;
      }
    };
  }, [reactionDelayMs, reactionId, reactionKind]);

  useEffect(
    () => () => {
      layoutAnimationRef.current?.cancel();
      reactionAnimationRef.current?.cancel();
      if (reactionTimeoutRef.current !== null) {
        window.clearTimeout(reactionTimeoutRef.current);
      }
    },
    [],
  );

  const visualFilter = connected
    ? MOOD_FILTERS[mood]
    : "grayscale saturate-[0.08] brightness-[1.03] contrast-[0.9]";
  const copy = ORB_COPY[language];
  // Product screens hand off from the hero only. The motion lab also keeps the
  // same transition geometry while leaving the sample, so the small Orb can
  // grow back into whichever enlarged body language the viewer selects next.
  const isFluidTransition =
    transitionProgress > 0 && (mode === "hero" || showcase);
  const transitionAmount = Math.min(1, Math.max(0, transitionProgress));
  const movementProgress =
    transitionAmount * transitionAmount * (3 - 2 * transitionAmount);
  const viewportWidth = viewport.width || 1280;
  const viewportHeight = viewport.height || 800;
  const widthDrivenHeroSize = Math.min(
    368,
    Math.max(288, viewportWidth * 0.25),
  );
  // Wide, shallow windows need a proportionally smaller Orb rather than a
  // permanently larger text gap. Ordinary and portrait layouts stay unchanged.
  const heightDrivenHeroSize = Math.min(
    368,
    Math.max(224, viewportHeight * 0.48),
  );
  const heroSize = Math.min(widthDrivenHeroSize, heightDrivenHeroSize);
  const activitySize = viewportWidth >= 640 ? 100 : 88;
  // The choice screen keeps the Orb visually substantial on tall layouts,
  // while preserving the compact spacing that already works on short screens.
  const choiceSize = Math.min(
    viewportWidth >= 640 ? 288 : 232,
    heroSize,
    Math.max(viewportWidth >= 640 ? 176 : 160, viewportHeight * 0.29),
  );
  // Keep the hero Orb clearly above the copy. The container owns the hand-off
  // movement and scale while the WebGPU canvas itself stays mounted.
  const driftClearance = Math.min(10, viewportHeight * 0.012);
  const shallowViewportLift = Math.min(
    14,
    Math.max(0, (640 - viewportHeight) * 0.08),
  );
  const heroTop = Math.max(
    0,
    viewportHeight * 0.382 -
      heroSize * 0.5 -
      driftClearance -
      shallowViewportLift,
  );
  const activityTop = viewportWidth >= 640 ? 84 : 80;
  // Match the hero's container-to-copy gap instead of pinning the calligraphy
  // Orb to the header. The lower anchor scales with aspect ratio, so the Orb
  // moves with the question rather than colliding with it on short screens.
  const choiceCopyAnchor =
    viewportHeight * (viewportHeight < 700 ? 0.44 : 0.48);
  const choiceTop = Math.max(
    viewportWidth >= 640 ? 12 : 48,
    choiceCopyAnchor - choiceSize - 24,
  );
  const transitionTargetSize =
    transitionTargetMode === "calligraphy-choice" ? choiceSize : activitySize;
  const transitionTargetTop =
    transitionTargetMode === "calligraphy-choice" ? choiceTop : activityTop;
  const showcaseSize = Math.min(
    320,
    Math.max(220, Math.min(viewportWidth * 0.44, viewportHeight * 0.38)),
  );
  const showcaseTop = viewportWidth >= 640 ? 72 : 68;
  const transitionOriginSize = showcase ? showcaseSize : heroSize;
  const transitionOriginTop = showcase ? showcaseTop : heroTop;
  const transitionOriginCenter =
    transitionOriginTop + transitionOriginSize * 0.5;
  const transitionTargetCenter =
    transitionTargetTop + transitionTargetSize * 0.5;
  const movementY =
    (transitionTargetCenter - transitionOriginCenter) * movementProgress;
  const fluidScale = isFluidTransition
    ? 1 +
      (transitionTargetSize / transitionOriginSize - 1) * movementProgress
    : 1;
  const usesTransitionGeometry =
    mode === "hero" || (showcase && transitionProgress > 0);
  const stageStyle = usesTransitionGeometry
    ? {
        top: transitionOriginTop,
        width: transitionOriginSize,
        height: transitionOriginSize,
        transform: `translateY(${movementY}px) scale(${fluidScale})`,
        transformOrigin: "50% 50%",
      }
    : showcase
      ? {
          top: showcaseTop,
          width: showcaseSize,
          height: showcaseSize,
        }
    : mode === "calligraphy-choice"
      ? {
          top: choiceTop,
          width: choiceSize,
          height: choiceSize,
        }
      : {
          top: activityTop,
          width: activitySize,
          height: activitySize,
        };
  const resolvedLayoutSize = showcase
    ? showcaseSize
    : mode === "hero"
      ? heroSize
      : mode === "calligraphy-choice"
        ? choiceSize
        : activitySize;
  const resolvedLayoutTop = showcase
    ? showcaseTop
    : mode === "hero"
      ? heroTop
      : mode === "calligraphy-choice"
        ? choiceTop
        : activityTop;

  useEffect(() => {
    const previous = previousLayoutRef.current;
    previousLayoutRef.current = {
      mode,
      size: resolvedLayoutSize,
      top: resolvedLayoutTop,
    };
    if (
      !previous ||
      previous.mode === mode ||
      previous.mode === "hero" ||
      mode === "hero"
    ) {
      return;
    }

    const element = layoutMotionRef.current;
    if (!element) return;
    layoutAnimationRef.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const previousCenter = previous.top + previous.size * 0.5;
    const currentCenter = resolvedLayoutTop + resolvedLayoutSize * 0.5;
    layoutAnimationRef.current = element.animate(
      [
        {
          transform: `translate3d(0, ${previousCenter - currentCenter}px, 0) scale(${previous.size / resolvedLayoutSize})`,
        },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      {
        duration: mode === "prompt" ? 960 : 1080,
        easing: "cubic-bezier(.16,1,.3,1)",
      },
    );
  }, [mode, resolvedLayoutSize, resolvedLayoutTop]);

  return (
    <div
      className={`masil-orb-stage pointer-events-none absolute left-1/2 -translate-x-1/2 ${
        isFluidTransition ? "z-[100]" : "z-20"
      } ${mode === "prompt" ? "opacity-95" : "opacity-100"}`}
      style={stageStyle}
      data-testid="glass-orb-scene"
      data-mode={mode}
      data-form={form}
      data-reaction={reaction?.kind ?? "none"}
      data-presence={presence}
      data-connected={connected}
      data-calligraphy-writing={calligraphyWriting}
      data-showcase={showcase}
    >
      <div
        ref={layoutMotionRef}
        className="masil-orb-layout-motion absolute inset-0"
      >
        <div ref={reactionRef} className="masil-orb-reaction absolute inset-0">
          <div className="masil-orb-life absolute inset-0">
            <canvas
              ref={canvasRef}
              className={`masil-orb-canvas block h-full w-full touch-none transition-[filter,opacity,transform] duration-[1200ms,360ms,1200ms] ease-[cubic-bezier(.16,1,.3,1)] ${visualFilter} ${
                status === "ready" ? "opacity-100" : "opacity-0"
              } ${calligraphyWriting ? "scale-[1.12]" : presence === "receiving" || presence === "listening" ? "scale-[1.025]" : "scale-100"}`}
              aria-label={connected ? copy.connectedLabel : copy.waitingLabel}
            />

            {status === "ready" ? (
              <div className="absolute inset-0 grid place-items-center">
                <span className="sr-only" role="status">
                  {connected
                    ? PRESENCE_LABELS[language][presence]
                    : copy.waitingStatus}
                </span>
              </div>
            ) : null}

            {status === "loading" ? (
              <p
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm tracking-[-0.01em] text-muted-foreground"
                role="status"
              >
                {copy.loading}
              </p>
            ) : null}

            {status === "error" ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <p className="max-w-sm text-base leading-7 text-muted-foreground">
                  {copy.error}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
