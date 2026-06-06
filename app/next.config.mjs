/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["franc", "@vitalets/google-translate-api"],
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
