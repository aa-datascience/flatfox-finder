/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flatfox.ch",
        pathname: "/thumb/**",
      },
    ],
  },
};

export default nextConfig;
