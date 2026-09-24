import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss"],
  async headers() {
    // L3: private pages are never cached by browsers or proxies (ownership checks are the real protection).
    const privateNoStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/chart/:path*", "/order/:path*", "/r/:path*", "/refund/:path*", "/checkout/:path*", "/admin/:path*", "/admin", "/login/:path*", "/login", "/my"].map((source) => ({ source, headers: privateNoStore })),
    ];
  },
};

export default nextConfig;
