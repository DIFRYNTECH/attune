# Attune Architecture Pack

This directory is the canonical onboarding and architecture reference for Attune as it exists today.

## Read Order

1. [01-team-onboarding.md](01-team-onboarding.md)
2. [02-system-architecture.md](02-system-architecture.md)
3. [03-frontend-architecture.md](03-frontend-architecture.md)
4. [04-auth-architecture.md](04-auth-architecture.md)
5. [05-ai-backend-architecture.md](05-ai-backend-architecture.md)
6. [06-data-model.md](06-data-model.md)
7. [07-deployment-and-environments.md](07-deployment-and-environments.md)
8. [08-mobile-architecture.md](08-mobile-architecture.md)
9. [09-operations-runbook.md](09-operations-runbook.md)
10. [10-project-status.md](10-project-status.md)

## What This Pack Covers

- Product and technical context for new engineers
- Runtime architecture across frontend, backend, auth, data, AI, and mobile
- Current deployment model on Vercel + Supabase + Upstash + Resend
- Operational procedures for debugging, redeploying, and rotating secrets
- Current status and remaining work

## Current Source-of-Truth Principle

This pack intentionally describes the live implementation rather than the earlier local-only prototype.

Historical docs in the parent folder remain useful, but some are stale because Attune now has:

- Supabase OTP auth instead of local-only profile/auth assumptions
- A Vercel-hosted API instead of local AI-only backend assumptions
- Remote persistence for profiles, weekly summaries, note memory, entitlements, and AI usage
- Upstash-backed rate limiting and production deployment wiring

## Quick Facts

- Frontend: React 19 + Vite
- Mobile shell: Capacitor Android
- Auth: Supabase email OTP
- Database: Supabase Postgres with RLS
- API: Express app served locally and through Vercel serverless entrypoint
- AI: OpenAI for board generation and daily notes
- Rate limiting: Upstash Redis
- Email delivery: Supabase Auth with custom SMTP / Resend setup

## First Files to Read in Code

- [src/app/App.jsx](../../app/App.jsx)
- [src/store/useAttuneStore.js](../../store/useAttuneStore.js)
- [src/lib/supabase.js](../../lib/supabase.js)
- [src/lib/mobile.js](../../lib/mobile.js)
- [server/index.js](../../../server/index.js)
- [supabase/migrations/20260328110216_attune_minimal_v1.sql](../../../supabase/migrations/20260328110216_attune_minimal_v1.sql)