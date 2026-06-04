/** @type {import('next').NextConfig} */
const nextConfig = {
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
