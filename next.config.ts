import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, Next can pick up an
  // unrelated lockfile higher up the filesystem (e.g. ~/package-lock.json).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
