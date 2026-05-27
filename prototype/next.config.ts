import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/prototype/soi/crew-chief',
        destination: '/prototype/soi/operations/dispatch',
        permanent: true,
      },
      {
        source: '/prototype/soi/operations-monitor',
        destination: '/prototype/soi/dashboard',
        permanent: true,
      },
      {
        source: '/prototype/soi/readiness',
        destination: '/prototype/soi/workforce',
        permanent: true,
      },
      {
        source: '/prototype/soi/manager',
        destination: '/prototype/soi/dashboard',
        permanent: true,
      },
      {
        source: '/prototype/soi/manager/gate/:path*',
        destination: '/prototype/soi/dashboard',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
