import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";
const dev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. The app self-hosts everything (next/font, no external
 * scripts or styles), so production locks scripts and styles to same-origin.
 * Dev needs 'unsafe-eval' and a websocket for Turbopack HMR, and Next injects
 * inline bootstrap styles, so those are allowed only in dev.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' allows Next's framework hydration scripts. Upgrading to a
  // nonce-based 'strict-dynamic' policy is the next hardening step; it needs the
  // next-intl middleware reworked and every page forced to dynamic rendering.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind and inline style attributes (widths, flex-grow)
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws:" : ""}`, // HMR socket in dev
  "frame-ancestors 'none'", // clickjacking: the app is never framed
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Tells browsers to stay on HTTPS. Ignored over http (localhost), safe to send.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // The browser talks to the API through /api on this origin, so the session
  // cookie stays first-party and no CORS is needed.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
