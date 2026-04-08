# config/ — Next.js Config Wrapper

## Next.js Config Wrapper (index.js)

`withThepopebot()` wraps user's `next.config.mjs`. Adds `transpilePackages` and `serverExternalPackages` for the npm package's dependencies that need special bundling.

## Instrumentation (instrumentation.js)

Server startup hook loaded by Next.js. Sequence: loads `.env`, initializes database, starts cron scheduler, starts cluster runtime. Skipped during `next build` (checks `NEXT_PHASE`).
