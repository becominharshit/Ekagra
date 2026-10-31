# Student Mentor App: Project Plan

> **Working title.** Pick a real name from the [name ideas](#name-ideas) below.

An AI mentor app for college students. It turns your syllabus, books and lectures into a daily plan, teaches and tests you, blocks distracting apps while you focus, and in later phases manages your side hustle and your health in the same place.

**Core idea:** open the app → see the one thing to do now → start. The AI does the planning; the student does the work.

## Documents

| File | What's inside | Use it when |
|---|---|---|
| [docs/1-product-spec.md](docs/1-product-spec.md) | Every feature, screen and user flow, tagged by phase | Deciding **what** to build |
| [docs/2-technical-design.md](docs/2-technical-design.md) | Stack, architecture, database, AI pipelines, planner, app blocker, integrations | Deciding **how** to build it |
| [docs/3-roadmap-and-build-guide.md](docs/3-roadmap-and-build-guide.md) | 12-week Phase 1 plan, later phases, building with AI tools, beta testing, costs, risks | Every week while building |
| [AGENTS.md](AGENTS.md) | Project rules that AI coding tools read automatically | Keep it in the project root |

## Key decisions

| Topic | Decision |
|---|---|
| First users | You + friends/classmates (about 5–20 students) |
| Platforms | Android app + web app from one codebase |
| Builder | First-year student; AI coding tools write most of the code |
| Stack | React + TypeScript + Vite, Capacitor for Android, Supabase backend |
| Budget | $10/month at the start; college funding later if the beta shows results |
| Phase 1 deadline | 2–3 months (12-week plan) |
| College portal | No API → capture tasks by typing, screenshot, share or email |
| Distraction control | Block chosen apps during focus sessions (Android) |
| AI features | All six: syllabus → roadmap, PDF/video → lessons and quizzes, AI tutor, coding practice, past-paper patterns, adaptive challenge |
| Life section | Basic habits in Phase 1; full section (gym, diet, sleep, communication) in Phase 4 |
| Side hustles | All types selectable: freelancing, content, startup, part-time/tutoring, custom |
| Integrations | Google Calendar/Gmail/Drive, YouTube/Instagram, payments, GitHub/Notion, freelance platforms |
| Extra ideas | All seven: spaced repetition + mistake notebook, auto-recovery, exam season mode, weekly review, skill bridge, earnings per hour, accountability partner |
| Tools app | Same login and database; connects in Phase 5 |

## Phases at a glance

1. **Core loop:** syllabus → roadmap → daily plan; PDF/YouTube → lessons, quizzes, flashcards; AI tutor; focus sessions with app blocking; auto-recovery
2. **Practice and challenge:** coding practice, adaptive difficulty, 4 learning metrics, mock tests, weekly review, friends and accountability
3. **Hustle mode:** templates, clients, money, earnings per hour, skill bridge, integrations, exam season mode
4. **Full Life section:** workouts, diet, sleep, AI speaking partner, burnout guard
5. **Tools app and beyond:** notes, diagrams, PDF editor, revision sheets on the same backend

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
