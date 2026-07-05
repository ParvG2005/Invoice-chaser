// Validated colors from the dataviz skill's reference palette
// (references/palette.md) — blue/red is the skill's diverging pair, used
// here for the inflow/outflow polarity; aqua/gray fill the remaining
// categorical + neutral roles.
export const CHART_COLORS = {
  inflow: "#2a78d6", // categorical slot 1 (blue) — money coming in / receivable series
  outflow: "#e34948", // categorical slot 6 (red) — money going out / payable series
  neutral: "#898781", // muted ink — axes, gridlines, secondary marks
  positive: "#0ca30c", // status: good
  negative: "#d03b3b", // status: critical
};
