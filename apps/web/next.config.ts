import type { NextConfig } from 'next';

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  // Map tiles for the Suppliers map (loaded as <img> by Leaflet).
  "img-src 'self' data: blob: https://*.clerk.accounts.dev https://*.clerk.com https://img.clerk.com https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@mf/db', '@mf/ledger'],
  serverExternalPackages: ['pg'],
  async headers() {
    return [
      { source: '/(.*)', headers: SECURITY_HEADERS },
      // Sources registry: the stored document is rendered inside an <iframe> on its own source page.
      {
        source: '/farm/sources/:id/file',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: CSP_DIRECTIVES.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
        ],
      },
      // Compare dictates an instruction through the Web Speech API on this one route.
      {
        source: '/farm/production-planning/compare',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' }],
      },
    ];
  },
};

export default nextConfig;
