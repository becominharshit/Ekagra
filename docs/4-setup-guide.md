# Setup Guide: Supabase, Google Sign-In, Android, AI and the Beta

You only need this for real accounts. **Demo Mode works without any of it**: open the app and tap **Try Demo Mode**.

It takes about 30–45 minutes the first time.

Values used below:

| Name | Value |
|---|---|
| Android app ID | `app.ekagra.student` |
| Android return link | `ekagra://auth/callback` |
| Web return page (development) | `http://localhost:5173/auth/callback` |
| Web return page (online, step 7) | `https://<your-site>/auth/callback` |
| Privacy policy (online, step 7) | `https://<your-site>/privacy` |
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
- `db:push` creates every table, security rule (RLS) and storage bucket from the files in `supabase/migrations/` (`001_phase1_core.sql`, then `002_hustle_mode.sql`, `003_beta.sql` (feedback), `004_attendance_grades.sql`, `005_adaptive.sql` (practice ratings, weekly metrics and challenges), `006_weekly_review.sql`, `007_life.sql` (habits, workouts, meals, sleep, steps and speaking practice), `008_social.sql` (partners, study groups, nudges; it also turns on Realtime for them and for AI Anchors), `009_studio.sql` (notes made in Ekagra Studio) and any later ones). Run it again whenever a new migration file appears; it only applies the new ones.
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

### Partner, groups and Realtime: test with two accounts

Partners and groups need two people, so use two test-user accounts: one in a normal window and one in a private (incognito) window or another browser.

1. Both: Me → **Partner and groups** → **Start sharing**.
2. **Partner:** A taps **Get a code** and copies it; B pastes it under "Have a friend's code?" → **Become partners**. Both now see each other with their numbers.
3. **Nudges:** A taps **Cheer** on B. Within a second or two (Realtime), B's Partner and groups page and Today show the nudge; **Got it** hides it. A fourth nudge on the same day says 3 is the limit.
4. **Groups:** A makes a group; B joins with its code. Both turn on "Show me on group leaderboards": the leaderboard lists them by this week's focus minutes.
5. **Studying now and group focus:** A starts a group focus (25 min). B's group shows "A until …" and Today shows **Group focus now** → **Join** starts B's own focus for the minutes left.
6. In Supabase → **Database → Publications → supabase_realtime**, the tables `shared_stats`, `nudges`, `group_sessions`, `group_members` and `ai_anchors` are listed (migration 008 adds them). If changes only show after a minute, check that Realtime is on for the project.

### Ekagra Studio (the Studio Bridge)

