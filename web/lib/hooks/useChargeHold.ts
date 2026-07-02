"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHARGE_MS = 1500;

export function useChargeHold(onCharged: () => void, chargeMs = CHARGE_MS) {
  const onChargedRef = useRef(onCharged);
  const rafRef = useRef<number | null>(null);
  const startAtRef = useRef(0);
  const firedRef = useRef(false);
  const activeRef = useRef(false);

  const [progress, setProgress] = useState(0);
  const [chargedFlash, setChargedFlash] = useState(false);

  onChargedRef.current = onCharged;

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(0);
    firedRef.current = false;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    activeRef.current = true;
    startAtRef.current = performance.now();

    const tick = (now: number) => {
      if (!activeRef.current) return;
      const p = Math.min(1, (now - startAtRef.current) / chargeMs);
      setProgress(p);

      if (p >= 1 && !firedRef.current) {
        firedRef.current = true;
        setChargedFlash(true);
        onChargedRef.current();
        window.setTimeout(() => setChargedFlash(false), 360);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [chargeMs, stop]);

  const charging = progress > 0 && progress < 1;

  return { progress, charging, chargedFlash, start, stop };
}
