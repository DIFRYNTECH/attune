# Attune App Flows

How each major feature works end-to-end, including which services are involved.

---

## Authentication
**Login → Supabase Auth**
1. User enters email/password in the app
2. Supabase JS client sends credentials to `https://[your-project].supabase.co/auth/v1/token`
3. Supabase returns a **JWT access token** + refresh token
4. Tokens stored in device local storage (persisted across app restarts)
5. On every subsequent request the JWT is attached as `Authorization: Bearer ...`

---

## Entitlements / Plan Check
**App start → Vercel API → Supabase DB**
1. App calls `https://app.useattune.co/api/billing/entitlements` with JWT
2. Vercel serverless function verifies the JWT, looks up `user_entitlements` table in Supabase
3. Returns whether user is `free` or `plus`
4. App gates features (AI board, note memory, smart pick) based on response

---

## Check-in
**Local only**
1. User selects their mood/energy on the wheel
2. Stored locally in Zustand state + device storage
3. No network call — entirely on-device
4. Result is used as context for the AI board request

---

## AI Board Generation
**Vercel API → Supabase DB → OpenAI**
1. App sends check-in data to `https://app.useattune.co/api/generate-board` with JWT
2. Vercel function: verifies JWT → looks up plan in `plan_catalog` → calls `reserve_ai_usage_quota` RPC in Supabase → calls OpenAI GPT
3. OpenAI returns personalised activity suggestions
4. Response logged in `ai_usage` table (for quota tracking)
5. App renders the AI board

---

## Daily Note (My Day summary)
**Vercel API → Supabase DB → OpenAI**
1. After check-in, app calls `https://app.useattune.co/api/daily-note` with JWT + picked activities
2. Same flow as board: quota check → OpenAI → `ai_usage` logged
3. Note returned and displayed on the Today screen

---

## Activity Picking
**Local only**
1. User taps tiles on the board
2. Selections stored in Zustand state + local storage (`myDay`)
3. No network call

---

## Play Billing (once in Play Store)
**Google Play → Vercel API → Supabase DB**
1. User taps "Upgrade" → Google Play billing sheet appears (native)
2. User completes purchase → Google returns a purchase token
3. App sends token to `https://app.useattune.co/api/billing/google-play/verify`
4. Vercel calls Google Play Developer API to verify the token is genuine
5. On success: inserts row into `play_store_purchases` + `user_entitlements` in Supabase
6. App re-fetches entitlements → user is now Plus

---

## Weekly Summary
**Vercel API → Supabase DB → OpenAI**
1. App calls `https://app.useattune.co/api/weekly-summary` with JWT
2. Server reads the week's activity history from Supabase
3. OpenAI generates a reflection summary
4. Stored in `weekly_summaries` table, returned to app

---

## Service Responsibilities

| Service | Role |
|---------|------|
| Supabase Auth | Identity, JWTs |
| Supabase DB | Profiles, entitlements, quota, purchases, summaries |
| Vercel | All API logic (auth gating, quota, billing verification) |
| OpenAI | Board generation, daily notes, weekly summaries |
| Google Play | Payment processing (once in Play Store) |
| Device local storage | State persistence between sessions |
