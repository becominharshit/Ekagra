import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, Code2, FilePlus2, LoaderCircle, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
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
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, DIFFICULTY_LABEL } from '@/features/academics/labels'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { problemTitle, readCodeTests, STARTER_PROBLEMS } from '@/features/coding/problems'
import {
  addStarterProblems,
  deleteSnippet,
  newScratchFile,
  openProblem,
  useCodeProblems,
  useSnippets,
  type Snippet,
} from '@/features/coding/snippets'

/** Python practice: problems with tests, and free files. The code runs on the device. */
export function CodingLabPage() {
  const navigate = useNavigate()
  const problems = useCodeProblems()
  const snippets = useSnippets()
  const addStarters = useAcademicsMutation<void, number>((source) => addStarterProblems(source))
  const open = useAcademicsMutation(openProblem)
  const create = useAcademicsMutation<void, Snippet>((source) => newScratchFile(source))
  const remove = useAcademicsMutation(deleteSnippet)
  const [deleting, setDeleting] = useState<Snippet | null>(null)

  const fileFor = new Map((snippets.data ?? []).flatMap((snippet) => (snippet.question_id ? [[snippet.question_id, snippet] as const] : [])))
  const freeFiles = (snippets.data ?? []).filter((snippet) => !snippet.question_id)
  const solved = (problems.data ?? []).filter((problem) => fileFor.get(problem.id)?.passed).length
  const error = addStarters.error ?? open.error ?? create.error ?? remove.error ?? problems.error ?? snippets.error
  const goTo = (file: Snippet) => navigate(`/academics/code/${file.id}`)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Coding Lab" subtitle="Write and run Python right here. Your code runs on this device, not on a server." />

      <div className="grid gap-4">
        <Button className="justify-self-start" disabled={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: goTo })}>
          <FilePlus2 aria-hidden />
          New file
        </Button>
        <p className="text-xs text-muted-foreground">
          The first run downloads Python (about 13 MB). After that it stays on this device and works offline.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="size-4" aria-hidden />
              Practice problems
            </CardTitle>
            <CardDescription>
              {problems.data && problems.data.length > 0
                ? `${solved} of ${problems.data.length} solved. Tests check your answer each time you run it.`
                : 'Small problems with tests that check your answer.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {problems.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
            {problems.data?.length === 0 && (
              <Button variant="outline" className="justify-self-start" disabled={addStarters.isPending} onClick={() => addStarters.mutate()}>
                {addStarters.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Add {STARTER_PROBLEMS.length} practice problems
              </Button>
            )}
            {problems.data?.map((problem) => {
              const file = fileFor.get(problem.id)
              const status = file?.passed ? 'Solved' : file ? 'Started' : 'New'
              return (
                <button
                  key={problem.id}
                  type="button"
                  disabled={open.isPending}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => open.mutate(problem, { onSuccess: goTo })}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{problemTitle(problem.prompt)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[problem.difficulty ? DIFFICULTY_LABEL[problem.difficulty] : null, countLabel(readCodeTests(problem.tests).length, 'test')]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Badge variant={status === 'Solved' ? 'default' : 'secondary'}>{status}</Badge>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your files</CardTitle>
            <CardDescription>Free files to try things out.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {snippets.data && freeFiles.length === 0 && <p className="text-sm text-muted-foreground">None yet. Tap New file to start one.</p>}
            {freeFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-2">
                <Link to={`/academics/code/${file.id}`} className="min-w-0 flex-1 rounded-md px-2 py-1.5 hover:bg-muted">
                  <span className="block truncate font-medium">{file.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {file.last_run_at ? `Last run ${format(new Date(file.last_run_at), 'd MMM, HH:mm')}` : 'Not run yet'}
                  </span>
                </Link>
                <Button variant="ghost" size="icon" aria-label={`Delete ${file.title}`} onClick={() => setDeleting(file)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The file and its code are deleted. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
