import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@hashgraph/sdk"],
  // Turbopack config (Next.js 16 default)
  turbopack: {},
};

export default nextConfig;