Ekagra Studio (App #2) is a separate app. AI Anchors pass between the two apps:
- **By link:** Studio is opened with `?bridge_payload=…`, the anchor as URL-safe base64 JSON.
- **On Android:** by the `ekagra-studio://anchor` deep link (and back: `ekagra://anchor`).
- **Same address:** if Studio runs at the same address (for example under `/studio`), tabs also talk on `BroadcastChannel('ekagra_app2_studio_bridge_v2')`.
- **Signed in:** when both apps use the same Supabase account, Realtime on `ai_anchors` shows each app's anchors in the other at once.

1. In development, run Studio on http://localhost:5174 (its own project) next to Ekagra on http://localhost:5173.
2. Elsewhere, add `VITE_STUDIO_URL` to `.env` (for example `VITE_STUDIO_URL=https://studio.example.com` or `https://example.com/studio`) and restart `npm run dev`. This setting is only described here, not in `.env.example`. Without it, the app uses http://localhost:5174.
3. Try it: open a PDF in the Library → an AI Anchor → **Open in Ekagra Studio**. A Studio tab opens with the anchor.
4. Studio can open an anchor in Ekagra with `http://localhost:5173/?bridge_payload=…`: Ekagra opens that PDF at the anchor's page, with the anchor shown.

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

### Health Connect and the microphone: test on real phones

Health Connect, the microphone and the camera only work on a phone. Try Android 13 (Health Connect is an app from the Play Store) and Android 14 or 15 (it's part of Android) if you can.

1. **Health Connect:** Life → **Sleep & steps**.
   - On Android 9–13 without it, the card says **Install Health Connect** and opens the Play Store. Install it, come back, and the card says **Connect**.
   - **Connect** opens Health Connect's own screen with "Sleep" and "Steps". Allow both; the card then says "Connected" and "Brought in … nights … days".
   - With no data yet, walk with the phone (or open Google Fit or a watch app that writes to Health Connect), then tap **Sync now**.
   - After a few synced nights: Me → **Weekly review** → **Make my review**. The **Sleep and study** card shows them (for a review already made, the next week's will).
2. **Privacy link:** on Health Connect's permission screen (or Android 14+ Settings → Security and privacy → Privacy → Health Connect → Ekagra), tap the link about the app's privacy policy. Ekagra opens on its privacy page.
3. **Taking access back:** **Health Connect settings** → Ekagra → turn both off. Back in Ekagra, the card says **Connect** again, and the typed nights and steps still show.
4. **Microphone:** Life → **Speaking** → **Start speaking**. Android asks once for the microphone; allow it. Speak for 20 seconds, **Stop** and play it back. The Android app usually can't turn speech into text (the WebView has no speech-to-text), so type what you said in the box, then **Get feedback** (signed in) or **Count my pace and fillers**.
5. **Camera:** Life → **Meals** → **Take a photo** opens Android's camera; take a photo of food. The estimate appears (a marked sample in Demo Mode).

## 6. AI features (Claude, by Anthropic)

Demo Mode never uses this: there, AI features give sample answers made on the device. Signed-in students get real answers once these steps are done.

1. Get an Anthropic API key. Sign in at https://platform.claude.com and open **API keys** (https://platform.claude.com/settings/keys) → **Create key**.
   - Pick a long expiration: when the key expires, the AI stops until you set a new one.
   - Copy the key now: it starts with `sk-ant-` and is shown only once.
   - Under **Billing** (https://platform.claude.com/settings/billing), add credits; the API is pay-as-you-go. You can also set a monthly spend limit there, a second safety net next to the app's own budget.
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (it is git-ignored) and paste the key after `AI_API_KEY=`. Everything else is already filled in: Claude Sonnet 5.5 for Smart tasks, Claude Haiku 5.5 for Fast ones, and how much each thinks first. The app knows their prices; the file links to Anthropic's pages to check them.
3. Send the secrets to Supabase: `npm run functions:secrets`
4. Deploy the functions: `npm run functions:deploy` (no Docker needed). Run it again whenever something in `supabase/functions/` changes.

**Had Gemini secrets in Supabase before?** Remove the old model names and prices, then do step 3 again: `npx supabase secrets unset AI_MODEL_SMART AI_MODEL_FAST AI_PRICE_SMART_INPUT AI_PRICE_SMART_OUTPUT AI_PRICE_FAST_INPUT AI_PRICE_FAST_OUTPUT`. A model name that isn't Claude stops the AI with "Check these Edge Function secrets: AI_MODEL_…", and a refused key says "Anthropic refused the AI key".

**Check:** Supabase → **Edge Functions** lists the 12 AI functions (`ai-syllabus`, `ai-papers`, `ai-tutor`, `ai-generate`, `ai-capture`, `ai-inbox`, `ai-brief`, `ai-hustle`, `ai-grade`, `ai-review`, `ai-meal`, `ai-speak`) and 2 without AI: `ai-usage` (the AI usage card on Me) and `account-delete` (wiping data and deleting accounts). Those 2 need no AI secrets, but they must be deployed. **Edge Functions → Secrets** lists the `AI_…` names. Then, signed in: import a syllabus (Academics → a subject → Import syllabus), open a topic → **Make my lesson**, add a screenshot of the portal with the **+** button, and tap refresh on Today's **Morning brief** (it should say "Written by the AI"). **Me → AI usage** then shows those requests, today and this month, with their cost. To try `ai-grade`: Academics → a subject with a past paper → **Mock test** → Start, write an answer or two, **Hand in**: the written answers should say "Marked by the AI". To try `ai-review`: Me → **Weekly review** → **Make my review**; the card should say "written by the AI". To try `ai-meal`: Life → **Meals** → **Choose a photo** (any food photo); the estimate should say "AI estimate". To try `ai-speak`: in Chrome or Edge, Life → **Speaking** → **Start speaking**, answer for 30 seconds (your words show as you speak), **Stop**, check the words, **Get feedback**; the session should say "feedback from the AI", with scores. To try `ai-inbox`: tap **Add** in the top bar and add a photo of your timetable; it should list your classes with their days and times, and **Save my class times** puts them in your routine (sleep and meals stay). A syllabus PDF should open Import syllabus already filled in.

The Coding Lab doesn't need any of this: Python runs on the device. Its first run downloads Python (about 13 MB) from the jsDelivr CDN, so that one needs the internet.

**Limits:** every AI request goes through `supabase/functions/_shared/ai.ts`. Each student can make `AI_USER_DAILY_REQUESTS` requests in 24 hours, and the whole app can spend at most `AI_MONTHLY_BUDGET_USD` ÷ 30 in 24 hours. Every request's tokens and cost are saved in the `ai_usage` table.

**Free tier:** Google may use free-tier prompts to improve its models. Turn on billing for the key before friends upload their own material.

## 7. Put the web app online

Any static host works. These steps use Netlify; Vercel and Cloudflare Pages are much the same. All three are free for this size.

1. Push the project to a private GitHub repo, if it isn't there yet.
2. Netlify → **Add new site → Import an existing project** → pick the repo:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the same values as your `.env`), and optionally `VITE_CONTACT_EMAIL` (the contact address on the privacy page; without it, the page points to the feedback button) and `VITE_STUDIO_URL` (where Ekagra Studio runs online, for **Open in Ekagra Studio**; step 4).
3. The app has its own addresses (`/academics`, `/privacy`, …), so the host must answer every address with `index.html`:
   - Netlify: a file `public/_redirects` with the line `/* /index.html 200` (Vite copies it into `dist`).
   - Vercel: a `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
   - Cloudflare Pages: nothing to do.
4. Deploy, then copy the site's address, e.g. `https://ekagra.netlify.app`.
5. Supabase → **Authentication → URL Configuration**: set **Site URL** to the site's address, and add `https://<your-site>/auth/callback` to **Redirect URLs** (keep the `localhost` and `ekagra://` ones).
6. Google Cloud → **Google Auth Platform → Branding**: home page `https://<your-site>`, privacy policy `https://<your-site>/privacy`, and the site's domain under authorized domains. The redirect URI from step 3a stays as it is.
7. Updates: every push to GitHub deploys again by itself.

**Check:** open the site, sign in with Google, open Academics and reload the page (it must not say "Page not found"), and open `https://<your-site>/privacy` in a private window (it shows without signing in).

### Install Ekagra as an app (laptop, Chromebook or phone)

The online site is an installable web app: it gets its own window and icon, and it updates itself with every deploy.

1. Open the site in Chrome or Edge.
2. Click the install icon at the right end of the address bar (or menu → **Cast, save and share → Install page as app** in Chrome, **Apps → Install this site as an app** in Edge). On Android Chrome: menu → **Add to home screen → Install**. On an iPhone, Safari: **Share → Add to Home Screen**.
3. Ekagra opens in its own window. On a wide screen it shows a side menu instead of the bottom tabs.

Pages you have opened before also open without a connection (the data still needs one, except in Demo Mode). This works only in production builds, never in `npm run dev`, so changes always show while you build. To try it on your computer: `npm run build`, then `npx vite preview`, open http://localhost:4173 and install it from there. To remove it: Chrome → `chrome://apps` (or the app's menu) → **Uninstall**.

## 8. The APK for friends

The APK that **Run ▶** installs is a debug build for your own phone. For friends, make a signed release APK:

1. Before every new APK, raise `versionCode` by 1 in `android/app/build.gradle` (2, 3, …) and set `versionName` (e.g. `"0.2"`). Android only installs an update with a higher `versionCode`.
2. Run `npm run android`: it builds the web app, copies it into the Android project and opens Android Studio.
3. **Build → Generate Signed App Bundle or APK → APK → Next.**
4. The first time, **Create new…** key store. Save the `.jks` file and its passwords somewhere safe **outside** the project folder (`.gitignore` also ignores `*.jks`). Every later APK must be signed with the same key; otherwise friends have to uninstall the app (losing what it kept on the phone) before they can install the new one.
5. Pick **release** → **Create**. The APK is `android/app/release/app-release.apk` (ignored by Git).
6. Share it through **Firebase App Distribution** (free: friends get an email and a simple way to update) or a Drive link. On the phone they allow "Install unknown apps" for the app they open it with.
7. Each friend signs in, then does Me → Focus and app blocking and follows the battery guide for their phone. Add their Gmail as a test user first (step 3a).

Me → Feedback shows when the running app was built ("App build … (UTC)"), so you can tell which APK or web version a bug report came from.

## 9. Running the beta: feedback and AI spend

- **Feedback:** Supabase → **Table Editor → feedback** (sort by `created_at`). Each row has the kind, the message, the screen and its address, and the device in `context`. A screenshot is in **Storage → images →** the student's user id **→ feedback**. Set `status` to `seen`, `planned`, `fixed` or `closed`; the student sees it on Me → Feedback ("Read", "Planned", "Fixed", "Closed").
- **AI spend:** every student sees their own on Me → AI usage. For everyone, run this in Supabase → **SQL Editor**:

  ```sql
  select p.full_name, u.feature, count(*) as requests, round(sum(u.cost_usd), 4) as usd
  from public.ai_usage u
  left join public.profiles p on p.id = u.user_id
  where u.created_at >= date_trunc('month', now())
  group by p.full_name, u.feature
  order by usd desc;
  ```

- **Account controls:** to test them, use a test account, not your own: Me → Privacy, export and delete → **Export all data** (a JSON file), **Wipe my data** (type DELETE: the app goes back to setup, and the account stays), **Delete my account** (type DELETE: you're signed out, and Supabase → **Authentication → Users** no longer lists the account).

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
| "The ai-usage function isn't on the server yet" (Me → AI usage) or "The account-delete function isn't on the server yet" | Deploy them: `npm run functions:deploy` (step 6) |
| "Deleting didn't finish" | Tap the button again: it carries on with what is left. If it keeps failing, check Supabase → **Edge Functions → account-delete → Logs** |
| The online app says "Page not found" after a reload | The host must answer every address with `index.html` (step 7, item 3) |
| Signing in on the online app returns to `localhost` | Add the site to Supabase's Site URL and Redirect URLs (step 7, item 5) |
| A friend's phone says "App not installed" when updating | The new APK has the same or a lower `versionCode`, or was signed with another key (step 8) |
