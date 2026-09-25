import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (see Dockerfile).
  output: "standalone",
  // messages/ is read at runtime by the i18n loader; make sure it ships with server bundles.
  outputFileTracingIncludes: { "/**/*": ["./messages/**/*"] },
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
