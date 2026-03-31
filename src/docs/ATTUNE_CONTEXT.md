# Attune - Context & Direction

Historical note: this file keeps the original product framing and some early implementation notes. For the current production-oriented stack, use [architecture/README.md](architecture/README.md).

## What Attune is
Attune is a gentle daily companion.
It does not fix, push, optimise, shame, or pressure.

Its role is to:
- meet the user where they are
- reduce overwhelm
- help them take very small, kind steps
- count rest and returning as success

Attune is designed for emotionally fragile days.

## Tone
- close friend
- calm, grounded
- slightly playful
- never clinical
- never motivational-hustle
- never judgmental

## Core principle
“Meet yourself where you are - then take one small step toward better.”

## Non-negotiables
Attune must never:
- shame the user
- pressure productivity
- guilt them for inactivity
- sound like therapy software
- overwhelm with choices

## Task philosophy
Tasks are:
- small
- optional
- body-aware
- emotionally respectful

Difficulty is a spectrum:
Rest → Gentle → Steady → Capable → Brave

The user can always choose rest.

## App structure (current)
- Web app first (mobile-first)
- React + Vite
- Local-first state (localStorage + Supabase-backed account sync)
- Vercel-hosted API for AI endpoints (Express app exported as serverless entrypoint)
- Supabase email OTP auth + remote sync for profile, weekly summaries, and note memory

AI board generation (optional):
- On entering the Activity Picker, Attune can generate a fresh 15-tile board from the user’s Check-in (mood/energy/body/pace + optional note)
- The browser calls a local/prod `/api/generate-board` endpoint (Vite proxies `/api/*` in dev)
- The backend calls OpenAI using the app’s API key (kept server-side)
- If AI is unavailable, Attune falls back to the built-in task list
- Users do not need OpenAI accounts

Privacy control:
- A Profile preference controls whether the optional note is sent to the AI (signals still work without the note)

Local dev:
- `npm run dev` runs the app only (no AI)
- `npm run dev:all` runs app + local AI API server

---

## Current architecture snapshot

### Frontend (React + Vite)
- App shell + routing: `src/app/App.jsx`
	- `state.screen` decides which screen renders
	- Toast is only shown when `toast.screen === screen`
- Screens:
	- Check-in: `src/screens/CheckIn.jsx`
	- Activity Picker: `src/screens/ActivityPicker.jsx` + board UI `src/components/ActivityBoard.jsx`
	- My Day: `src/screens/Today.jsx`
	- Weekly: `src/screens/Weekly.jsx`
	- Profile: `src/screens/Profile.jsx`
- Navigation:
	- Mobile bottom nav: `src/components/BottomNav.jsx`
	- Top nav exists for desktop/structure

### State + persistence
- Store: `src/store/useAttuneStore.js`
	- Local-first state persisted to localStorage
	- Signed-in state can sync profile, weekly summaries, and note memory through Supabase
	- Schema migration via `schemaVersion`
	- Toast is ephemeral (not persisted)
- Storage helpers: `src/lib/storage.js`
- Built-in suggestions (fallback): `src/lib/attuneEngine.js` + `src/data/tasks.js`

### AI board generation (optional)
- Local API server: `server/index.js`
	- `POST /api/generate-board` returns strict JSON `{ tasks: [...] }` (exactly 15)
	- Output is validated + safety-filtered (no harm, no meds/treatment plans)
- Frontend trigger:
	- `src/screens/ActivityPicker.jsx` calls `actions.ensureAiBoard(...)` on mount
- Note privacy toggle:
	- Stored in `state.profile.useNoteForAi`
	- When off, the optional note is omitted from the AI request
- Dev proxy:
	- `vite.config.js` proxies `/api/*` → `http://localhost:8787`

### Scripts + environment
- `npm run dev`: frontend only
- `npm run api`: API server only
- `npm run dev:all`: runs both (via concurrently)
- Env vars (server):
	- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
	- `OPENAI_API_KEY` (required to enable AI)
	- `OPENAI_MODEL` (default: `gpt-4o-mini`)
	- `PORT` (default: 8787)

### UX invariants worth protecting
- Activity Picker: 15 tiles, stable assignment, no repeats
- Caps: soft cap 5 (confirm), hard cap 10 (stop reveals/adds)
- Toast: above bottom nav, screen-scoped, non-persistent
- Weekly: calendar week (Mon → Sun), weekly note keyed to week
- Profile: local-only; “Sign out” clears device data

Screens:
1. Check-in
2. Activity Picker (15-tile board)
3. My Day
4. Weekly
5. Profile

Current behavior highlights:
- Activity Picker board
	- 15 tiles per board
	- Single tap adds to My Day
	- No repeats; stable assignment (tiles shouldn’t “jump” when revealing)
	- Soft cap: 5 tasks (confirm to continue)
	- Hard cap: 10 tasks (prevents revealing/adding beyond 10)
	- “Clear board” clears My Day and refreshes options
- Toasts
	- Fixed above bottom nav on mobile
	- Scoped to the screen that created them (no cross-screen bleed)
	- Ephemeral (not persisted across reload)
- Weekly
	- Calendar week (Mon → Sun)
	- “Signal n/100” (non-graded tone)
	- Week range shown via a calendar-triggered info modal
	- Weekly note persists per calendar week
- Profile
	- Account profile + preferences
	- Export local data snapshot (JSON)
	- Sign out ends the current session on this device
	- Toggle for whether the optional Check-in note is sent to AI

## Mobile-first rules
- Phone is primary (≈ 390-420px width)
- One main action per screen
- No dashboard overload
- Bottom navigation on mobile
- Minimal text above the fold
- Reduce cognitive load

## Current status
- React app running as a mobile-first SPA
- Bottom nav + safe-area handling in place
- Activity Picker board behavior + persistence in place
- Weekly reflection is calendar-week based and non-graded
- Supabase email OTP auth, hosted callbacks, and Capacitor deep-link support are live
- Profile is local-first with account sync for signed-in users
- Optional AI board generation with strict JSON + safety guardrails + fallback

## Current goal
Keep shipping features without breaking calm:
- preserve emotional safety and non-judgmental tone
- preserve mobile layout constraints (fixed bottom nav, no hidden content)
- keep the app usable offline / without AI

We prioritise clarity and emotional safety over features.
