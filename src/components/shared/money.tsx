const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | string, currency = "INR"): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, fmt);
  }
  return fmt.format(typeof amount === "string" ? Number(amount) : amount);
}

export function Money({ amount, currency = "INR" }: { amount: number | string; currency?: string }) {
  return <span className="tabular-nums">{formatMoney(amount, currency)}</span>;
}
