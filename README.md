# React + Vite

## Optional: AI-generated Activity Picker board

Attune can optionally generate a fresh 15-tile Activity Picker board on each check-in, using your check-in signals (mood, energy, body, pace, note).

This is implemented as a small API layer (so your OpenAI key is never shipped to the browser). In local development, Vite proxies `/api/*` to the local Node server. In production, the same Express app can run behind a Vercel serverless function.

### Setup

- Copy [.env.example](.env.example) to `.env` and set `OPENAI_API_KEY`.
- If you want AI usage tied to a signed-in Supabase user, also set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_ANON_KEY`).
- Install deps: `npm install`
- Run both servers: `npm run dev:all`

### Production AI API on Vercel

- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Vercel project environment so the frontend can initialize Supabase auth.
- Add `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_ANON_KEY` to the Vercel project environment.
- Add `ALLOWED_ORIGINS=https://your-domain.example` so the API accepts browser calls from the live site.
- Set `TRUST_PROXY=1` on Vercel so request IP handling is correct.
- If using Upstash for durable rate limiting, also set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

If the AI endpoint is unavailable, the app automatically falls back to the built-in task list.

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

## Current trust boundary and go-live recommendation

For the current Attune architecture, the trust does **not** sit in the client app alone.

Today it is split across three layers:

- **Supabase Auth** is trusted for identity. The app gets a bearer token and `server/index.js` verifies that token before serving protected AI endpoints.
- **Supabase Postgres + RLS** is trusted for per-user data ownership on `profiles`, `weekly_summaries`, and `note_memory`.
- **Attune's API (`server/index.js`)** is trusted for server-only decisions such as AI usage logging, note privacy enforcement, and plan/quota enforcement.

That means the practical trust boundary today is:

`Attune app -> authenticated token -> Supabase Auth / Supabase DB policies / Attune API`

This is also why **Supabase is the recommended go-live option for the current codebase**. The app already depends on:

- Supabase auth/session handling in `src/lib/supabase.js`
- direct frontend CRUD helpers in `src/lib/profileApi.js`, `src/lib/weeklySummariesApi.js`, and `src/lib/noteMemoryApi.js`
- Supabase-backed token verification and server writes in `server/index.js`

If Attune ever moves to **Keycloak + Postgres**, Keycloak would replace the auth provider, but you would still need Attune's backend API to sit between the app and Postgres for auth verification, ownership checks, billing state, and AI usage writes.

In short: for launch, keep Supabase; over time, keep hardening the API by moving sensitive trust decisions out of the client and into `server/index.js` and database policies.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Production Mobile Auth

For production Android auth, Attune should use an HTTPS callback URL plus Android App Links instead of relying only on a custom scheme.

### Required client env vars

- `VITE_PUBLIC_APP_URL=https://your-domain.example`
- `VITE_AUTH_CALLBACK_PATH=/auth/callback`

Or set a single explicit callback URL:

- `VITE_AUTH_REDIRECT_URL=https://your-domain.example/auth/callback`

When either of those is set, Attune will send Supabase auth emails to that HTTPS callback URL for both web and native flows.

### Supabase settings

- Set **Site URL** to your real deployed web origin, not localhost.
- Add this redirect URL to **Redirect URLs**:
	- `https://your-domain.example/auth/callback`
- Keep `com.attune.app://login-callback/` only as a fallback while migrating.

### Android App Links

Attune's Android manifest now supports a verified HTTPS app link using Gradle properties from [android/gradle.properties](android/gradle.properties).

Set these values before release:

- `ATTUNE_AUTH_HOST=your-domain.example`
- `ATTUNE_AUTH_PATH_PREFIX=/auth/callback`

You must also host an `assetlinks.json` file at:

- `https://your-domain.example/.well-known/assetlinks.json`

Template:

```json
[
	{
		"relation": ["delegate_permission/common.handle_all_urls"],
		"target": {
			"namespace": "android_app",
			"package_name": "com.attune.app",
			"sha256_cert_fingerprints": [
				"YOUR_RELEASE_CERT_SHA256"
			]
		}
	}
]
```

For local device testing you may temporarily use your debug certificate fingerprint, but for Play Store release you should use the Play App Signing certificate fingerprint.

### Hosting requirement

Your web host must rewrite `/auth/callback` to Attune's `index.html` so the SPA can boot and let Supabase parse the auth code from the callback URL.

## Local Emulator Magic-Link Testing

While Attune is still being tested locally, Supabase email links may still fall back to the Supabase **Site URL** (`http://localhost:5173`) instead of returning directly into the Android app.

### What works locally

- The Android app can receive `com.attune.app://login-callback/?code=...`
- Attune can exchange that `code` with Supabase and sign the user in
- The emulator can open the app with `adb shell am start`

### Practical local workaround

1. Send the magic-link email from the installed emulator app.
2. Open the email on desktop and copy the `Continue to Attune` link.
3. If the link contains `redirect_to=http://localhost:5173`, do **not** tap it directly in the emulator.
4. Either:
	- replace `redirect_to=http://localhost:5173` with `redirect_to=com.attune.app%3A%2F%2Flogin-callback%2F` and launch the corrected verify URL through `adb`, or
	- if Supabase already redirected and the browser URL shows `http://localhost:5173/?code=...`, extract the `code` and open Attune directly with that code.

### Direct app-login command

```powershell
.\adb.exe -s emulator-5554 shell am start -a android.intent.action.VIEW -d "com.attune.app://login-callback/?code=YOUR_CODE_HERE"
```

### Important local-testing rules

- Use the newest email only.
- Codes expire quickly; run the `adb` command immediately.
- `localhost` inside the emulator is not the same as your laptop's `localhost`.
- A clean one-click Gmail-to-app experience requires a real HTTPS callback URL later.
