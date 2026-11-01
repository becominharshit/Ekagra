# Product Spec

**Phase tags:** **P1** core loop · **P2** practice and challenge · **P3** hustle mode · **P4** full Life section · **P5** Tools app and beyond

## 1. Problem

An ambitious, hardworking student is stuck:

- His marks are low and he can't practice consistently.
- Social media fills every gap, and time disappears.
- He juggles studies, communication, health/gym/diet and a side hustle with no single plan, so his routine crashes and he stops feeling like working.
- He wants a side hustle (freelancing, content, startup…) for exposure and money, but can't start it or keep it going.

**Root causes**
- Too many areas + no plan → decision fatigue.
- No clear "next task" → he picks up the phone.
- No visible progress → motivation drops.
- Missed days pile up → guilt → quitting.

## 2. Vision

> An AI mentor that tells you what to do now, teaches you, tests you, protects your focus, and adjusts when life happens, across studies, side hustle and health.

The student follows the app like a personal mentor instead of planning everything himself.

## 3. Users

- **Primary (P1–P3):** college students, starting with the founder and 5–20 friends/classmates. Ambitious but distracted; Android phone + laptop.
- **Later:** students from other colleges and years, school students, self-learners.

## 4. Design principles

1. **One next task.** The Today screen always shows the single most important thing to do now.
2. **AI proposes, student approves.** Everything the AI creates (topic lists, plans, flashcards) can be edited.
3. **No guilt pile.** Missed work is spread out automatically; overdue lists never explode.
4. **Challenge, don't crush.** Targets rise only after steady success and drop when he struggles.
5. **Fewer decisions, fewer distractions.** A feature that adds decisions or screens without removing others doesn't ship. No infinite feeds, ever.
6. **Grounded AI.** Answers come from the student's own material, with page or timestamp references when possible.
7. **Private by default.** Data is visible only to its owner unless they choose to share.

## 5. App structure

Bottom tabs: **Today · Academics · Hustle · Life · Me**, plus a global **+** (capture) button.

```
Today      AI mentor: now, up next, due soon, check-ins
Academics  Subjects → roadmap, materials, practice, tutor, progress
Hustle     P1: hustle tasks + time budget   P3: full module
Life       P1: habits + check-in            P4: full module
Me         Progress, weekly review, settings, integrations, account
```

A chip in the header shows the current mode from the plan: **Study / Hustle / Life / Free**.

### Mode switching (P3)
- Opening a section outside its scheduled time shows a warning, not a block: "It's Study time until 6:00 PM. Switch anyway?"
- Reason buttons: Done early · Urgent work · Taking a break · Other. Reasons are logged and shown in the weekly review.
- **Strict mode (P5):** sections are locked during scheduled blocks, with a limited emergency override.

## 6. Onboarding (P1)

1. Sign in with Google.
2. Profile: college, program, year, semester.
3. Weekly routine: class timetable (typed in; **P2:** photo → AI reads it), sleep and wake time, gym, meals, commute.
4. Rhythm: early bird / neutral / night owl, and best focus hours.
5. Subjects: add subjects, upload each syllabus (PDF, photo or pasted text), add exam dates ("not announced yet" → estimated from the semester end).
6. Focus apps (Android): pick apps to block during focus (Instagram, YouTube, Snapchat, games…).
7. Mentor style: strict / balanced / friendly.
8. Time budget: how free time is split between Academics, Hustle and Life (default 55 / 25 / 20).
9. Result: first roadmap and today's plan, with a short AI explanation.

## 7. Today: the AI mentor (P1)

- **Now card:** the current block, e.g. "DBMS · Normalization · 45 min · lesson + 10 flashcards". **Start** opens a focus session.
- **Up next:** the next 2–3 blocks.
- **Due soon:** tasks due in the next 72 hours.
- **Reviews due:** flashcards and mistakes waiting.
- **Day progress:** planned vs done minutes per area.
- **Morning brief:** 3 lines from the AI on what matters today and why.
- **Evening check-in (1 minute):** mark blocks done/partial/missed, rate energy and mood 1–5, name the biggest distraction. Triggers re-planning.
- **Minimum day:** one button shrinks today to 30–45 minutes of essentials.
- **"I have X minutes":** AI suggests the best use (flashcards, quick quiz, small task).

## 8. Academics

### 8.1 Subjects and syllabus (P1)
- Upload a syllabus (PDF, photo or text). The AI extracts **units → topics** and adds, for each topic: estimated minutes, difficulty (1–5), prerequisites and exam weight.
- The student reviews and edits the topic tree before it's saved.
- Each subject has two tracks:
  - **Exam track:** what the university exam tests, in the university's wording, prioritized using past papers.
  - **Skill track:** modern, industry-relevant depth suggested by the AI (e.g. for Python: projects, libraries, clean code). Optional; paused in exam season.

