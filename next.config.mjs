const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "";

// CSP construída a partir dos domínios externos que o app realmente injeta:
// Turnstile (captcha em /register, /login, /forgot-password), SDK JS da Meta
// (Embedded Signup) e o próprio projeto Supabase (REST + Realtime). A Cakto é
// só redirect de página inteira (window.location) — não precisa de allowlist.
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

export default nextConfig;
