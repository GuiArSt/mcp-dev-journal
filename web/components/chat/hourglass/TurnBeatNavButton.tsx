"use client";

import { type ReactNode, useMemo } from "react";
import { useTurnNavPress } from "@/lib/hooks/useTurnNavPress";

interface TurnBeatNavButtonProps {
  direction: "up" | "down";
  label: string;
  disabled?: boolean;
  onStep: () => void;
  onCharged?: () => void;
  children: ReactNode;
  className?: string;
}

const CHARGE_RADIUS = 17;
const CHARGE_CIRC = 2 * Math.PI * CHARGE_RADIUS;

export function TurnBeatNavButton({
  direction,
  label,
  disabled,
  onStep,
  onCharged,
  children,
  className = "",
}: TurnBeatNavButtonProps) {
  const nav = useTurnNavPress({
    onStep,
    onCharged,
  });

  const chargeOffset = useMemo(
    () => CHARGE_CIRC * (1 - nav.progress),
    [nav.progress],
  );

  const chargeHint = onCharged
    ? ` — hold 1.5s to jump to the ${direction === "up" ? "first" : "latest"} beat`
    : "";

  const showRing = onCharged && (nav.charging || nav.progress > 0 || nav.chargedFlash);

  return (
    <button
      type="button"
      className={[
        "hg-edge-nav-btn",
        `hg-edge-nav-btn-${direction}`,
        showRing ? "hg-edge-nav-charging" : "",
        nav.chargedFlash ? "hg-edge-nav-charged" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={`${label}${chargeHint}`}
      aria-label={label}
      disabled={disabled}
      {...nav.bind()}
    >
      {showRing && (
        <svg
          className="hg-edge-nav-charge-ring"
          viewBox="0 0 38 38"
          aria-hidden
        >
          <circle
            className="hg-edge-nav-charge-track"
            cx="19"
            cy="19"
            r={CHARGE_RADIUS}
            fill="none"
          />
          <circle
            className="hg-edge-nav-charge-fill"
            cx="19"
            cy="19"
            r={CHARGE_RADIUS}
            fill="none"
            strokeDasharray={CHARGE_CIRC}
            strokeDashoffset={chargeOffset}
          />
        </svg>
      )}
      <span className="hg-edge-nav-icon">{children}</span>
    </button>
  );
}
