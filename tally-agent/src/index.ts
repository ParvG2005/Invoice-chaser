import { loadConfig } from "./config.ts";
import { runSync } from "./run.ts";

const configPath = process.argv[2] ?? "config.json";
runSync(loadConfig(configPath))
  .then(() => { console.log("tally sync complete"); process.exit(0); })
  .catch((err) => { console.error("tally sync failed:", err.message); process.exit(1); });
