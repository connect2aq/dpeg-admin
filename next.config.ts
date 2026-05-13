import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  basePath: "/Admin",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/Admin",
  },
  trailingSlash: true,
};

export default nextConfig;
