# Codebase Architecture Decomposition Design

## Goal

Break Attune's largest application files into architecturally clear modules that a senior engineer can review, test, and evolve without reading unrelated product surfaces.

## Current Context

Attune is a React 19 + Vite SPA with a local-first global store and an Express API exported through Vercel. The current architecture works, but several files have become too broad:

- `server/index.js` owns API assembly, middleware, auth, billing, quota, AI generation, AI validation, caching, and route handlers.
- `src/store/useAttuneStore.js` owns state defaults, migrations, selectors, sync, auth, billing, AI, day planning, note memory, and rollover workflows.
- `src/index.css` is a large global stylesheet rather than an organized set of style domains.
- Some architecture docs describe older contracts, such as 15 board tasks, while current code uses 12.

The refactor should preserve behavior and public contracts. It should not introduce a new framework, new state library, or broad product redesign.

## Recommended Approach

Use a staged refactor:

1. Backend/API modularization.
2. Frontend store modularization.
3. CSS and architecture contract cleanup.

This order addresses the highest-risk trust boundary first. The backend handles auth verification, billing state, quota enforcement, and OpenAI calls, so it should be easier to inspect and test before broad launch.

## Backend/API Design

`server/index.js` should become the app assembly file. It should create the Express app, install middleware, register route groups, start the local listener when not running on Vercel, and export the app.

Target backend structure:

- `server/config.js`
  - Reads and normalizes environment variables.
  - Exposes config for OpenAI, Supabase, Upstash, origins, ports, models, and board limits.
- `server/app.js`
  - Builds the Express app from config, clients, middleware, and route modules.
  - Keeps route wiring visible without embedding route logic.
- `server/index.js`
  - Imports `createApp()`, creates the app, starts the local server when `VERCEL !== "1"`, and exports the app for Vercel.
- `server/lib/httpLogging.js`
  - Owns request IDs, `logEvent`, `summarizeError`, request log context, and response request-id decoration.
- `server/lib/securityMiddleware.js`
  - Owns CORS/origin checks, JSON parse error handling, API hardening headers, and `enforceAllowedOrigin`.
- `server/lib/rateLimit.js`
  - Owns memory rate limiter, Upstash limiter construction, client IP extraction, and rate-limit formatting.
- `server/lib/auth.js`
  - Owns bearer-token parsing and Supabase `auth.getUser` verification.
- `server/lib/cache.js`
  - Owns the TTL cache utility used by board, note, and plan catalog caching.
- `server/services/entitlements.js`
  - Owns entitlement lookup, plan normalization, plus-entitlement rules, and plan catalog cache access.
- `server/services/aiQuota.js`
  - Owns `reserveAiQuota`, `finalizeReservedAiUsage`, `recordAiUsage`, and `rejectForQuota`.
- `server/services/paddleService.js`
  - Owns Paddle entitlement upsert, customer lookup, subscription reconciliation, and webhook event handling.
- `server/services/googlePlayService.js`
  - Owns persistence of verified Play purchases and entitlement updates.
- `server/services/dailyNoteService.js`
  - Owns daily-note prompt building, daily theme selection, payload validation, OpenAI retry behavior, and cache-key construction.
- `server/services/aiBoardService.js`
  - Owns board prompt building, board payload validation, fallback task construction, OpenAI retry behavior, and cache-key construction.
- `server/routes/health.js`
  - Registers `/api/health`.
- `server/routes/clientError.js`
  - Registers `/api/client-error`.
- `server/routes/billing.js`
  - Registers `/api/billing/entitlements`, `/api/billing/paddle/portal`, `/api/billing/paddle/webhook`, and `/api/billing/google-play/verify`.
- `server/routes/ai.js`
  - Registers `/api/generate-board` and `/api/daily-note`.

The first backend pass should prefer moving cohesive code over changing algorithms. Route response shapes, status codes, request fields, and logging event names should remain stable unless a test proves a change is necessary.

## Frontend Store Design

The app should keep the current store-driven UI model. The refactor should not introduce Redux, Zustand, React Router, or a new app state framework. The public API should remain `useAttuneStore()` returning the same style of state/actions consumed by screens.

Target frontend store structure:

