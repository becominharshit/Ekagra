# Setup Guide: Supabase, Google Sign-In, Android and AI

You only need this for real accounts. **Demo Mode works without any of it**: open the app and tap **Try Demo Mode**.

It takes about 30–45 minutes the first time.

Values used below:

| Name | Value |
|---|---|
| Android app ID | `app.ekagra.student` |
| Android return link | `ekagra://auth/callback` |
| Web return page (development) | `http://localhost:5173/auth/callback` |
| Your project ref | the random part of your project URL: `https://<project-ref>.supabase.co` |

## 1. Create the Supabase project

1. Sign in at https://supabase.com/dashboard and click **New project**.
2. Name: anything (e.g. `student-mentor`). Region: **South Asia (Mumbai)**.
3. Pick a strong **database password** and save it in a password manager. You need it in step 2.
4. Wait until the project is ready (1–2 minutes).
5. Copy two **public** values:
   - **Project URL**: on the project's home page (or **Project Settings → Data API**), e.g. `https://abcdxyz.supabase.co`
   - **Publishable key**: **Project Settings → API Keys**, starts with `sb_publishable_` (older projects call it the `anon` key)
6. In the project folder, copy `.env.example` to a new file named `.env` and fill both in:

   ```
   VITE_SUPABASE_URL=https://abcdxyz.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   `.env` is never committed to Git. **Never** put the secret (`service_role`) key in it.

## 2. Create the tables

In a terminal in the project folder:

```
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push
npm run db:types
```

- `login` opens your browser to allow the Supabase command-line tool.
- `link` asks for the database password from step 1.
- `db:push` creates every table, security rule (RLS) and storage bucket from the files in `supabase/migrations/` (`001_phase1_core.sql`, then `002_hustle_mode.sql` and any later ones). Run it again whenever a new migration file appears; it only applies the new ones.
- `db:types` writes `src/types/database.ts` from your real database. Run it again after every new migration.

**Check:** Supabase → **Table Editor** lists tables such as `profiles`, `subjects`, `hustles`, and each one says RLS is enabled.

## 3. Google sign-in

### 3a. Google Cloud: create the sign-in client

1. Open https://console.cloud.google.com and create a project (e.g. `Ekagra`).
2. Open **APIs & Services → OAuth consent screen** (Google now calls this **Google Auth Platform**):
   - App name and support email: your choice.
   - Audience: **External**, and leave the publishing status on **Testing**.
   - **Test users**: add your Gmail and your friends' (up to 100). While in Testing, only these accounts can sign in.
3. Go to **Clients** (or **Credentials → Create credentials → OAuth client ID**):
   - Application type: **Web application**
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Click **Create** and copy the **Client ID** and **Client secret**.

The Android app uses this same **Web** client: sign-in happens in the browser, and Supabase talks to Google.

### 3b. Supabase: turn on Google

1. Supabase → **Authentication → Sign In / Providers → Google** → enable it.
2. Paste the Client ID and Client secret, then **Save**.

### 3c. Supabase: allowed return addresses

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:5173`
- **Redirect URLs**: add all three
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5174/auth/callback` (used when port 5173 is busy)
  - `ekagra://auth/callback`

`supabase/config.toml` lists the same values. Keep them matching.

## 4. Try it on the web

1. Run `npm run dev`. If it was already running, restart it so it reads `.env`.
2. Open http://localhost:5173, click **Continue with Google** and pick one of your test-user accounts.
3. The first time, you land on the 4-step setup (about you, routine, rhythm, time budget). Finish it to reach **Today**, which shows a preview of your plan. **Me** shows your name and photo.
4. In Supabase → **Table Editor**: `profiles` has your row (with `onboarded_at` filled in), and `routine_blocks` has your routine.

## 5. Run the Android app on your phone

### One-time setup

1. **Android Studio**: open **More Actions → SDK Manager** and make sure the **Android 16 (API 36)** SDK Platform is installed. Capacitor 8 builds against it.
2. **Phone**: Settings → About phone → tap **Build number** 7 times. Then open **Developer options** and turn on **USB debugging**.
3. Connect the phone with a USB cable and tap **Allow** when it asks "Allow USB debugging?".

### Every time

1. Run `npm run android`. It builds the web app, copies it into the Android project and opens Android Studio.
2. Wait until Gradle sync finishes (several minutes the first time).
3. Pick your phone in the device list at the top and press **Run ▶**.
4. In the app, tap **Continue with Google**. A browser tab opens; choose your account, and the app comes back to the front signed in.

After changing web code, run `npm run android` again, then press **Run ▶**.

### FocusGuard (app blocking): test on real phones

The blocking code only runs on a phone, so test it there. Do this on Android 12, 13, 14 and 15 if you can, and on at least three makers (for example OnePlus, Realme or Oppo, Xiaomi or Redmi, Samsung). Note anything that doesn't happen as described.

