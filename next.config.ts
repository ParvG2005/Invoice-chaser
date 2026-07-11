import type { NextConfig } from "next";
import path from "path";

// No custom domain yet (see docs/setup/PROVISIONING.md "Auth — Clerk production
// instance") — Clerk runs on its dev instance `refined-collie-21.clerk.accounts.dev`
// in every environment, including the deployed Worker. Update this once a real
// domain + Clerk production instance land (Phase 7 Task 3).
const CLERK_ORIGINS = "https://*.clerk.accounts.dev";

// React's dev build + Turbopack use eval() for fast refresh / callstack
// reconstruction, which CSP blocks without 'unsafe-eval'. Scope it to
// development only so production keeps the stricter policy (React never uses
// eval in production builds).
const DEV_SCRIPT_SRC = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next.js inline runtime scripts and Clerk;
  // revisit with nonces if we later adopt next/script strict mode.
  `script-src 'self' 'unsafe-inline'${DEV_SCRIPT_SRC} ${CLERK_ORIGINS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://img.clerk.com",
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK_ORIGINS} wss://*.clerk.accounts.dev`,
  `frame-src ${CLERK_ORIGINS}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["pg"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
