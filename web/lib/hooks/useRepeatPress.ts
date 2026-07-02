"use client";

import { useCallback, useEffect, useRef } from "react";

type RepeatPressOptions = {
  /** Ms before repeat starts after first press */
  initialDelayMs?: number;
  /** Ms between repeats while held */
  intervalMs?: number;
};

/**
 * Pointer-down fires once immediately; holding repeats `onStep` until release.
 */
export function useRepeatPress(onStep: () => void, options?: RepeatPressOptions) {
  const onStepRef = useRef(onStep);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  onStepRef.current = onStep;

  const clear = useCallback(() => {
    if (delayRef.current != null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const bind = useCallback(() => {
    const initialDelayMs = options?.initialDelayMs ?? 380;
    const intervalMs = options?.intervalMs ?? 140;

    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
        onStepRef.current();
        clear();
        delayRef.current = setTimeout(() => {
          intervalRef.current = setInterval(() => onStepRef.current(), intervalMs);
        }, initialDelayMs);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    };
  }, [clear, options?.initialDelayMs, options?.intervalMs]);

  return bind;
}
