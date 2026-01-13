import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable server-side features
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Output standalone for Docker deployment
  output: "standalone",
  // Allow cross-origin requests from local network devices
  allowedDevOrigins: [
    "http://192.168.1.40:3000",
    "http://192.168.1.*:3000",
    "http://localhost:3000",
  ],
};

export default nextConfig;