- `src/store/useAttuneStore.js`
  - Public hook and high-level orchestration.
  - Imports state defaults, selectors, serializers, and action builders.
- `src/store/constants.js`
  - Schema versions, board tile counts, retention limits, and stable store constants.
- `src/store/defaultState.js`
  - `DEFAULT_CHECKIN`, `defaultBillingState`, and `defaultState`.
- `src/store/stateMigration.js`
  - `normalizeLoadedState` and legacy state migrations.
- `src/store/selectors.js`
  - Billing plan selectors, entitlement selectors, and derived flags.
- `src/store/serializers.js`
  - Supabase row conversions and local sync payload sanitizers.
- `src/store/dayRollover.js`
  - `rollDayToHistory` and `rolloverStateToToday`.
- `src/store/actions/authActions.js`
  - OTP sign-in/sign-up/sign-out actions.
- `src/store/actions/billingActions.js`
  - Entitlement sync, Paddle checkout, Google Play purchase/restore/acknowledge flows.
- `src/store/actions/aiActions.js`
  - AI board and daily note state transitions and API calls.
- `src/store/actions/syncActions.js`
  - Profile, weekly summaries, note memory, and device state sync flows.
- `src/store/actions/dayActions.js`
  - Check-in updates, local board refresh, task pick/remove/complete, and My Day behavior.

Extraction should begin with pure helpers and serializers because they are easiest to test. Action extraction should follow only after tests cover the state transitions being moved.

## CSS and Contract Cleanup Design

The CSS phase should reduce file size and improve ownership without changing visual design.

Target CSS structure:

- `src/index.css`
  - Import hub only.
- `src/styles/base.css`
  - Reset, root variables, typography, and base document rules.
- `src/styles/layout.css`
  - App shell, screen layout, nav layout, responsive containers.
- `src/styles/components.css`
  - Shared reusable component styles.
- `src/styles/screens/checkin.css`
- `src/styles/screens/activity-picker.css`
- `src/styles/screens/today.css`
- `src/styles/screens/weekly.css`
- `src/styles/screens/profile.css`
- `src/styles/screens/auth.css`
- `src/styles/screens/privacy.css`
- `src/styles/landing.css`
  - If moved from the current `src/landing.css`, preserve imports and route behavior.

Architecture docs should be updated alongside the code to match current contracts:

- Activity Picker board size is 12 tasks.
- Web billing uses Paddle.
- Android billing uses Google Play Billing.
- The backend module boundaries are the canonical trust-boundary reference after refactor.

## Testing Strategy

Before each phase:

```powershell
npm run verify
```

During extraction:

```powershell
node --test <focused-test-file>
```

After each phase:

```powershell
npm run verify
npm audit --omit=dev --audit-level=moderate
$env:VERCEL='1'; node -e "import('./api/[...path].js').then(() => console.log('api import ok'))"
```

Backend-specific tests should cover:

- API import works through `api/[...path].js`.
- `/api/health` remains registered.
- Billing route modules register the same route paths.
- AI route modules register `/api/generate-board` and `/api/daily-note`.
- AI usage finalization remains awaited before responses.
- Production-like rate limiting still fails closed without Upstash unless explicitly overridden.

Frontend-specific tests should cover:

- Extracted serializers preserve current Supabase row conversion behavior.
- State migration preserves old local state shape compatibility.
- Billing selectors and entitlement selectors preserve current plan behavior.
- Day rollover preserves existing history and current-day behavior.

CSS verification should include:

- `npm run build` succeeds.
- No CSS import path breaks.
- Core screens render with the same class names.

## Non-Goals

- No visual redesign.
- No new frontend state framework.
- No React Router introduction.
- No database schema changes unless a later implementation task finds a real bug.
- No billing provider change.
- No OpenAI model/prompt redesign except moving existing logic into focused modules.

## Success Criteria

- `server/index.js` becomes a small app entrypoint instead of the backend implementation.
- Backend trust-boundary modules can be reviewed independently.
- Store helpers and actions are split by responsibility while preserving `useAttuneStore()` consumers.
- CSS is split into owned domains without changing the UI.
- Architecture docs describe the real current contracts.
- `npm run verify`, production audit, and Vercel API import check pass after every phase.
