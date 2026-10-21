/** @type {import('next').NextConfig} */
// The browser only ever talks to this origin; /api/* is proxied to the NestJS API.
// That keeps the httpOnly session cookies first-party and the API's CSRF Origin check satisfied.
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};
export default nextConfig;
