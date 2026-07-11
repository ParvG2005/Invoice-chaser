// Colors here follow InvoicePilot's own design system
// (docs/design/DESIGN_SYSTEM.md / the Stitch "InvoicePilot Analytics"
// screens), not the dataviz skill's default categorical palette: the app is
// near-monochrome zinc with red/emerald/amber reserved as sparse status
// accents (see the Stitch "Analytics - Stock" screen's two-tone dark/muted
// line pair + red-only "low stock" card). Two-series charts here use
// ink-vs-muted-gray rather than a hue pair, matching that convention.
export const CHART_COLORS = {
  inflow: "#18181b", // zinc-900 (--primary) — primary series / money coming in
  outflow: "#71717a", // zinc-500 (--muted-foreground) — secondary series / money going out
  neutral: "#a1a1aa", // zinc-400 — axes, gridlines
  positive: "#059669", // --success (emerald) — collected / good
  negative: "#ef4444", // --destructive (red) — overdue / low-stock / danger only
};

// Ordinal severity ramp for the receivables-aging donut: an escalating-risk
// scale (fresh → overdue), validated via the dataviz skill. Order carries the
// meaning, so it ships with direct bucket labels + a legend — identity is never
// color-alone. Keyed by AgingBucketLabel.
export const AGING_RAMP: Record<string, string> = {
  CURRENT: "#10b981", // emerald-500 — not yet due, healthy
  "0_30": "#f59e0b", // amber-500 — recently overdue
  "31_60": "#f97316", // orange-500
  "61_90": "#ef4444", // red-500
  "90_PLUS": "#b91c1c", // red-700 — worst
};
