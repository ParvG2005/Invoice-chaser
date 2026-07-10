import { readFileSync } from "node:fs";

export interface AgentConfig {
  tallyHost: string;
  tallyPort: number;
  appUrl: string;
  apiKey: string;
  bypassSecret?: string;
  voucherFrom?: string;
  voucherTo?: string;
}

export function loadConfig(path: string): AgentConfig {
  const c = JSON.parse(readFileSync(path, "utf8")) as AgentConfig;
  for (const field of ["tallyHost", "tallyPort", "appUrl", "apiKey"] as const) {
    if (!c[field]) throw new Error(`config missing ${field}`);
  }
  return c;
}
