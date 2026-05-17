import type { SVGProps } from "react";

export function HourglassSpinner(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 44 44" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 6 L32 6 L32 10 Q32 14 28 18 L22 22 L16 18 Q12 14 12 10 Z" />
      <path d="M12 38 L32 38 L32 34 Q32 30 28 26 L22 22 L16 26 Q12 30 12 34 Z" />
      <line x1="10" y1="6" x2="34" y2="6" />
      <line x1="10" y1="38" x2="34" y2="38" />
      <g className="hg-grains">
        <circle cx="22" cy="24" r="0.8" />
        <circle cx="21" cy="26" r="0.6" />
        <circle cx="23" cy="25" r="0.7" />
        <circle cx="22" cy="28" r="0.5" />
      </g>
    </svg>
  );
}
