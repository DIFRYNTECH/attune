# Backend API Modularization Phase 1

## Goal

Extract cross-cutting API concerns out of `server/index.js` while preserving every route, status code, response shape, and logging event name.

This phase intentionally avoids moving the large AI and billing route handlers. It creates the stable module boundaries those extractions will use next.

## Existing Work To Preserve

- The production-readiness changes already in the working tree are not part of this phase and must not be reverted.
- The awaited AI usage finalization changes in `server/index.js` must remain intact.
- The deleted unused Stripe billing helper must remain deleted.

## Tasks

1. Add tests for new pure/server utility module contracts.
   - `server/lib/cache.test.js` covers TTL cache misses, hits, expiry, and bounded eviction.
   - `server/config.test.js` covers server config defaults and environment overrides.

2. Extract configuration.
   - Create `server/config.js`.
   - Move environment parsing for port, app env, OpenAI model settings, Supabase keys, Upstash keys, trust proxy, and allowed origins.
   - Export `getServerConfig(env = process.env)`.

3. Extract cross-cutting middleware and helpers.
   - Create `server/lib/httpLogging.js`.
   - Create `server/lib/securityMiddleware.js`.
   - Create `server/lib/rateLimit.js`.
   - Create `server/lib/cache.js`.
   - Create `server/lib/auth.js`.

4. Wire extracted modules into `server/index.js`.
   - Keep route registration order unchanged, especially the raw Paddle webhook route before `express.json`.
   - Keep log event names unchanged.
   - Keep API `requestId` response decoration unchanged.

5. Verify.
   - Run focused module tests.
   - Run `npm run verify`.
   - Run production audit.
   - Run Vercel API import check.

## Success Criteria

- `server/index.js` no longer owns config parsing, request logging, CORS/hardening, generic rate limiting, TTL cache construction, or auth token parsing.
- The API imports successfully through `api/[...path].js`.
- Existing tests and build pass.
