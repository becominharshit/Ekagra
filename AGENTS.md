# Rules for AI coding tools

This project is built by a first-year student with AI help. Keep things simple, work in small steps and explain what you do.

## Where things are
- `docs/1-product-spec.md`: features and screens (with phase tags P1–P5)
- `docs/2-technical-design.md`: stack, database, AI pipelines, planner, app blocker, integrations
- `docs/3-roadmap-and-build-guide.md`: week-by-week checklist (the current milestone is the first unchecked week)
- Read the relevant sections before coding. If the docs and the code disagree, ask.

## Stack
React + TypeScript + Vite · Tailwind CSS + shadcn/ui · React Router · TanStack Query · Zustand · Zod · date-fns · Capacitor (Android) · Supabase (Postgres + RLS + pgvector, Auth, Storage, Edge Functions, Cron, Vault) · Vitest

## How to work
1. Before coding, list the files you will create or change and why. Wait for approval if more than 3 files change.
2. One small task at a time. Don't build ahead of the current milestone.
3. Don't add libraries that aren't in the technical design without asking.
4. After each step, run the type check and tests, then give exact steps to test it on web and Android.
5. Explain new concepts in simple words.
6. Never rewrite large parts of the app to fix a small bug.

## Code rules
- TypeScript strict mode; avoid `any`.
- Database changes only through SQL migrations in `supabase/migrations/`. Regenerate types after each migration.
- Every table has Row Level Security. Users can only read and write their own rows unless the design says otherwise.
- The app only uses the Supabase URL and publishable (anon) key. Service role key, AI keys and OAuth secrets live only in Edge Function secrets. Never commit `.env`.
- Every AI call goes through `supabase/functions/_shared/ai.ts`: model tier from env vars, quota check, Zod validation, usage logged to `ai_usage`.
- Planner, priority, mastery, metrics and spaced-repetition code are pure functions with Vitest tests.
- Store timestamps as UTC (`timestamptz`); show them in the user's timezone.
- Mobile-first UI that works in the Android app (Capacitor WebView) and desktop browsers.
- Native Android code (Kotlin) only for things the web can't do (app blocking, share target, Health Connect).

## After finishing a milestone
- Tick its checklist in `docs/3-roadmap-and-build-guide.md`.
- Add important decisions to the decisions log in `README.md`.
