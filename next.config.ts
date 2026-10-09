import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['*.e2b.app'],
  poweredByHeader: false,
};
export default config;
