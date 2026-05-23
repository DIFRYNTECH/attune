# Team Onboarding Guide

## What Attune Is

Attune is a gentle daily companion designed to reduce overwhelm and help a user take one small step that matches their current state.

The product values matter to the implementation:

- calm over speed
- optionality over pressure
- emotional safety over optimization
- local-first feel, even when remote services are involved

## What the App Does Today

- Lets a user sign in or sign up with email OTP
- Captures a lightweight daily check-in
- Generates a 12-tile Activity Picker board using built-in suggestions or AI
- Lets the user add a few tasks to My Day
- Stores weekly reflections and note memory in Supabase
- Generates a short daily note through the backend AI flow
- Runs on the web and inside a Capacitor Android shell

## Core Services

- Vercel serves the frontend SPA and the API entrypoint
- Supabase handles auth, database, and row-level-security backed persistence
- Upstash handles durable rate limiting for AI endpoints
- OpenAI handles AI text generation for board generation and daily note generation
- Resend-backed SMTP is used by Supabase Auth for email delivery

## Repo Layout

- [src/app](../../app)
Frontend app shell and composition
- [src/screens](../../screens)
User-facing screens
- [src/components](../../components)
Reusable UI pieces
- [src/store](../../store)
Global state and actions
- [src/lib](../../lib)
Supabase helpers, AI helpers, storage, dates, mobile integration, and utility code
- [server](../../../server)
Express backend with AI and quota logic
- [api](../../../api)
Vercel serverless entrypoint
- [supabase/migrations](../../../supabase/migrations)
Database schema source of truth
- [android](../../../android)
Capacitor Android project

## First-Day Setup

1. Install dependencies with `npm install`.
2. Create a local env file from [.env.example](../../../.env.example).
3. Start the web app with `npm run dev`.
4. Start frontend + API together with `npm run dev:all` when testing AI flows.
5. Build with `npm run build` before shipping changes.

## First Files to Understand

1. [src/app/App.jsx](../../app/App.jsx) for the app shell and screen composition
2. [src/store/useAttuneStore.js](../../store/useAttuneStore.js) for the actual product state machine
3. [src/lib/supabase.js](../../lib/supabase.js) for auth and redirect behavior
4. [server/index.js](../../../server/index.js) for AI, auth verification, quotas, and rate limits
5. [supabase/migrations/20260328110216_attune_minimal_v1.sql](../../../supabase/migrations/20260328110216_attune_minimal_v1.sql) for the live schema model

## Mental Model

Think of Attune as four cooperating layers:

1. Local UX state in the store keeps the app feeling immediate.
2. Supabase auth and data add identity and durable per-user state.
3. The Attune API enforces sensitive server-side behavior.
4. OpenAI is an implementation detail behind the Attune API, not a client dependency.

## New Engineer Checklist

1. Read the architecture pack in order.
2. Run the app locally without AI first.
3. Run the app with the API next.
4. Verify sign-in, generate-board, daily note, weekly summaries, and note memory.
5. Read [09-operations-runbook.md](09-operations-runbook.md) before touching production env vars.
