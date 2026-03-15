# React + Vite

## Optional: AI-generated Activity Picker board

Attune can optionally generate a fresh 15-tile Activity Picker board on each check-in, using your check-in signals (mood, energy, body, pace, note).

This is implemented as a small local API server (so your OpenAI key is never shipped to the browser) with Vite proxying `/api/*` to it.

### Setup

- Copy [.env.example](.env.example) to `.env` and set `OPENAI_API_KEY`.
- If you want AI usage tied to a signed-in Supabase user, also set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_ANON_KEY`).
- Install deps: `npm install`
- Run both servers: `npm run dev:all`

If the AI endpoint is unavailable, the app automatically falls back to the built-in task list.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
