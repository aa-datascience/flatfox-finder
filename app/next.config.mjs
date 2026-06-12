/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. In dev, Next's HMR needs 'unsafe-eval'; we also allow
// 'unsafe-inline' for scripts because the app doesn't use nonce-based CSP yet
// (a stricter follow-up). The remaining directives still meaningfully limit
// framing, plugins, base-uri hijacking, and where content/connections can go.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://flatfox.ch data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  // OpenStreetMap embed on the match-detail page.
  "frame-src https://www.openstreetmap.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  transpilePackages: ["franc", "@vitalets/google-translate-api"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flatfox.ch",
        pathname: "/thumb/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
