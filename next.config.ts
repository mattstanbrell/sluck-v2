import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable image optimization for avatar URLs from Google
  images: {
    domains: [
      'lh3.googleusercontent.com', // Google OAuth avatar URLs
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}`.replace('https://', ''), // Supabase Storage URLs
    ],
  },
};

export default nextConfig;
