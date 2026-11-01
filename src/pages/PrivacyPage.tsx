import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

// The privacy policy and the Android permissions (/privacy). Public, so Google's sign-in setup
// and the Play Store can link to it. Keep it true to what the app does when features change.

/** Optional: VITE_CONTACT_EMAIL in .env (docs/4-setup-guide.md). Without it, students use Send feedback. */
const CONTACT_EMAIL: string | undefined = import.meta.env.VITE_CONTACT_EMAIL

const UPDATED = '1 November 2026'

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
            <li>Your data is private to your account. It is never sold or used for ads.</li>
            <li>AI features send only what a request needs to Google's Gemini, through Ekagra's server.</li>
            <li>FocusGuard's app checks stay on your phone.</li>
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
              Feedback you send, with the screen it came from, an optional screenshot and a few device details (web or Android, app build, screen
              size, browser, language and timezone).
            </li>
            <li>
              AI usage: for each AI request, the feature, the model, how much text it used and what it cost. This enforces the daily limit and the
              app's budget.
            </li>
          </List>
          <p>Photos and screenshots you give the AI to read (a syllabus, a task list) are sent for that request and are not stored.</p>
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
            using Ekagra can see it. Connections are encrypted (HTTPS). As the app's operator, the founder has administrator access to the
            database; it is used to run the app (for example to read feedback or fix a problem), not to browse your data.
          </p>
        </Section>

        <Section title="How the AI uses your data">
          <p>
            When you use an AI feature (reading a syllabus or past paper, AI Anchors and the page tutor, lessons and quizzes, task capture, the
            morning brief, custom hustle plans), the app sends only what that request needs, such as the selected text, the page or the photo, to
            Ekagra's server (Supabase Edge Functions). The server asks Google's Gemini API and sends the answer back. Your name and email address
            are not sent with it. Google processes these requests under the Gemini API terms (ai.google.dev/gemini-api/terms). Ekagra does not use
            your data to train AI models.
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
              <strong>Notifications</strong>: FocusGuard's "focus is on" notification and the Launchpad's time's-up reminder.
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
              <strong>Files and photos</strong>: Ekagra has no storage permission. You pick PDFs and screenshots with Android's file picker, and an
              export is saved where you choose.
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
