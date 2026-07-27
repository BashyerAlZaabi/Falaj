import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // مصادر الصور الخارجية (خرائط Leaflet وغيرها) تُضاف عند الحاجة في مراحل لاحقة.
};

export default nextConfig;
