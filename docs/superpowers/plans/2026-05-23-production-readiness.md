# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the launch-blocking gaps found in the senior engineering review so Attune can be judged ready for production with fresh evidence.

**Architecture:** Keep the existing Vite/React, Express-on-Vercel, Supabase, Paddle, Google Play, and Capacitor architecture. Focus on durability, automated verification, dependency hygiene, and launch-operational clarity rather than re-architecture.

**Tech Stack:** Node.js ESM, Express 4, Vite 7, React 19, Supabase, Paddle Billing, Google Play Billing, GitHub Actions, npm audit, Node test runner.

---

## File Structure

- Modify: `server/index.js`
  - Make AI usage reservation finalization durable before API responses.
  - Add small helper functions if needed, keeping the current large-file pattern intact.
- Modify: `server/lib/rateLimitConfig.test.js` or create `server/lib/aiUsageFinalization.test.js`
  - Add focused tests for quota/finalization behavior without hitting real Supabase.
- Modify: `package.json`
  - Add `test` and `verify` scripts.
  - Update dependency ranges after `npm audit fix`.
- Modify: `package-lock.json`
  - Lock audited dependency versions.
- Create: `.github/workflows/ci.yml`
  - Run install, lint, tests, build, audit, and API import check.
- Modify: `README.md`
  - Replace stale Stripe production billing documentation with Paddle + Google Play documentation.
- Modify: `src/docs/architecture/07-deployment-and-environments.md`
  - Ensure env var and billing setup docs match the implemented deployment.
- Modify: `src/docs/architecture/10-project-status.md`
  - Update status once smoke checks are completed.
- Modify: `docs/POPIA_READINESS.md`
  - Turn launch checklist items into explicit owner/evidence checklist.

---

### Task 1: Add Project-Level Verification Scripts

**Files:**
- Modify: `package.json:6-30`

- [ ] **Step 1: Add a `test` script and a one-command `verify` script**

Update the scripts block in `package.json` so it includes:

```json
"test": "node --test",
"verify": "npm run lint && npm test && npm run build"
```

Keep the existing scripts unchanged.

- [ ] **Step 2: Run the new scripts**

Run:

```powershell
npm test
npm run verify
```

Expected:

```text
npm test: 42 tests pass
npm run verify: lint, tests, and build all exit 0
```

- [ ] **Step 3: Commit**

```powershell
git add package.json
git commit -m "chore: add project verification scripts"
```

---

### Task 2: Make AI Usage Finalization Durable

**Files:**
- Modify: `server/index.js:2037-2111`
- Modify: `server/index.js:2330-2356`
- Test: create `server/lib/aiUsageFinalization.test.js` if a small pure helper is extracted

- [ ] **Step 1: Identify all fire-and-forget finalization calls**

Run:

```powershell
rg -n "finalizeReservedAiUsage" server/index.js
```

Expected locations:

```text
server/index.js:2053
server/index.js:2093
server/index.js:2334
server/index.js:2354
```

- [ ] **Step 2: Replace success-path fire-and-forget finalization with awaited finalization before response**

For `/api/generate-board`, change the success path from:

```js
finalizeReservedAiUsage({
  usageId: quotaReservation.usageId,
  success: true,
  model: resolvedBoardModel,
  meta: {
    planId: aiContext.planId,
    useNoteForAi: aiContext.useNoteForAi,
    model: resolvedBoardModel,
    requestedModel: BOARD_MODEL,
    fallbackModel: BOARD_FALLBACK_MODEL,
    attemptedModels: attemptedBoardModels,
    fallbackUsed: boardFallbackUsed,
    strategy: "ai",
    quality: generated.quality || null,
  },
}).catch(() => {});
```

to:

```js
await finalizeReservedAiUsage({
  usageId: quotaReservation.usageId,
  success: true,
  model: resolvedBoardModel,
  meta: {
    planId: aiContext.planId,
    useNoteForAi: aiContext.useNoteForAi,
    model: resolvedBoardModel,
    requestedModel: BOARD_MODEL,
    fallbackModel: BOARD_FALLBACK_MODEL,
    attemptedModels: attemptedBoardModels,
    fallbackUsed: boardFallbackUsed,
    strategy: "ai",
    quality: generated.quality || null,
  },
});
```

Apply the same change to the `/api/daily-note` success path.

- [ ] **Step 3: Decide the failure-path behavior deliberately**

For invalid AI output paths, prefer awaiting release finalization before returning `502`:

