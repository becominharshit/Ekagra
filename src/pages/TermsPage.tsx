import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

const EFFECTIVE_DATE = 'November 13, 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <div className="grid gap-2.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/** Public Terms of Service (/terms), accessible before and after sign-in. */
export function TermsPage() {
  return (
    <div className="bg-background text-foreground min-h-full">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/">
              <ArrowLeft aria-hidden />
              Back to Ekagra
            </Link>
          </Button>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/pricing" className="underline-offset-4 hover:text-foreground hover:underline">
              Pricing
            </Link>
            <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
              Privacy policy
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto grid max-w-3xl gap-8 px-5 py-8 pb-20">
        <header className="grid gap-2 border-b border-border/60 pb-6">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Effective {EFFECTIVE_DATE}. Plain rules for using Ekagra, Ekagra Studio, Demo Mode, FocusGuard, and paid plans.
          </p>
        </header>

        <Section title="1. Account & Demo Mode">
          <p>
            Ekagra helps university, college, and independent learners organize courses, flashcards, coding exercises, focus blocks, and projects.
            You are responsible for keeping access to your signed-in Google account secure and for accurate information when collaborating with peers.
          </p>
          <p>
            You may use Demo Mode without creating an account. Demo Mode stores data locally in your browser; if you later sign in, you can review
            and merge local Demo data into your cloud account.
          </p>
        </Section>

        <Section title="2. Subscriptions, Pricing & Cancellation">
          <p>
            Ekagra offers a Free Starter tier as well as optional paid tiers (Pro and Campus). Global card, Apple Pay, and Google Pay subscriptions are
            processed securely via Stripe; Indian INR and UPI subscriptions with regional PPP pricing are processed securely via Razorpay.
          </p>
          <p>
            Subscriptions renew automatically at the end of each billing cycle unless canceled beforehand. You can upgrade, download invoices, or
            cancel at period end any time from Pricing or the self-serve billing portal.
          </p>
        </Section>

        <Section title="3. AI Tools, Quotas & Academic Integrity">
          <p>
            Every plan includes daily AI request and monthly token allowances enforced per account. AI tutor explanations, generated notes, mind
            maps, mock test feedback, and speaking feedback are study aids—they may make mistakes and do not guarantee exam results, grades, medical
            outcomes, or income.
          </p>
          <p>
            Always follow your institution&apos;s academic integrity and acceptable-use rules when using AI tools for coursework or assessments.
          </p>
        </Section>

        <Section title="4. FocusGuard & Browser Extension">
          <p>
            On Android, FocusGuard relies strictly on system Usage Access (`PACKAGE_USAGE_STATS`), Display Over Other Apps (`SYSTEM_ALERT_WINDOW`),
            and foreground services to pause distracting apps you select, without using Android Accessibility Services or collecting external keystrokes.
          </p>
          <p>
            The desktop browser extension applies Declarative Net Request (`declarativeNetRequest`) rules configured by you to redirect distracting
            domains toward Ekagra&apos;s Academic Tollbooth during focus intervals.
          </p>
        </Section>

        <Section title="5. Accountability Partners & Study Groups">
          <p>
            Partners and study groups are opt-in and invite-code based. Harassment, impersonation, spam invites, and abusive content are prohibited.
            You may block any user or submit an abuse report directly from Me → Partner and groups; blocking immediately ends shared stats visibility,
            dissolves partner links, and clears mutual nudges.
          </p>
        </Section>

        <Section title="6. Your Content, Export & Deletion">
          <p>
            You retain ownership of all notes, code snippets, syllabi, PDFs, and personal logs you create in Ekagra and Ekagra Studio. You can export
            a machine-readable JSON copy of your records, wipe workspace data, or permanently delete your account (and linked active subscriptions)
            from Me → Account and privacy at any time.
          </p>
        </Section>

        <Section title="7. Service Availability & Updates">
          <p>
            We work continuously to keep Ekagra fast, reliable, and offline-resilient, though scheduled maintenance or upstream provider outages may
            occasionally interrupt cloud features. Material changes to these terms are reflected by the effective date above and announced inside the app.
          </p>
          <p>
            Questions or legal inquiries? See{' '}
            <Link to="/privacy" className="text-foreground underline underline-offset-4">
              Privacy Policy &amp; Contact
            </Link>
            .
          </p>
        </Section>
      </main>
    </div>
  )
}
