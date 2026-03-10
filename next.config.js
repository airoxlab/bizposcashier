/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

const nextConfig = {
  images: {
    domains: ['gmmjefeojrpazhacqihk.supabase.co'],
    unoptimized: true,
  },

  // Only use static export in production
  ...(isDev ? {} : {
    output: 'export',
    distDir: 'out',
  }),

  trailingSlash: true,

  // Use a relative asset prefix only in production static-export builds.
  assetPrefix: isDev ? '' : './',

  // Development optimizations
  ...(isDev ? {
    // Faster refresh in development
    reactStrictMode: false,

    // Optimize webpack for faster dev builds
    webpack: (config, { dev }) => {
      if (dev) {
        // Disable source maps in development for faster builds
        config.devtool = 'eval';

        // Optimize for faster rebuilds
        config.optimization = {
          ...config.optimization,
          removeAvailableModules: false,
          removeEmptyChunks: false,
          splitChunks: false,
        };

        // Reduce the number of files webpack watches
        config.watchOptions = {
          ...config.watchOptions,
          ignored: /node_modules/,
          aggregateTimeout: 300,
        };
      }
      return config;
    },
  } : {
    reactStrictMode: true,
  }),

  // Skip type checking and linting during dev for speed
  typescript: {
    ignoreBuildErrors: isDev,
  },
  eslint: {
    ignoreDuringBuilds: isDev,
  },
}

module.exports = nextConfig
