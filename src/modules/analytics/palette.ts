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
