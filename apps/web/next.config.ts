import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // API_BASE_URL is read on the server only. There is no NEXT_PUBLIC_ variable
  // in this app, and that is deliberate: the browser never learns where the
  // API is, and never holds anything it could call the API with.
  experimental: { typedRoutes: false },
  eslint: { ignoreDuringBuilds: true },
};

export default config;
