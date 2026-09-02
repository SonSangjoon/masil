"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type TransitionActivity = "calligraphy" | "janggi";

const WORLD_TRANSITION_DURATION_MS = 1840;
const WORLD_TRANSITION_SWAP_PROGRESS = 0.59;

export interface MasilWorldTransitionHandle {
  play(activity: TransitionActivity, onCovered: () => void): Promise<void>;
  cancel(): void;
}

type MasilWorldTransitionProps = {
  readonly onProgress?: (progress: number) => void;
};

/**
 * Coordinates the shared Orb hand-off without adding a second visual layer.
 *
 * The Orb remains the only transition surface. The activity swaps once it has
 * travelled far enough toward its destination, while the current page stays
 * visible underneath. This also keeps the disconnected demo path honest:
 * connection state changes the Orb's appearance, not the transition model.
 */
export const MasilWorldTransition = forwardRef<
  MasilWorldTransitionHandle,
  MasilWorldTransitionProps
>(function MasilWorldTransition({ onProgress }, forwardedRef) {
  const onProgressRef = useRef(onProgress);
  const frameRef = useRef(0);
  const resolveRef = useRef<(() => void) | null>(null);
  const onSwapRef = useRef<(() => void) | null>(null);
  const swappedRef = useRef(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const cancelAnimation = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }

    if (onSwapRef.current && !swappedRef.current) {
      swappedRef.current = true;
      onSwapRef.current();
    }

    const resolve = resolveRef.current;
    resolveRef.current = null;
    onSwapRef.current = null;
    swappedRef.current = false;
    onProgressRef.current?.(0);
    resolve?.();
  }, []);

  const play = useCallback(
    async (_activity: TransitionActivity, onSwap: () => void) => {
      cancelAnimation();
      onProgressRef.current?.(0);
      onSwapRef.current = onSwap;
      swappedRef.current = false;
      const startedAt = performance.now();

      await new Promise<void>((resolve) => {
        resolveRef.current = resolve;

        const animate = (time: number) => {
          frameRef.current = 0;
          const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          const duration = reducedMotion ? 260 : WORLD_TRANSITION_DURATION_MS;
          const progress = Math.min(
            1,
            Math.max(0, (time - startedAt) / duration),
          );

          if (
            !swappedRef.current &&
            progress >= WORLD_TRANSITION_SWAP_PROGRESS
          ) {
            swappedRef.current = true;
            onSwapRef.current?.();
          }

          onProgressRef.current?.(progress);
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(animate);
            return;
          }

          onSwapRef.current = null;
          resolveRef.current = null;
          swappedRef.current = false;
          onProgressRef.current?.(1);
          resolve();
        };

        frameRef.current = requestAnimationFrame(animate);
      });
    },
    [cancelAnimation],
  );

  const cancel = useCallback(() => {
    cancelAnimation();
  }, [cancelAnimation]);

  useImperativeHandle(forwardedRef, () => ({ play, cancel }), [cancel, play]);

  return null;
});
