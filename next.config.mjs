import { withSentryConfig } from "@sentry/nextjs";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "";

// CSP construída a partir dos domínios externos que o app realmente injeta:
// Turnstile (captcha em /register, /login, /forgot-password), SDK JS da Meta
// (Embedded Signup) e o próprio projeto Supabase (REST + Realtime).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Turnstile usa subdomínios internos além de challenges.cloudflare.com
  // (ex.: hagen.challenges.cloudflare.com) para partes do desafio — sem o
  // wildcard, essas chamadas ficam bloqueadas e o widget nunca resolve
  // (falha silenciosa: não aparece como violação de CSP no console, só como
  // request abortado).
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://connect.facebook.net`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https:`,
  `font-src 'self' data:`,
  `frame-src https://challenges.cloudflare.com`,
  `connect-src 'self' https://challenges.cloudflare.com https://*.challenges.cloudflare.com https://connect.facebook.net https://graph.facebook.com${
    supabaseHost ? ` https://${supabaseHost} ${supabaseWs}` : ""
  }`,
]
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "pixelpage-chat",

  project: "pixelpage-chat",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
