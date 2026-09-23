import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ワークスペースの TypeScript のパッケージをそのまま取り込む。
  transpilePackages: ["@app/shared", "@app/db", "@app/mail"],
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss", "pino"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
