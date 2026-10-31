# Student Mentor App: Project Plan

> **Working title.** Pick a real name from the [name ideas](#name-ideas) below.

An AI mentor app for college students. It turns your syllabus, books and lectures into a daily plan, teaches and tests you, blocks distracting apps while you focus, and in later phases manages your side hustle and your health in the same place.

**Core idea:** open the app → see the one thing to do now → start. The AI does the planning; the student does the work.

## Documents

| File | What's inside | Use it when |
|---|---|---|
| [docs/1-product-spec.md](docs/1-product-spec.md) | Every feature, screen and user flow, tagged by phase | Deciding **what** to build |
| [docs/2-technical-design.md](docs/2-technical-design.md) | Stack, architecture, database, AI pipelines, planner, app blocker, integrations | Deciding **how** to build it |
| [docs/3-roadmap-and-build-guide.md](docs/3-roadmap-and-build-guide.md) | **§0: the current 2-phase plan and milestone checklist**, building with AI tools, beta testing, costs, risks | Every week while building |
| [AGENTS.md](AGENTS.md) | Project rules that AI coding tools read automatically | Keep it in the project root |

## Key decisions

| Topic | Decision |
|---|---|
| First users | You + friends/classmates (about 5–20 students) |
| Platforms | Android app + web app from one codebase |
| Builder | First-year student; AI coding tools write most of the code |
| Stack | React + TypeScript + Vite, Capacitor for Android, Supabase backend |
| Budget | $10/month at the start; college funding later if the beta shows results |
| Plan | 2 phases: Phase 1 = a fully working app (milestones M1–M10, docs/3 §0); Phase 2 = everything else |
| College portal | No API → capture tasks by typing, screenshot, share or email |
| Distraction control | Block chosen apps during focus sessions (Android); emergency unlock only through the Academic Tollbooth (3 quick questions → 3 minutes) |
| AI features | All six: syllabus → roadmap, PDF/video → lessons and quizzes, AI tutor, coding practice, past-paper patterns, adaptive challenge |
| Life section | Phase 1: routine blocks and the evening energy check-in; habits and the full section (gym, diet, sleep, communication) in Phase 2 |
| Side hustles | Phase 1 templates: freelancing, content creation, startup, custom (part-time/tutoring uses Custom) |
| Integrations | Google Calendar/Gmail/Drive, YouTube/Instagram, payments, GitHub/Notion, freelance platforms |
| Extra ideas | All seven: spaced repetition + mistake notebook, auto-recovery, exam season mode, weekly review, skill bridge, earnings per hour, accountability partner |
| Tools app | Same login and database; connects in Phase 5 |

## Phases at a glance

1. **Phase 1, a fully working app:** sign-in and Android app; Today with the 14-day planner, "I Crashed" and the evening check-in; Academics (dual-track topic tree, past-paper priority, PDF viewer with AI Anchors, lessons, quizzes, flashcards, mistake notebook, Python Coding Lab); Hustle (templates, Kanban, clients, money, earnings per hour, Skill Bridge, AI capture); focus timers and FocusGuard with the Academic Tollbooth
2. **Phase 2, everything else:** AI tutor, YouTube lectures, weekly review, learning metrics, mock tests, friends, the full Life section, integrations, exam season mode, the Tools app

Details and the milestone checklist: [docs/3 §0](docs/3-roadmap-and-build-guide.md).

## Name ideas

| Name | Meaning | Why it fits |
|---|---|---|
| **Ekagra** (top pick) | Sanskrit *ekāgra*: "one-pointed focus" | Names the exact problem the app solves |
| **Kairo** (top pick) | From Greek *kairos*: "the right moment" | Right task at the right time; easy to say anywhere |
| **Lakshya** (top pick) | Hindi/Sanskrit: "aim, target" | For ambitious students with big goals |
| Sankalp | Sanskrit: "firm resolve" | Commitment and discipline |
| Abhyas | Sanskrit/Hindi: "practice" | Learning by doing |
| DualPath | Two paths, one plan | Studies and side hustle together |
| Orbit | Everything circles one plan | Studies, hustle and health in sync |
| Focal | The focal point of your day | Short and focus-themed |
| Mentora | Your mentor | Says what it does |

Before choosing, check the Play Store, domains (.app, .in, .com) and Instagram/YouTube handles. Availability and trademarks were **not** checked.

## Decisions log

Add a dated line whenever an important decision is made or changed.

- 2026-10-31: Plan created. Stack changed from Expo to React + Capacitor because AI will write most of the code and the app is heavy on PDFs, quizzes and code editing (see technical design §2).
- 2026-11-01: Roadmap compressed to 2 phases ("Working App First", docs/3 §0). Hustle module and Python Coding Lab move into Phase 1. New: 1-click AI Anchors in the PDF viewer, and the Academic Tollbooth (3 rapid-fire questions → 3-minute unlock) replaces the reason-based emergency unlock. Hustle templates: freelancing, content, startup, custom.
- 2026-11-01: M1 done. The Phase 1 migration keeps only Phase 1 tables (AI tutor, pgvector search, calendar, habits and feedback tables move to a Phase 2 migration); signed-out visitors (`anon`) get no table access. Added PGlite (test-only) so `npm test` runs the real migration and checks RLS with two users. Kept oxlint from the scaffold for `npm run lint`.
