import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google OAuth avatar URLs
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: `${process.env.NEXT_PUBLIC_SUPABASE_URL}`.replace('https://', ''),
        pathname: '/**', // Adjust this path as necessary
      },
    ],
  },
};

export default nextConfig;