### 8.2 Past papers (P1)
- Upload previous years' question papers (PDF or photos).
- The AI extracts every question with its marks and type (theory, numerical, code, diagram) and maps it to a topic.
- Per topic: times asked, share of total marks, last year asked, typical question types. Plus a "most repeated questions" list.
- Feeds topic priority in the roadmap and the mock-test pattern (P2).

### 8.3 Roadmap and deadlines (P1)
- Ordered topic list per subject, with a **target date** for each topic based on the exam date, free hours and learning speed.
- Shows % complete, on track / behind, and the projected finish date.
- Updates automatically when things change (see Planner, §11).

### 8.4 Library (P1)
- Add PDFs (books, notes, slides) and YouTube links **(P1)**; video/audio files (transcribed, file not kept on the server) and Google Drive import **(P2)**.
- The AI splits material into sections and links each section to syllabus topics.
- **PDF viewer** with an AI side panel: explain this page, simplify, give an example, make flashcards from this page.
- **YouTube viewer** with transcript, chapters and "explain this part" at the current timestamp.

### 8.5 Lessons (P1)
Generated per topic **when the student reaches it**, not for the whole book at once:
- Simple explanation, key ideas, worked examples, common mistakes, a "how to write this in the exam" tip, and links back to the source pages or timestamps.

### 8.6 Learn anything (P1 basic, P2 full)
- "Teach me X" with no material: the AI builds a course outline, then lessons, quizzes and flashcards.
- **P2:** adds verified free resources (YouTube videos found through the YouTube API, official docs). The AI never invents links.
- Also powers the Skill track and the Hustle skill bridge.

### 8.7 AI tutor (P1)
- Chat per subject or per material. Answers come from the student's material with page/timestamp references.
- If the answer isn't in the material, it says so and gives a general answer, clearly labelled.
- Modes: **Explain** (simple language), **Socratic** (guides with questions instead of giving the answer), **Exam answer** (how to write a 2/5/10-mark answer).
- Explanation language: English, Hindi or Hinglish (setting).

### 8.8 Practice (P1 quizzes, P2 mock tests)
- **Check quiz:** 3–5 questions after every lesson (active recall).
- **Topic and subject quizzes:** MCQ, short answer, numerical; code questions from P2.
- Short answers are graded by AI against key points, with feedback and a model answer.
- **Subject practice (P2, built in M11):** 10 questions at a time, picked so he gets about 7 in 10 right; wrong answers go to the mistake notebook.
- **Mock tests (P2, built in M11):** timed, in the real exam pattern detected from past papers (a full or a half paper, 1.8 minutes per mark), handed in by themselves when the time is up. The test stays on the phone if he leaves the screen. Written answers are marked by the AI against key points (a rough mark on the device in Demo Mode); he can change written marks before saving. Results come per topic, weakest first, and answers under half marks go to the mistake notebook.

### 8.9 Flashcards (P1)
- Made automatically from lessons and material; the student can add and edit cards.
- Scheduled with spaced repetition (FSRS): each card comes back just before he'd forget it.
- Daily review queue with a time estimate; ratings Again / Hard / Good / Easy.

### 8.10 Mistake notebook (P1)
- Every wrong answer, forgotten card and (P2) failed code test creates an entry: the concept, why it was wrong, the correct approach.
- Mistakes come back after 1, 3 and 7 days and are marked fixed after 3 correct answers on different days (right at each of the three reviews). A wrong answer starts the ladder again.

### 8.11 Coding practice (P2)
- In-app editor with syntax highlighting; Python runs inside the app (no server).
- Problems generated from the current topic or taken from the textbook's exercises; test cases check the answer.
- **Hint ladder:** nudge → approach → pseudo-code → solution (only after real attempts). Hints used are tracked.
- **P5:** C, C++, Java, JavaScript through a code-runner service.

### 8.12 Progress and learning metrics (P1 basic, P2 full)
- **P1:** mastery per topic, focus minutes, flashcard retention, streak.
- **P2 (built in M11):** four metrics, saved each week and shown on Academics → Progress as charts over 9 weeks (formulas in the technical design §9):
  - **Memory:** how much he remembers on reviews
  - **Learning speed:** time to master a topic vs the estimate
  - **Processing speed:** time per correct answer in timed practice
  - **Problem solving:** first-try accuracy on new, harder problems
