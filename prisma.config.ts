import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 removed `url`/`directUrl` from the `datasource` block in
// schema.prisma. The Prisma CLI (schema engine — `migrate`, `db push`,
// `validate`, etc.) now reads the connection string for migrations from
// this config file. Migrations must run against the direct (non-pooled)
// connection, matching the old `directUrl` behavior.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