1. **Setup:** Me → Focus and app blocking. Each "Turn on" opens the right Android screen; turn it on, come back, and the item shows a tick. On Android 13+ "Notifications" first shows Android's own question. Follow the battery guide for the phone (it picks the maker by itself).
2. **Pick apps:** your own apps show with icons; Phone, Messages, Settings and Clock say "Always allowed". Pick Instagram and YouTube (or any two).
3. **Blocking:** start focus on Today. A notification says "Focus: … min left · 2 apps blocked". Open Instagram: within about a second the blocker page covers it. Open Chrome or WhatsApp (not picked): no page.
4. **Back to study:** on the blocker page tap Back to study, and separately press Android's back button. Both open Ekagra on the Focus screen.
5. **Emergency unlock:** open Instagram, tap Emergency unlock (Academic Tollbooth). The Tollbooth opens for Instagram. Answer all 3 right, give a reason, Unlock: Instagram opens for 3 minutes, then the page comes back. Try once with a wrong answer: no unlock, and the next try waits a minute. After 3 unlocks in a day the button says none are left.
6. **Stats:** back in Ekagra, the opened blocked apps are saved (Supabase `distraction_events`, kind `blocked_open`).
7. **Ending:** tap Done or Stop: the notification and the blocking end. Also let a short session (Custom, 5 minutes) run out: blocking ends by itself.
8. **Restart:** start a 25-minute session, restart the phone and unlock it: within a minute the notification is back and Instagram is blocked again.
9. **Battery killers:** start a session, clear all recent apps and wait 10 minutes with the screen off; then open Instagram. It should still be blocked (if not, check the battery guide's steps for that phone).
10. **Every Study block:** in Focus settings choose "Every Study block". During a Study block, blocked apps are blocked without starting focus.
11. **Launchpad reminder:** on a hustle, open Upwork from the Launchpad and leave Ekagra. After 10 minutes a notification asks "Did you …?"; tapping it opens Ekagra with the question. With "Alarms and reminders" off (Android 14+), it may come a few minutes late.

## 6. AI features (Gemini)

Demo Mode never uses this: there, AI features give sample answers made on the device. Signed-in students get real answers once these steps are done.

1. Get a Gemini API key at https://aistudio.google.com/apikey (**Create API key**).
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (it is git-ignored) and paste the key after `AI_API_KEY=`. Model names and prices are already filled in; the file links to Google's pages to check them.
3. Send the secrets to Supabase: `npm run functions:secrets`
4. Deploy the AI functions: `npm run functions:deploy` (no Docker needed). Run it again whenever something in `supabase/functions/` changes.

**Check:** Supabase → **Edge Functions** lists `ai-syllabus`, `ai-papers`, `ai-tutor`, `ai-generate`, `ai-capture`, `ai-brief` and `ai-hustle`, and **Edge Functions → Secrets** lists the `AI_…` names. Then, signed in: import a syllabus (Academics → a subject → Import syllabus), open a topic → **Make my lesson**, add a screenshot of the portal with the **+** button, and tap refresh on Today's **Morning brief** (it should say "Written by the AI").

The Coding Lab doesn't need any of this: Python runs on the device. Its first run downloads Python (about 13 MB) from the jsDelivr CDN, so that one needs the internet.

**Limits:** every AI request goes through `supabase/functions/_shared/ai.ts`. Each student can make `AI_USER_DAILY_REQUESTS` requests in 24 hours, and the whole app can spend at most `AI_MONTHLY_BUDGET_USD` ÷ 30 in 24 hours. Every request's tokens and cost are saved in the `ai_usage` table.

**Free tier:** Google may use free-tier prompts to improve its models. Turn on billing for the key before friends upload their own material.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Unsupported provider: provider is not enabled" | Turn on Google in Supabase (3b) |
| Google shows `redirect_uri_mismatch` | The redirect URI in Google Cloud must be exactly `https://<project-ref>.supabase.co/auth/v1/callback` (3a) |
| "Access blocked: … has not completed the Google verification process" | Add that Gmail as a **test user** (3a) |
| After Google you land on `localhost:3000` or another wrong page | Add the return addresses in Supabase (3c) |
| Android: the browser stays open and the app doesn't come back | Add `ekagra://auth/callback` to Supabase Redirect URLs (3c) |
| The sign-in page says Google sign-in turns on once Supabase is connected | `.env` is missing or has a typo. Fix it and restart `npm run dev` |
| After sign-in: "The database tables don't exist yet" | Do step 2 (`npm run db:push`), then tap **Try again** |
| "The database needs the latest update" | A new migration isn't on the server yet: `npm run db:push` (step 2) |
| Android: blocked apps open normally | Me → Focus and app blocking: both "Usage access" and "Display over other apps" need a tick, and at least one app must be picked. Then follow the battery guide for your phone |
| Android: blocking stops in the middle of a session | The phone closed FocusGuard to save battery: follow the battery guide (Autostart, no battery limits, lock the app in Recent apps) |
| Android Studio: "SDK location not found" | Open the project through `npm run android` once; Android Studio then creates `android/local.properties` |
| "The AI features aren't on the server yet" | Deploy them: `npm run functions:deploy` (step 6) |
| "AI is not set up on the server yet. Check these Edge Function secrets: …" | Fill in those names in `supabase/functions/.env`, then `npm run functions:secrets` (step 6) |
| "The app's AI budget for today is used up" | Wait up to 24 hours, or raise `AI_MONTHLY_BUDGET_USD` (see the costs in the `ai_usage` table) |
