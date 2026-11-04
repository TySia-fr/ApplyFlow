import type { NextConfig } from "next";

/**
 * CSP note: Next.js streams RSC payloads in inline <script> tags, so a strict
 * script-src needs per-request nonces, which would make every page dynamic.
 * This policy allows 'unsafe-inline' scripts but nothing external; React
 * escapes all rendered user content, and no user HTML is ever injected.
 * Documented as a known limitation in docs/SECURITY.md.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Only two small static screenshots: serving them as-is avoids a native
  // image dependency (sharp) and runtime cache writes in a read-only container.
  images: { unoptimized: true },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Uploads go through a Server Action; 10 MB file + form overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/sign-in", destination: "/en/sign-in", permanent: false },
      { source: "/sign-up", destination: "/en/sign-up", permanent: false },
    ];
  },
};

export default nextConfig;
