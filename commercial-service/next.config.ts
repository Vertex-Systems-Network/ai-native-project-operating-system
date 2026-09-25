import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/v1/template/archive": ["./vendor-release/**/*"],
    "/api/v1/releases/current": ["./vendor-release/template/EXPORT-MANIFEST.json"],
    "/mcp": ["./vendor-release/**/*"],
  },
};

export default nextConfig;