- **Exam readiness score (P2, built in M11)** per subject: combines topic coverage, mastery and mock-test scores (40/40/20). It shows on the subject list, on each subject and on Progress.

### 8.13 Adaptive challenge (P2, built in M11)
- Questions are picked so he succeeds about 70% of the time: hard enough to grow, easy enough to keep going.
- Weekly challenge on one metric at a time: the target rises 5–10% after two good weeks and drops 5% after two missed weeks.

### 8.14 Attendance and marks (P2, built in M12)
- Attendance per subject, with a warning before it drops below the college minimum (75% unless changed): Today asks about each class time in the routine that names its subject (Present, Absent, Cancelled); each subject shows its %, how many classes can still be missed ("safe bunks"), how many in a row get it back above the minimum, and, with the last day of classes, what the rest of the semester allows.
- Internal/assignment marks per subject; SGPA/CGPA calculator with an editable grade scale (10-point by default), credit-weighted, earlier semesters typed in, and the SGPA needed for a target CGPA.

### 8.15 Exam season mode (P3)
Starts automatically N days before the first exam (default 21):
- Skill track paused; more revision and mock tests each week.
- Hustle time cut to a minimum (default 5%); optional Life tasks reduced, sleep and short workouts kept.
- Ends after the last exam with a "welcome back" plan for the hustle.

## 9. Tasks and capture (P1)

One list for everything: assignments, college activities, personal to-dos and hustle tasks.

The college portal has no API, so tasks are **captured**:

| Method | Phase |
|---|---|
| Quick add in plain words: "DBMS assignment due Friday 5pm" | P1 |
| Screenshot or photo of the portal or a notice → AI extracts all tasks | P1 |
| Share text or images from WhatsApp, the portal or email into the app (Android share menu) | P1 |
| Google Calendar events imported as fixed blocks | P1 (stretch) |
| College/portal emails in Gmail turned into tasks automatically | P2 |
| Browser extension that reads the portal page while you're logged in | P5 |

- Each task: title, area, subject or hustle, due date and time, estimated effort, priority, status, source.
- Extracted tasks always appear in a **confirm sheet** first; unclear fields (like dates) are highlighted.
- Reminders 3 days, 1 day and 3 hours before (customizable), plus a nudge if the task isn't started.
- The planner schedules work time before each deadline, aiming to finish a day early.

## 10. Focus engine

