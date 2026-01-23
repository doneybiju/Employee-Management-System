/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_BASE
          ? `${process.env.NEXT_PUBLIC_API_BASE}/api/:path*`
          : 'http://localhost:4000/api/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
