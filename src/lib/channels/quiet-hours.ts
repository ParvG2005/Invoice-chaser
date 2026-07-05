import { addMinutes } from "date-fns";

export interface QuietHoursConfig {
  quietHoursStart: string | null; // "HH:mm" in the org's timezone
  quietHoursEnd: string | null;
  timezone: string; // IANA name, e.g. "Asia/Kolkata"
}

function minutesOfDayInTz(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Returns `now` if sending is allowed, otherwise the moment the quiet window ends. */
export function nextAllowedSendTime(now: Date, cfg: QuietHoursConfig): Date {
  if (!cfg.quietHoursStart || !cfg.quietHoursEnd) return now;
  const start = parseHm(cfg.quietHoursStart);
  const end = parseHm(cfg.quietHoursEnd);
  if (start === end) return now; // degenerate config = no quiet hours

  const current = minutesOfDayInTz(now, cfg.timezone);
  const inQuiet = start < end ? current >= start && current < end : current >= start || current < end;
  if (!inQuiet) return now;

  const minutesUntilEnd = (end - current + 24 * 60) % (24 * 60);
  return addMinutes(now, minutesUntilEnd);
}