```js
await finalizeReservedAiUsage({
  usageId: quotaReservation.usageId,
  success: false,
  errorCode: generated.error || "invalid_board",
  model: resolvedBoardModel,
  meta: {
    planId: aiContext.planId,
    useNoteForAi: aiContext.useNoteForAi,
    model: resolvedBoardModel,
    requestedModel: BOARD_MODEL,
    fallbackModel: BOARD_FALLBACK_MODEL,
    attemptedModels: attemptedBoardModels,
    modelErrors: boardModelErrors,
  },
});
```

For unexpected thrown errors after quota reservation, do not add a broad rescue unless the code clearly has access to `quotaReservation` in that catch scope. Avoid masking the original API error.

- [ ] **Step 4: Run targeted verification**

Run:

```powershell
npm test
npm run lint
```

Expected:

```text
All tests pass.
ESLint exits 0.
```

- [ ] **Step 5: Commit**

```powershell
git add server/index.js server/lib/aiUsageFinalization.test.js package.json
git commit -m "fix: finalize ai usage before responding"
```

---

### Task 3: Clear Production Dependency Advisories

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run audit fix**

Run:

```powershell
npm audit fix
```

Expected:

```text
express, body-parser, qs, ws, and brace-expansion are updated to patched versions or removed from the vulnerable dependency graph.
```

- [ ] **Step 2: Re-run production audit**

Run:

```powershell
npm audit --omit=dev
```

Expected:

```text
found 0 vulnerabilities
```

If audit still reports vulnerabilities, inspect the remaining dependency path with:

```powershell
npm audit --omit=dev --json
```

Then update the direct dependency responsible for the vulnerable transitive package.

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm run verify
```

Expected:

```text
lint passes, tests pass, build passes
```

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: update audited dependencies"
```

---

### Task 4: Add CI for Launch Gates

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
      - uat

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint, test, and build
        run: npm run verify

      - name: Audit production dependencies
        run: npm audit --omit=dev --audit-level=moderate

      - name: Verify Vercel API import
        run: node -e "process.env.VERCEL='1'; import('./api/[...path].js').then(() => console.log('api import ok'))"
```

- [ ] **Step 2: Run the workflow-equivalent commands locally**

Run:

```powershell
npm ci
npm run verify
npm audit --omit=dev --audit-level=moderate
$env:VERCEL='1'; node -e "import('./api/[...path].js').then(() => console.log('api import ok'))"
```

Expected:

```text
All commands exit 0.
API import prints "api import ok".
```

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: add production readiness checks"
```

---

### Task 5: Align Billing Documentation With Implemented Paddle and Google Play Flow

**Files:**
- Modify: `README.md:26-47`
- Modify: `src/docs/architecture/07-deployment-and-environments.md`
- Optional delete after confirming no callers remain: `server/lib/stripeBilling.js`
- Optional modify: `package.json`, `package-lock.json` if removing `stripe`

- [ ] **Step 1: Confirm Stripe is unused**

Run:

```powershell
rg -n "stripe|Stripe|STRIPE|billing/stripe" .
```

Expected:

```text
Only README/docs and server/lib/stripeBilling.js/package files reference Stripe.
No Express route imports or calls stripeBilling.js.
```

- [ ] **Step 2: Replace README billing section**

Replace the stale Stripe section in `README.md` with:

```markdown
## Web Billing

Attune supports web subscriptions through Paddle Checkout. Native Android subscriptions use Google Play Billing.

### Required Paddle client env vars

- `VITE_PADDLE_CLIENT_TOKEN`
- `VITE_PADDLE_PLUS_PRICE_ID`
- `VITE_PADDLE_ENV=sandbox` for UAT or `live` for production

### Required Paddle server env vars

- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PLUS_PRICE_ID`

### Required Paddle setup

- Create the Attune Plus price in Paddle and set the same price ID in client and server env.
- Point Paddle webhooks at `/api/billing/paddle/webhook`.
- Subscribe the webhook to subscription lifecycle events such as `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.trialing`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, and `subscription.canceled`.

The server updates `user_entitlements` from Paddle webhook events, and the billing status endpoint also reconciles Paddle state for signed-in web users.
```

- [ ] **Step 3: Remove dead Stripe code if confirmed unused**

If Step 1 confirms no active Stripe routes or callers, remove the unused helper and dependency:

```powershell
npm uninstall stripe
```

Delete:

```text
server/lib/stripeBilling.js
```

- [ ] **Step 4: Run verification**

Run:

```powershell
npm run verify
rg -n "stripe|Stripe|STRIPE|billing/stripe" README.md src docs server package.json
```

Expected:

```text
Verification passes.
No stale Stripe launch instructions remain unless intentionally kept as historical notes.
```

- [ ] **Step 5: Commit**

```powershell
git add README.md src/docs/architecture/07-deployment-and-environments.md server/lib/stripeBilling.js package.json package-lock.json
git commit -m "docs: align billing setup with paddle"
```

---

### Task 6: Convert Launch Checklist Into Evidence-Backed Smoke Tests

**Files:**
- Modify: `src/docs/architecture/10-project-status.md`
- Modify: `docs/POPIA_READINESS.md`
- Optional create: `docs/PRODUCTION_SMOKE_TEST.md`

- [ ] **Step 1: Create a production smoke test checklist**

Create `docs/PRODUCTION_SMOKE_TEST.md`:

```markdown
# Production Smoke Test

