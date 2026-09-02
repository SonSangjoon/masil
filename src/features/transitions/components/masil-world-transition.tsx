"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type {
  TransitionActivity,
  WorldTransitionRenderer,
} from "@/features/transitions/runtime/renderer";

export interface MasilWorldTransitionHandle {
  play(activity: TransitionActivity, onCovered: () => void): Promise<void>;
  cancel(): void;
}

export const MasilWorldTransition = forwardRef<
  MasilWorldTransitionHandle,
  { readonly inert?: never }
>(function MasilWorldTransition(_props, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WorldTransitionRenderer | null>(null);
  const [active, setActive] = useState(false);
  const [activity, setActivity] = useState<TransitionActivity>("calligraphy");

  useEffect(() => {
    let cancelled = false;
    let renderer: WorldTransitionRenderer | null = null;

    const start = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas || !navigator.gpu) return;
        const { createWorldTransitionRenderer } = await import(
          "@/features/transitions/runtime/renderer"
        );
        if (cancelled) return;
        renderer = createWorldTransitionRenderer(canvas);
        rendererRef.current = renderer;
        await renderer.ready;
        if (process.env.NODE_ENV !== "production") {
          const query = new URLSearchParams(window.location.search);
          const previewActivity = query.get("transition-preview");
          const previewProgress = Number(query.get("transition-progress"));
          if (
            (previewActivity === "calligraphy" ||
              previewActivity === "janggi") &&
            Number.isFinite(previewProgress)
          ) {
            setActivity(previewActivity);
            setActive(true);
            await renderer.preview(previewActivity, previewProgress);
          }
        }
      } catch (error) {
        console.error("MASIL world transition could not start", error);
      }
    };

    void start();
    return () => {
      cancelled = true;
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, []);

  const play = useCallback(
    async (nextActivity: TransitionActivity, onCovered: () => void) => {
      setActivity(nextActivity);
      setActive(true);
      const renderer = rendererRef.current;
      if (!renderer) {
        onCovered();
        setActive(false);
        return;
      }
      try {
        await renderer.play(nextActivity, onCovered);
      } finally {
        setActive(false);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    rendererRef.current?.cancel();
    setActive(false);
  }, []);

  useImperativeHandle(forwardedRef, () => ({ play, cancel }), [cancel, play]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[90] transition-opacity duration-75 ${
        active ? "opacity-100" : "opacity-0"
      }`}
      data-active={active}
      data-activity={activity}
      data-testid="masil-world-transition"
      aria-hidden={!active}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-label={
          activity === "calligraphy"
            ? "Orb가 서예 공간으로 펼쳐지는 중"
            : "Orb가 장기 공간으로 펼쳐지는 중"
        }
      />
      {active ? (
        <span className="sr-only" role="status">
          {activity === "calligraphy"
            ? "서예 공간을 만들고 있어요"
            : "장기 공간을 만들고 있어요"}
        </span>
      ) : null}
    </div>
  );
});
