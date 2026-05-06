/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.0.70"],
  serverExternalPackages: ["mongoose", "mongodb-memory-server", "@node-rs/argon2"],
};

export default nextConfig;
