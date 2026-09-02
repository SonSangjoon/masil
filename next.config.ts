import { createRequire } from "node:module";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);
const wgslLoader = require.resolve("@vgpu/wgsl/loader-webpack");

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "vgpu",
    "@vgpu/core",
    "@vgpu/wgsl",
    "@vgpu/wgsl-std",
    "@vgpu/adapter-mock",
    "@vgpu/adapter-node",
  ],
  turbopack: {
    rules: {
      "*.wgsl": {
        loaders: [wgslLoader],
        as: "*.js",
      },
    },
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.wgsl$/,
      use: [wgslLoader],
    });
    return config;
  },
};

export default nextConfig;
