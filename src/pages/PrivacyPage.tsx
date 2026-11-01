import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// The privacy policy and the Android permissions (/privacy). Public, so Google's sign-in setup
// and the Play Store can link to it. Keep it true to what the app does when features change.

/** Optional: VITE_CONTACT_EMAIL in .env (docs/4-setup-guide.md). Without it, students use Send feedback. */
const CONTACT_EMAIL: string | undefined = import.meta.env.VITE_CONTACT_EMAIL

const UPDATED = '2 November 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-1.5 pl-5">{children}</ul>
}

function Contact() {
  return CONTACT_EMAIL ? (
    <a className="underline underline-offset-3" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>the Send feedback button at the top of every screen in the app</>
  )
}

export function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-y-auto">
      <main className="pt-safe pb-safe mx-auto grid w-full max-w-2xl gap-6 px-4 py-6 text-sm leading-relaxed">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2"
            // Back to the app's previous screen, or to the start when this page was opened from a link.
            onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))}
          >
            <ArrowLeft aria-hidden />
            Back
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Privacy policy and permissions</h1>
          <p className="mt-1 text-muted-foreground">Ekagra, the study mentor app. Last updated {UPDATED}.</p>
        </div>

        <Section title="In short">
          <List>
            <li>Your data is private to your account. It is never sold or used for ads. Partners and groups see only the few numbers you pick.</li>
            <li>AI features send only what a request needs to Anthropic's Claude, through Ekagra's server.</li>
            <li>Meal photos are used once for an estimate and never stored. Speaking-practice recordings never leave your phone.</li>
            <li>FocusGuard's app checks stay on your phone. Health Connect is only read, and only sleep and steps, when you allow it.</li>
            <li>You can export all your data or delete it at any time: Me → Account and privacy.</li>
          </List>
        </Section>

        <Section title="Who runs Ekagra">
          <p>
            Ekagra is built and run by a student founder. For questions or requests about your data, use <Contact />.
          </p>
        </Section>

        <Section title="What Ekagra keeps when you sign in">
          <List>
            <li>From Google sign-in: your name, email address and profile photo.</li>
            <li>
              What you add: your profile, routine and settings; subjects, topics and past-paper results; the PDFs you upload; AI Anchors, tutor
              answers, lessons, quizzes and flashcards with your answers and reviews; the mistake notebook; Coding Lab code; tasks and your plan;
              focus sessions, distractions and Tollbooth quizzes; evening check-ins (energy, mood, biggest distraction); hustles, clients, income,
              expenses and hours; the apps you chose to block.
            </li>
            <li>
              Your progress: attendance, marks and semester results, mock tests and how they were marked, your weekly learning metrics and
              challenges, and your weekly reviews with the changes you applied.
            </li>
            <li>
              Friends, if you use them: what you chose to share (see below), your partner and group links, groups you made, group focus sessions
              you started, and nudges you sent.
            </li>
            <li>
              Life: your habits and the days you did them; workouts with their sets; meals as you describe them, with estimated calories, protein,
              carbs and fat (never the photo); sleep (bedtime, wake time and minutes asleep) and steps per day, typed in or brought in from Health
              Connect; speaking practice as the transcript, the words per minute, filler words and scores (never the recording).
            </li>
            <li>
              Feedback you send, with the screen it came from, an optional screenshot and a few device details (web or Android, app build, screen
              size, browser, language and timezone).
            </li>
            <li>
              AI usage: for each AI request, the feature, the model, how much text it used and what it cost. This enforces the daily limit and the
              app's budget.
            </li>
          </List>
          <p>
            Photos and screenshots you give the AI to read (a syllabus, a task list, a meal) are sent for that one request and are not stored, on
            Ekagra's server or anywhere else.
          </p>
        </Section>

        <Section title="Meal photos and speaking practice">
          <List>
            <li>
              <strong>Meal photos</strong>: your phone makes the photo smaller first, then sends it once to estimate the food in it. The photo isn't
              uploaded to storage or kept; you check the estimate, and only the description and the numbers are saved.
            </li>
            <li>
              <strong>Recordings</strong>: the microphone records only after you tap Start speaking, and stops when you tap Stop (or after 3
              minutes). The recording stays in your phone's memory so you can play it back; it is never sent or saved. When you're signed in, your
              browser turns your speech into text as you speak if it can (Chrome and Edge use their online speech service for this, Safari uses
              Apple's); otherwise you type what you said. For AI feedback only those words are sent, once. In Demo Mode nothing leaves your device.
            </li>
          </List>
        </Section>

        <Section title="Health Connect (Android)">
          <List>
            <li>
              Ekagra reads two kinds of data from Health Connect, and only after you allow them on Health Connect's own screen: <strong>sleep</strong>{' '}
              (when you fell asleep and woke up, and how long you slept) and <strong>steps</strong> (a total per day).
            </li>
            <li>
              It reads the last 30 days when you open Life → Sleep & steps or tap Sync, to show your sleep, its regularity and your steps. It never
              writes to Health Connect and reads nothing else.
            </li>
            <li>
              What it reads is saved like the rest of your data (on your device in Demo Mode). It isn't sent to the AI, sold, used for ads or shared
              with anyone.
            </li>
            <li>
              You can take the access back at any time in Health Connect's settings (there's a button in Life → Sleep & steps), and delete the data
              with Wipe my data.
            </li>
            <li>Ekagra's use of data from Health Connect follows the Health Connect Permissions policy, including its Limited Use requirements.</li>
          </List>
        </Section>

        <Section title="Partners and study groups">
          <List>
            <li>
              Nothing is shared until you tap Start sharing (Me → Partner and groups). Then only your partners and the people in your groups see
              the name you pick and the numbers you tick: focus minutes this week, study streak, plan done %, whether you're studying now, and
              (if you choose) your place on group leaderboards. Your plan, notes, PDFs, answers and everything else stay private.
            </li>
            <li>You connect only with a code someone gives you. Removing a partner or leaving a group stops the sharing at once.</li>
            <li>Nudges you send are saved so they can reach your friend; they can see who sent them.</li>
          </List>
        </Section>

        <Section title="Ekagra Studio">
          <p>
            "Open in Ekagra Studio" puts that AI Anchor (its text, your question and the answer, cut to fit) into the link it opens, so the other
            app can show it. Nothing else is sent. If you're signed in to both apps with the same account, your anchors show in both.
          </p>
        </Section>

        <Section title="Health features are not medical advice">
          <p>
            Calorie and protein estimates, sleep and step numbers, workout programs and speaking scores are there to guide you. They are not medical,
            nutrition or fitness advice, and estimates can be wrong. If you have a health condition or plan a big change, talk to a doctor.
          </p>
        </Section>

        <Section title="Demo Mode">
          <p>
            In Demo Mode everything stays on your device, in the browser's storage. Nothing is sent to a server, and AI answers are samples made on
            the device.
          </p>
        </Section>

        <Section title="Where it is kept and who can see it">
          <p>
            Your data is stored with Supabase (a database and private file storage). Every row and file is locked to your account, so nobody else
            using Ekagra can see it, except the numbers you chose to share with your partners and groups. Connections are encrypted (HTTPS). As the app's operator, the founder has administrator access to the
            database; it is used to run the app (for example to read feedback or fix a problem), not to browse your data.
          </p>
        </Section>

        <Section title="How the AI uses your data">
          <p>
            When you use an AI feature (reading a syllabus or past paper, AI Anchors and the page tutor, lessons and quizzes, task capture, the
            morning brief, custom hustle plans, marking mock tests, the weekly review, meal estimates, speaking feedback), the app sends only what
            that request needs, such as the selected text, the page, the photo, the words of your speaking practice or the week's numbers, to
            Ekagra's server (Supabase Edge Functions). The server asks Anthropic's Claude API and sends the answer back. Your name and email
            address are not sent with it. Anthropic processes these requests under its Commercial Terms (anthropic.com/legal/commercial-terms) and,
            by default, doesn't use them to train its models. Ekagra doesn't use your data to train AI models either.
          </p>
        </Section>

        <Section title="Android permissions">
          <List>
            <li>
              <strong>Internet</strong>: to sign in, save your data and use the AI.
            </li>
            <li>
              <strong>Usage access</strong>: during a focus session, FocusGuard checks which app is on the screen so it can block the ones you picked.
              That check stays on your phone; only "a blocked app was opened" (which app, and when) is saved to your focus history.
            </li>
            <li>
              <strong>Display over other apps</strong>: shows the blocker screen on top of a blocked app.
            </li>
            <li>
              <strong>Notifications</strong>: FocusGuard's "focus is on" notification, the Launchpad's time's-up reminder, the weekly review
              reminder, and nudges and group focus from friends while the app is in the background.
            </li>
            <li>
              <strong>Microphone</strong>: records your answer during speaking practice so you can play it back, only after you tap Start speaking.
            </li>
            <li>
              <strong>Health Connect: read sleep and read steps</strong>: brings your sleep and steps into Life → Sleep & steps (see above).
            </li>
            <li>
              <strong>Foreground service</strong>: keeps FocusGuard running while you focus.
            </li>
            <li>
              <strong>Run at startup</strong>: blocking comes back if the phone restarts during a focus session.
            </li>
            <li>
              <strong>Alarms and reminders</strong>: the Launchpad reminder arrives on time.
            </li>
            <li>
              <strong>Your list of apps</strong>: to show which apps you can block. The list isn't uploaded; only the apps you pick are saved.
            </li>
            <li>
              <strong>Battery</strong>: Ekagra may ask you to turn off battery limits for it, so the phone doesn't stop FocusGuard. You change
              that in Android's settings; it isn't a permission.
            </li>
            <li>
              <strong>Files, photos and camera</strong>: Ekagra has no storage or camera permission. You pick PDFs and photos with Android's file
              picker, meal photos are taken with Android's own camera screen, and an export is saved where you choose.
            </li>
          </List>
          <p>You can turn any of these off at any time in Android's settings; the features that need them then stop working.</p>
        </Section>

        <Section title="Your choices">
          <List>
            <li>
              <strong>Export all data</strong>: one JSON file with everything you added.
            </li>
            <li>
              <strong>Wipe my data</strong>: deletes everything you added, your files included, and keeps your account. AI usage records stay,
              because they count the daily limit.
            </li>
            <li>
              <strong>Delete my account</strong>: deletes your account and all your data, files and AI usage records included.
            </li>
          </List>
          <p>All three are in Me → Account and privacy.</p>
        </Section>

        <Section title="How long data is kept">
          <p>
            Until you delete it. Wiping data or deleting your account removes the rows and files right away. Supabase's own backups may keep a copy
            for a short time (a few days, depending on the plan) until they are replaced.
          </p>
        </Section>

        <Section title="Children">
          <p>Ekagra is made for college students. If you are under 18, please use it with your parent's or guardian's permission.</p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes, this page shows the new date, and important changes are announced in the app. Questions: <Contact />.
          </p>
        </Section>
      </main>
    </div>
  )
}
