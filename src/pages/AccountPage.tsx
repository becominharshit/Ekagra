import { useState } from 'react'
import { ArrowLeft, Download, LoaderCircle, RotateCcw, ShieldCheck, Trash2, UserX } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildExport, forgetOnDevice, useDeleteOnServer } from '@/features/account/account'
import { useAuthStore } from '@/features/auth/authStore'
import { useResetDemoData } from '@/features/profile/queries'
import { need, useDataSource } from '@/lib/dataSource'
import { saveTextFile } from '@/lib/native/fileSaver'

/** Me → Account and privacy (/me/account): the privacy policy, a copy of all data, wiping it, deleting the account. */
export function AccountPage() {
  const isDemo = useAuthStore((state) => state.status === 'demo')

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/me">
          <ArrowLeft aria-hidden />
          Me
        </Link>
      </Button>
      <PageHeader title="Account and privacy" subtitle="What Ekagra keeps, a copy of all of it, and deleting it." />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>
              Your data is private to your account. AI features send only what a request needs to Google's Gemini, through Ekagra's server. The
              privacy policy explains it all, with every Android permission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/privacy">
                <ShieldCheck aria-hidden />
                Privacy policy and permissions
              </Link>
            </Button>
          </CardContent>
        </Card>
        <ExportCard isDemo={isDemo} />
        {isDemo ? <DemoResetCard /> : <DeleteCard />}
      </div>
    </>
  )
}

type ExportState = { busy: false; message: string | null; error: string | null } | { busy: true; done: number; total: number }

function ExportCard({ isDemo }: { isDemo: boolean }) {
  const { source } = useDataSource()
  const user = useAuthStore((state) => state.user)
  const [state, setState] = useState<ExportState>({ busy: false, message: null, error: null })

  async function run() {
    setState({ busy: true, done: 0, total: 0 })
    try {
      const file = await buildExport(need(source), user, { onProgress: (done, total) => setState({ busy: true, done, total }) })
      const saved = await saveTextFile(file.name, 'application/json', file.json)
      const rows = `${file.rows.toLocaleString()} ${file.rows === 1 ? 'row' : 'rows'}`
      setState({ busy: false, message: saved ? `Saved ${file.name} (${rows}).` : 'Not saved: no place was picked.', error: null })
    } catch (error) {
      setState({ busy: false, message: null, error: error instanceof Error ? error.message : 'The export failed. Please try again.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export all data</CardTitle>
        <CardDescription>
          One JSON file with everything you added: profile, routine, subjects, topics, flashcards, mistakes, tasks, hustles, clients, money records,
          focus sessions, check-ins, feedback and the rest.{isDemo && " In Demo Mode, that's what is on this device."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button variant="outline" disabled={state.busy} onClick={() => void run()}>
          {state.busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {state.busy ? (state.total > 0 ? `Exporting… ${state.done} of ${state.total} tables` : 'Exporting…') : 'Export all data'}
        </Button>
        {!state.busy && state.message && (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message}
          </p>
        )}
        {!state.busy && state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const DELETE_TEXT = {
  data: {
    button: 'Wipe my data',
    title: 'Wipe all your data?',
    description:
      "This deletes everything you've added: subjects, PDFs, flashcards, mistakes, tasks, hustles, money records, focus history, check-ins and feedback. Your account stays, and you'll set up the app again. Your AI usage history stays too, because it counts the daily limit.",
    busy: 'Wiping…',
  },
  account: {
    button: 'Delete my account',
    title: 'Delete your account?',
    description:
      'This deletes your account and all your data, files included, and signs you out. You can sign up again later, but nothing comes back.',
    busy: 'Deleting…',
  },
} as const

function DeleteCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wipe data or delete your account</CardTitle>
        <CardDescription>Export your data first if you want a copy. Neither can be undone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ConfirmDelete mode="data" />
        <ConfirmDelete mode="account" />
      </CardContent>
    </Card>
  )
}

/** A delete button that asks first: the student types DELETE. */
function ConfirmDelete({ mode }: { mode: 'data' | 'account' }) {
  const text = DELETE_TEXT[mode]
  const remove = useDeleteOnServer(mode)
  const [typed, setTyped] = useState('')
  // Phone keyboards often start with a capital letter: "Delete" counts too.
  const confirmed = typed.trim().toUpperCase() === 'DELETE'

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          setTyped('')
          remove.reset()
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={mode === 'account' ? 'destructive' : 'outline'} className={mode === 'data' ? 'text-destructive' : undefined}>
          {mode === 'account' ? <UserX aria-hidden /> : <Trash2 aria-hidden />}
          {text.button}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`confirm-${mode}`}>Type DELETE to confirm</Label>
          <Input
            id={`confirm-${mode}`}
            autoComplete="off"
            autoCapitalize="characters"
            value={typed}
            disabled={remove.isPending}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {remove.error && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Keep my data</AlertDialogCancel>
          <Button variant="destructive" disabled={!confirmed || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            {remove.isPending ? text.busy : text.button}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Demo Mode has no account: everything is on this device, and resetting deletes it. */
function DemoResetCard() {
  const resetDemoData = useResetDemoData()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset demo data</CardTitle>
        <CardDescription>
          Demo Mode has no account: everything is on this device. Resetting deletes all of it (PDFs and screenshots too), and setup starts again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive">
              <RotateCcw aria-hidden />
              Reset demo data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the demo profile, routine, subjects, PDFs, flashcards, tasks, hustles and everything else from this device. You'll go
                through setup again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my data</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void forgetOnDevice().then(resetDemoData)}>
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
