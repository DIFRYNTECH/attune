# Attune Docs Index

This folder contains both historical product notes and the current implementation docs.

If you are onboarding to the codebase, start here:

1. [architecture/README.md](architecture/README.md)
2. [architecture/01-team-onboarding.md](architecture/01-team-onboarding.md)
3. [architecture/02-system-architecture.md](architecture/02-system-architecture.md)
4. [architecture/04-auth-architecture.md](architecture/04-auth-architecture.md)
5. [architecture/05-ai-backend-architecture.md](architecture/05-ai-backend-architecture.md)
6. [architecture/06-data-model.md](architecture/06-data-model.md)

Use these older files as historical context, not the primary source of truth for the live stack:

- [ATTUNE_CONTEXT.md](ATTUNE_CONTEXT.md)
- [ATTUNE_DECISIONS.md](ATTUNE_DECISIONS.md)
- [ATTUNE_ROADMAP.md](ATTUNE_ROADMAP.md)
- [ATTUNE_DESIGN_RULES.md](ATTUNE_DESIGN_RULES.md)

The architecture pack under [architecture/README.md](architecture/README.md) reflects the current production-oriented Attune setup: React + Vite frontend, Vercel-hosted API, Supabase auth/data, Upstash rate limiting, OpenAI-backed AI endpoints, and Capacitor Android support.