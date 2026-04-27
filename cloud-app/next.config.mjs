/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongoose", "mongodb-memory-server", "@node-rs/argon2"],
};

export default nextConfig;
