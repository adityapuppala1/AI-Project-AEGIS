import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Only the version is read from package.json, so the dependency list can never reach the browser (lib/version.ts).
const version: string | undefined = (() => { try { return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version; } catch { return undefined; } })();

// Headers for every response. Pages get their Content-Security-Policy (with a per-request nonce) from middleware.ts
// and lib/csp.ts; API responses are data, so they get the strictest possible policy here.
const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // Only the version is exposed to the browser (lib/version.ts), never the dependency list.
  env: version ? { NEXT_PUBLIC_APP_VERSION: version } : {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Honoured by browsers only over HTTPS; harmless on a local http exercise node.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
};

export default config;
