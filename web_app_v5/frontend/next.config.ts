import type { NextConfig } from "next";

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8333').replace(/\/$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
      {
        source: "/stream/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
