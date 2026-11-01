# Setup Guide: Supabase, Google Sign-In and Android

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
- `db:push` creates every table, security rule (RLS) and storage bucket from `supabase/migrations/001_phase1_core.sql`.
- `db:types` writes `src/types/database.ts` from your real database (it replaces the temporary hand-written file).

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
3. You land on **Today**, and **Me** shows your name and photo.
4. In Supabase → **Table Editor → profiles**, a row with your name was created automatically.

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

## Troubleshooting

| What you see | What to do |
|---|---|
| "Unsupported provider: provider is not enabled" | Turn on Google in Supabase (3b) |
| Google shows `redirect_uri_mismatch` | The redirect URI in Google Cloud must be exactly `https://<project-ref>.supabase.co/auth/v1/callback` (3a) |
| "Access blocked: … has not completed the Google verification process" | Add that Gmail as a **test user** (3a) |
| After Google you land on `localhost:3000` or another wrong page | Add the return addresses in Supabase (3c) |
| Android: the browser stays open and the app doesn't come back | Add `ekagra://auth/callback` to Supabase Redirect URLs (3c) |
| The sign-in page says Google sign-in turns on once Supabase is connected | `.env` is missing or has a typo. Fix it and restart `npm run dev` |
| Android Studio: "SDK location not found" | Open the project through `npm run android` once; Android Studio then creates `android/local.properties` |
