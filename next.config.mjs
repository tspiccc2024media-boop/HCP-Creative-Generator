/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["fabric", "ag-psd"],
  images: {
    unoptimized: true
  }
};

export default nextConfig;