Run this checklist against the production deployment before broad launch.

## Web App

- [ ] Production URL loads over HTTPS.
- [ ] `/privacy` loads and displays the current privacy policy.
- [ ] `/auth/callback` rewrites to the SPA.
- [ ] Sign up/sign in via Supabase OTP works for a real email.
- [ ] Sign out works.

## API

- [ ] `GET /api/health` returns `{ "ok": true }`.
- [ ] Protected API calls without a bearer token return `401`.
- [ ] Protected API calls with a valid token return expected data.
- [ ] Vercel logs show request IDs and no repeated runtime errors.

## AI

- [ ] Plus user can generate an AI board.
- [ ] Plus user can generate a daily note.
- [ ] Free user receives the expected Plus-required response.
- [ ] AI usage rows are finalized as `quotaState: billed` after successful AI responses.
- [ ] Quota rejection works at the configured limit.

## Billing

- [ ] Paddle checkout opens in the configured environment.
- [ ] Paddle webhook updates `user_entitlements`.
- [ ] Paddle portal session opens for an active customer.
- [ ] Google Play purchase verifies against the signed-in account on Android.

## Mobile

- [ ] Android App Link opens the app from `https://<host>/auth/callback`.
- [ ] `assetlinks.json` is live with the release certificate fingerprint.
- [ ] Real-device auth works end to end.
```

- [ ] **Step 2: Update project status**

In `src/docs/architecture/10-project-status.md`, keep open items open until evidence exists. When evidence exists, add the date and command/output/source next to each item.

- [ ] **Step 3: Update POPIA readiness**

In `docs/POPIA_READINESS.md`, add an evidence section:

```markdown
## Launch Evidence

- [ ] support@useattune.co receives mail reliably.
- [ ] The production privacy policy URL is live.
- [ ] Account-level deletion process has an owner and tested manual runbook.
- [ ] Payment processors and AI processors listed here match production configuration.
- [ ] A qualified privacy/legal review has been completed or explicitly deferred for limited beta.
```

- [ ] **Step 4: Commit**

```powershell
git add docs/PRODUCTION_SMOKE_TEST.md src/docs/architecture/10-project-status.md docs/POPIA_READINESS.md
git commit -m "docs: add production smoke test checklist"
```

---

### Task 7: Final Production Readiness Gate

**Files:**
- No code changes expected unless verification finds an issue.

- [ ] **Step 1: Run complete local verification**

Run:

```powershell
npm ci
npm run verify
npm audit --omit=dev --audit-level=moderate
$env:VERCEL='1'; node -e "import('./api/[...path].js').then(() => console.log('api import ok'))"
git status --short
```

Expected:

```text
All commands exit 0.
git status shows only intentional committed changes or is clean.
```

- [ ] **Step 2: Run production smoke test**

Use `docs/PRODUCTION_SMOKE_TEST.md` against production/UAT as appropriate. Record the date, environment, and result in `src/docs/architecture/10-project-status.md`.

- [ ] **Step 3: Make the readiness decision**

If all P1/P2 items are closed and smoke checks pass, update `src/docs/architecture/10-project-status.md`:

```markdown
## Production Readiness Decision

As of YYYY-MM-DD, Attune is ready for [limited beta / production launch] based on:

- CI passing on the release branch.
- Local verification passing.
- Production smoke test passing.
- Dependency audit passing for production dependencies.
- Billing documentation matching deployed Paddle and Google Play flows.
- POPIA readiness checklist reviewed for the launch scope.
```

- [ ] **Step 4: Commit**

```powershell
git add src/docs/architecture/10-project-status.md
git commit -m "docs: record production readiness decision"
```

---

## Self-Review

**Spec coverage:** This plan covers the review findings: durable quota finalization, missing test script/CI, production dependency audit, stale billing docs, open smoke/privacy launch items, and final readiness evidence.

**Placeholder scan:** No task uses TBD/TODO placeholders. The only conditional step is explicitly bounded: remove Stripe only after confirming no active callers.

**Type consistency:** Function and file names match current repo names: `finalizeReservedAiUsage`, `server/index.js`, `package.json`, `.github/workflows/ci.yml`, `docs/POPIA_READINESS.md`, and `src/docs/architecture/10-project-status.md`.
