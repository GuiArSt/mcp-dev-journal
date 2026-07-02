"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TurnNavPressOptions = {
  onStep: () => void;
  onCharged?: () => void;
  chargeMs?: number;
  tapThresholdMs?: number;
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
};

/**
 * Tap = one beat step. Hold = repeat skim. Full charge = jump (onCharged).
 * Repeat is cancelled when charge completes so a long hold does not fight the jump.
 */
export function useTurnNavPress({
  onStep,
  onCharged,
  chargeMs = 1500,
  tapThresholdMs = 280,
  repeatDelayMs = 400,
  repeatIntervalMs = 140,
}: TurnNavPressOptions) {
  const onStepRef = useRef(onStep);
  const onChargedRef = useRef(onCharged);
  const repeatDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chargeRafRef = useRef<number | null>(null);
  const chargeStartRef = useRef(0);
  const pointerDownAtRef = useRef(0);
  const chargedRef = useRef(false);
  const activeRef = useRef(false);

  const [progress, setProgress] = useState(0);
  const [chargedFlash, setChargedFlash] = useState(false);

  onStepRef.current = onStep;
  onChargedRef.current = onCharged;

  const clearRepeat = useCallback(() => {
    if (repeatDelayRef.current != null) {
      clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    if (repeatIntervalRef.current != null) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  const stopCharge = useCallback(() => {
    activeRef.current = false;
    if (chargeRafRef.current != null) {
      cancelAnimationFrame(chargeRafRef.current);
      chargeRafRef.current = null;
    }
    setProgress(0);
  }, []);

  const stopAll = useCallback(() => {
    clearRepeat();
    stopCharge();
    chargedRef.current = false;
  }, [clearRepeat, stopCharge]);

  useEffect(() => stopAll, [stopAll]);

  const bind = useCallback(() => {
    const startCharge = () => {
      if (!onChargedRef.current) return;
      stopCharge();
      activeRef.current = true;
      chargeStartRef.current = performance.now();

      const tick = (now: number) => {
        if (!activeRef.current) return;
        const p = Math.min(1, (now - chargeStartRef.current) / chargeMs);
        setProgress(p);

        if (p >= 1 && !chargedRef.current) {
          chargedRef.current = true;
          clearRepeat();
          setChargedFlash(true);
          onChargedRef.current?.();
          window.setTimeout(() => setChargedFlash(false), 360);
          return;
        }

        chargeRafRef.current = requestAnimationFrame(tick);
      };

      chargeRafRef.current = requestAnimationFrame(tick);
    };

    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
        chargedRef.current = false;
        pointerDownAtRef.current = performance.now();
        startCharge();
        clearRepeat();
        repeatDelayRef.current = setTimeout(() => {
          if (chargedRef.current) return;
          repeatIntervalRef.current = setInterval(() => {
            if (chargedRef.current) return;
            onStepRef.current();
          }, repeatIntervalMs);
        }, repeatDelayMs);
      },
      onPointerUp: () => {
        const held = performance.now() - pointerDownAtRef.current;
        const wasCharged = chargedRef.current;
        clearRepeat();
        stopCharge();
        if (!wasCharged && held < tapThresholdMs) {
          onStepRef.current();
        }
        chargedRef.current = false;
      },
      onPointerLeave: () => {
        clearRepeat();
        stopCharge();
        chargedRef.current = false;
      },
      onPointerCancel: () => {
        clearRepeat();
        stopCharge();
        chargedRef.current = false;
      },
    };
  }, [chargeMs, clearRepeat, repeatDelayMs, repeatIntervalMs, stopCharge, tapThresholdMs]);

  const charging = progress > 0 && progress < 1;

  return { bind, progress, charging, chargedFlash };
}
