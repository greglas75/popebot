/**
 * Next.js config wrapper for thepopebot.
 * Enables instrumentation hook for cron scheduling on server start.
 *
 * Usage in user's next.config.mjs:
 *   import { withThepopebot } from 'thepopebot/config';
 *   export default withThepopebot({});
 *
 * @param {Object} nextConfig - User's Next.js config
 * @returns {Object} Enhanced Next.js config
 */
export function withThepopebot(nextConfig = {}) {
  return {
    ...nextConfig,
    distDir: process.env.NEXT_BUILD_DIR || '.next',
    transpilePackages: [
      'thepopebot',
      ...(nextConfig.transpilePackages || []),
    ],
serverExternalPackages: [
      ...(nextConfig.serverExternalPackages || []),
      'better-sqlite3',
      'drizzle-orm',
    ],
    async headers() {
      const userHeaders = nextConfig.headers ? await nextConfig.headers() : [];
      return [
        ...userHeaders,
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ],
        },
      ];
    },
  };
}
