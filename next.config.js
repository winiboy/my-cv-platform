/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    return config; // ensures Webpack is used
  },
};

module.exports = nextConfig;
