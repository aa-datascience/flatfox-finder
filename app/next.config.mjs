import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the single root-level .env so /app and /worker share one config source.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Flatfox serves listing images from flatfox.ch as signed /thumb/... URLs.
    remotePatterns: [
      { protocol: "https", hostname: "flatfox.ch", pathname: "/thumb/**" },
    ],
  },
};

export default nextConfig;
