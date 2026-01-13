/**
 * Unified Design System for Kronus Config Popovers
 *
 * A consistent, elegant visual language for Soul, Tools, Model, and Format configs.
 * Inspired by Tartarus palette with mythological aesthetic.
 */

// ============================================================================
// TARTARUS PALETTE
// ============================================================================

export const TARTARUS = {
  // Backgrounds
  void: "#050508",        // Deepest black - the void
  abyss: "#0a0a0f",       // Primary background
  surface: "#12121a",     // Elevated surface
  elevated: "#1a1a24",    // Cards, items

  // Borders & Lines
  border: "#2a2a3a",      // Standard border
  borderSubtle: "#1f1f2a", // Subtle dividers
  borderAccent: "#3a3a4a", // Hover borders

  // Text
  text: "#e8e6e3",        // Primary text
  textMuted: "#888899",   // Secondary text
  textDim: "#666677",     // Tertiary text

  // Accent Colors
  teal: "#00CED1",        // Primary accent - cyan glow
  tealDim: "#008B8B",     // Muted teal
  tealGlow: "rgba(0, 206, 209, 0.15)", // Teal background glow

  gold: "#D4AF37",        // Warning, premium
  goldGlow: "rgba(212, 175, 55, 0.15)",

  purple: "#9B59B6",      // Special features
  purpleGlow: "rgba(155, 89, 182, 0.15)",

  // Provider Colors
  google: "#4285F4",
  anthropic: "#D97706",
  openai: "#10A37F",

  // Status
  success: "#22c55e",
  warning: "#eab308",
  error: "#E74C3C",
} as const;

// ============================================================================
// SHARED STYLES
// ============================================================================

/**
 * Popover container styles - consistent across all configs
 */
export const popoverStyles = {
  container: {
    backgroundColor: TARTARUS.abyss,
    border: `1px solid ${TARTARUS.border}`,
    color: TARTARUS.text,
    backdropFilter: "blur(12px)",
  },
  inner: {
    backgroundColor: TARTARUS.abyss,
  },
} as const;

/**
 * Header styles for config popovers
 */
export const headerStyles = {
  title: {
    fontWeight: 600,
    color: TARTARUS.text,
    fontSize: "14px",
    letterSpacing: "0.01em",
  },
  subtitle: {
    fontSize: "12px",
    color: TARTARUS.textMuted,
    marginTop: "2px",
  },
  actionButton: {
    fontSize: "11px",
    padding: "4px 8px",
    color: TARTARUS.textMuted,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: "4px",
    transition: "all 0.15s ease",
  },
} as const;

/**
 * Section divider with label
 */
export const sectionStyles = {
  divider: {
    borderTop: `1px solid ${TARTARUS.borderSubtle}`,
    paddingTop: "12px",
    marginTop: "12px",
  },
  label: {
    fontSize: "10px",
    color: TARTARUS.textDim,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 500,
    marginBottom: "10px",
  },
} as const;

/**
 * Toggle row styles (for switches)
 */
export const toggleRowStyles = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 10px",
    borderRadius: "8px",
    transition: "background 0.15s ease",
    cursor: "pointer",
  },
  containerHover: {
    background: TARTARUS.surface,
  },
  icon: {
    width: "18px",
    height: "18px",
    flexShrink: 0,
  },
  labelContainer: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    transition: "color 0.15s ease",
  },
  description: {
    fontSize: "11px",
    color: TARTARUS.textMuted,
    marginTop: "1px",
  },
  badge: {
    fontSize: "11px",
    color: TARTARUS.textDim,
    fontFamily: "monospace",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: TARTARUS.surface,
  },
} as const;

/**
 * Card/Button styles for selectable items
 */
export const cardStyles = {
  base: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: `1px solid ${TARTARUS.border}`,
    backgroundColor: "transparent",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s ease",
    width: "100%",
  },
  selected: (accentColor: string) => ({
    backgroundColor: `${accentColor}10`,
    borderColor: `${accentColor}40`,
  }),
  hover: {
    backgroundColor: TARTARUS.surface,
    borderColor: TARTARUS.borderAccent,
  },
} as const;

/**
 * Footer/Summary section styles
 */
export const footerStyles = {
  container: {
    paddingTop: "12px",
    borderTop: `1px solid ${TARTARUS.borderSubtle}`,
    marginTop: "12px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "12px",
  },
  label: {
    color: TARTARUS.textMuted,
  },
  value: {
    fontFamily: "monospace",
    fontWeight: 500,
  },
  note: {
    fontSize: "11px",
    color: TARTARUS.textDim,
    marginTop: "8px",
    fontStyle: "italic" as const,
  },
} as const;

/**
 * Switch styles (custom colors based on state)
 */
export const switchStyles = {
  off: {
    backgroundColor: TARTARUS.surface,
  },
  on: (color: string = TARTARUS.teal) => ({
    backgroundColor: color,
  }),
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format large numbers with k suffix
 */
export function formatNumber(num: number | undefined | null): string {
  if (num == null || isNaN(num)) {
    return "0";
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}k`;
  }
  return `${num}`;
}

/**
 * Get accent color based on enabled state
 */
export function getAccentColor(enabled: boolean, accentColor: string = TARTARUS.teal): string {
  return enabled ? accentColor : TARTARUS.textDim;
}

/**
 * Generate glow effect CSS
 */
export function glowEffect(color: string, intensity: number = 0.15): string {
  return `0 0 20px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`;
}