### 10.1 Focus session (P1)
- Starts from the Now card (one tap, your usual timer fitted to the block's time left) or manually (Study, Hustle or Life). Timer styles: Pomodoro 25/5, Deep work 50/10, custom; pause and resume; a soft chime when a phase ends.
- Shows the current block, links to the lesson/material, and an **"I got distracted"** button (one tap on a reason, or a few words; the evening check-in suggests the day's most noted one).
- **Idle check:** a study session pauses itself after 4 minutes without a tap, scroll or key press ("I'm studying away from the screen" turns it off for that session).
- On finish: done / partial / stopped. The minutes focused (no breaks or pauses) go back to the planner, and to the hustle's hours for hustle work.

### 10.2 App blocking on Android (P1)
- Chosen apps are blocked during focus sessions (option: during every Study block).
- Opening a blocked app shows a full-screen page: "Focus: DBMS · 18 min left" → **Back to study** or **Emergency unlock (Academic Tollbooth)**.
- The **Academic Tollbooth**: answer 3 rapid-fire questions from your current subject (20 seconds each), then give a reason. All right: blocked apps open for 3 minutes (3–5 in settings), at most 3 times a day; logged. A wrong answer keeps them blocked, shows the right answer and offers the Mistake Notebook; the next try waits a minute.
- Always allowed: phone, messages, maps, clock, this app, and any apps the student adds.
- A setup screen explains each permission in simple words and walks through battery settings on phones that kill background apps.

### 10.3 Screen time (P2)
- Daily minutes on chosen apps; weekly chart of scrolling time vs focus time.

### 10.4 Web
- Focus timer works in the web app (P1). Website blocking needs a browser extension (P5).

## 11. Planner: the brain (P1)

Turns goals into a realistic daily schedule and keeps fixing it.

- **Inputs:** routine and classes, calendar events, deadlines, roadmap topics, reviews due, time budget per area, energy hours, learning speed, preferences.
- **Output:** time blocks for today and a tentative plan for the next 14 days (learn, review, practice, task work, hustle, life, breaks, buffer).
- **Rules:**
  - Hardest topics in his best focus hours; reviews and light tasks in low-energy slots.
  - Subjects are mixed; no more than 2 blocks of the same subject in a row.
  - 10–15% of free time stays as buffer.
  - Deadlines first, then roadmap topics by priority.
  - Nothing inside the sleep window.
- **Auto-recovery:** unfinished work is spread over the coming days (at most +20% on any day). If it no longer fits, the app offers options: use buffer/weekend time, skip optional Skill-track topics, or move a self-set target. The student chooses.
- **Minimum day:** only the top item (≤30 min) + reviews due (≤15 min); the rest moves.
- **Low-energy day:** energy 1–2 at check-in makes the next day lighter.
- **When it re-plans:** when the app opens with an old plan, after the evening check-in, and when deadlines, tasks or routine change.
- **Time budget (default):** Academics 55%, Hustle 25%, Life 20% of free time. Editable; exam season changes it automatically (P3).

## 12. Weekly AI review (P2, built in M13)

Every Sunday (customizable), a 5-minute review (Me → Weekly review; a card on Today on the review day and the day after, and on Android a notification at 18:00):

- Hours per area vs budget, topics completed, quiz accuracy and retention, focus minutes, top distractions (apps and times), **(P3)** income and hustle progress, **(P4)** sleep and workouts.
- **3 insights** and **3 suggested changes** for next week, e.g. "Move DBMS to mornings; your accuracy is 20% higher before noon." The student accepts or edits each change.
  - As built: the changes come from a fixed list the app can apply in one tap: study a subject at a part of the day, move budget between areas, the buffer, the daily review cap, new flashcards a day, block length, best focus hours, revision days, blocking apps in every study block, next week's challenge, a skill course's weekly time.
  - Each one can be edited before applying, or skipped. Applying a setting re-makes the plan.
  - In Demo Mode, or without the AI, the device writes the review from rules.
- Sets next week's challenge (one of the changes, or picked directly on the review screen).

## 13. Hustle mode

### 13.1 In P1
- Hustle time is part of the weekly budget, so the planner reserves hustle blocks.
- Hustle tasks live in the task list (area = hustle).

### 13.2 Full module (P3)
The student adds one or more hustles and picks a type: **Freelancing, Content creation, Startup/business, Part-time/tutoring, or Custom.**

Each hustle has a goal (e.g. "first ₹10,000 by January"), phases with steps from a template, tasks, time tracking, money, links, notes and an AI coach.

**Templates**

| Type | Phases |
|---|---|
| Freelancing | Choose skill and niche → Upskill (skill bridge) → Portfolio (3 samples) → Profiles (Upwork, Fiverr, LinkedIn) → Proposals and outreach (daily quota) → First client and delivery → Reviews and testimonials → Raise rates and repeat clients |
| Content creation | Niche and audience → Content pillars → Content calendar → Script → Record → Edit → Publish → Analyze and improve |
| Startup / business | Problem and idea → Customer interviews (validation) → Solution and MVP scope → Build MVP → First 10 users → Launch → First revenue → Growth and funding (college incubator, competitions) |
| Part-time / tutoring | Define the offer → Pricing → Find students/clients → Schedule sessions → Deliver → Collect payment and feedback |
| Custom | The AI creates phases from the student's description |

**Inside a hustle**
- **Pipeline board** that fits the type: orders (proposal → active → delivered → paid), content (idea → script → record → edit → published), experiments (startup), sessions (tutoring).
- **Clients:** name, platform, contact, projects, total earned.
- **Money:** income and expenses, monthly profit, goal progress.
- **Time:** hustle focus sessions are tracked automatically; manual entries allowed.
- **Earnings per hour** = profit ÷ hours spent, per hustle and per client: "₹6,000 in 40 h = ₹150/h".
- **Skill bridge:** a step that needs a skill (video editing, React, copywriting) gets a **Learn this** button that creates a Skill course in Academics with a weekly time limit.
- **Launchpad:** opening an outreach or social platform from Hustle (Upwork, Instagram, LinkedIn, your own profile links…) starts a 10-minute session with a goal ("Send 3 proposals"). A bar shows the time left on every screen; when it ends, "Did you do it?" Done, the minutes count as hustle time.
- **Capture:** the global + button saves hustle to-dos (with their hustle) and leads, which go straight onto the hustle's pipeline board.
- **AI coach:** weekly tips based on real data, e.g. "Your proposal reply rate is 5%. Try shorter proposals that start with the client's problem."
- **Integrations:** YouTube/Instagram stats, Gmail, payments, GitHub, Notion, freelance platforms (technical design §12).

## 14. Life

### 14.1 In P1
- Sleep window, gym, meals and water as habits and fixed blocks in the plan.
- Daily check-off and the evening check-in (energy and mood).

### 14.2 Full section (P4)
- **Fitness:** AI workout plans by goal, level and equipment (gym, home, hostel); log sets and reps; progress charts.
- **Diet:** log meals by photo (AI estimates calories and protein, shown as estimates); daily targets; simple meal ideas for a student budget and hostel/canteen food.
- **Sleep and steps:** from Health Connect (works with many phones, watches and fitness apps); sleep consistency score; the weekly review shows how sleep affects study results.
- **Communication:** AI speaking partner for 5–10 minutes of daily voice practice (interviews, presentations, group discussions, small talk) with feedback on clarity, filler words, pace and vocabulary, and progress over time.
- **Burnout guard:** several low-energy days in a row → lighter plan and a check-in message.
- Health features are not medical advice, and the app says so.

## 15. Accountability and friends (P2)
- **Accountability partner:** share chosen stats (focus hours, streak, plan completion), send nudges, weekly check-in.
- **Friend groups:** see who's studying now, start group focus sessions, opt-in weekly leaderboard of focus minutes.
- Share notes and flashcard decks with the group, not uploaded books (copyright).

## 16. Me: progress, settings and customization
- Progress dashboard, weekly review history, streaks.
- **Customization**
  - Mentor tone: strict / balanced / friendly
  - Look: light / dark theme, accent colour
  - Focus: timer lengths, blocked apps, block during focus sessions only or all Study blocks, emergency unlocks per day
  - Planner: time budget per area, max study hours per day, rest day, buffer %, exam season start (days before exams)
  - Learning: new flashcards per day, target retention, explanation level, explanation language
  - Notifications: quiet / normal / persistent, quiet hours
- Integrations: connect and disconnect accounts.
- **Account and privacy** (P1, built in M10): the privacy policy with every Android permission explained, export all data (one JSON file), wipe data (keeps the account), delete account.
- **AI usage** (P1, M10): requests in the last 24 hours against the daily limit, and this month's cost per AI feature.
- **Feedback** (P1, M10): a button on every screen sends a bug or an idea with the screen's name and an optional screenshot; the student sees what happens to it.

## 17. Notifications
- Block starting soon, deadline reminders, reviews due, evening check-in; partner nudges and weekly review (P2).
- Limits: a daily maximum, quiet hours, and nothing during focus sessions except deadlines due today.

## 18. Future Tools app (P5)
- Same login and database. Notes, diagrams, flowcharts, revision sheets and edited PDFs attach to topics and show up in the roadmap and lessons.
- Separate app or new tab: decide in Phase 5. Deep links open items in either.

## 19. Screens in P1

| Area | Screens |
|---|---|
| Start | Sign in · Onboarding (8 steps) · First plan preview |
| Today | Today · Focus session · Block page (Android) · Evening check-in |
| Academics | Subjects · Subject (tabs: Roadmap, Materials, Practice, Tutor, Progress) · Syllabus review/edit · Past-paper insights · PDF viewer · YouTube viewer · Lesson · Quiz and results · Flashcard review · Mistake notebook |
| Tasks | Task list · Capture sheet · Confirm extracted tasks · Task detail |
| Hustle | Hustle tasks and time this week |
| Life | Habits today · Check-in history |
| Me | Progress · Settings · Focus setup (permissions) · Account |

## 20. Key flows

- **First day:** sign in → onboarding → upload syllabi → review topic trees → upload past papers (optional) → first plan → start the first focus block.
- **Daily loop:** morning brief → Now card → focus session (apps blocked) → lesson → check quiz → flashcards → next block → evening check-in → re-plan.
- **Study a PDF:** upload → processing (progress bar) → sections linked to topics → when a topic is due: lesson → quiz → flashcards; ask the tutor anytime.
- **Capture an assignment:** screenshot the portal → share to the app → confirm sheet → saved → work time scheduled before the deadline → reminders.
- **Missed a day:** check-in (or next morning) → unfinished blocks spread over the next days → if it doesn't fit, pick an option → new plan.
- **Freelance order (P3):** order email arrives → app suggests an order card → work tracked in hustle sessions → payment logged → profit and earnings per hour update.

## 21. Not in scope for now
iOS app · strict mode · desktop app · website blocking · public launch, subscriptions and payments · marketplace or social feed.

## 22. How we'll know it works (beta)
- 5+ friends use it at least 5 days a week for 4 weeks.
- 70%+ of planned blocks completed on average.
- Focus minutes up and time on blocked apps down, compared with week 1.
- Flashcard retention ≥ 85%.
- Quiz scores or internal marks improve, and students feel more in control (1–5 survey).
