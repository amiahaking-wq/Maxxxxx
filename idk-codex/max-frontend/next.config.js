/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No rewrites — we use a catch-all API route (app/api/[...path]/route.ts)
  // that proxies all /api/* requests to the Express backend at runtime.
  // This works WITHOUT NEXT_PUBLIC_API_URL being set at build time.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://maxxxxx-production.up.railway.app',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  }
};

module.exports = nextConfig;
