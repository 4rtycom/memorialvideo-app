import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    '@memorialvideo/contracts',
    '@memorialvideo/domain',
    '@memorialvideo/config',
    '@memorialvideo/video',
    '@remotion/player',
    'remotion',
  ],
  // Remotion bundler pulls esbuild native binaries; keep them external so
  // Turbopack/Next does not try to parse README.md / bin/esbuild during build.
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    'esbuild',
    '@esbuild/linux-x64',
    '@esbuild/darwin-arm64',
    '@esbuild/darwin-x64',
    '@esbuild/win32-x64',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
