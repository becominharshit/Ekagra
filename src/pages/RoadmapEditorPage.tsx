import { useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, Save, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { readSyllabus } from '@/features/academics/academicsAi'
import { clearImport, waitingImport } from '@/features/academics/importHandoff'
import { saveRoadmap, useRoadmap } from '@/features/academics/roadmap'
import { EMPTY_SOURCE, sourceReady, type SourceDraft } from '@/features/academics/source'
import { SourcePicker } from '@/features/academics/SourcePicker'
import { useAcademicsMutation, useSubject, type Subject } from '@/features/academics/subjects'
import { draftProblems, fromAiTree, fromRoadmap, type DraftTree, type Roadmap } from '@/features/academics/topicTree'
import { TopicTreeEditor } from '@/features/academics/TopicTreeEditor'
import { DEMO_AI_NOTE } from '@/features/ai/demoAi'
import { useAuthStore } from '@/features/auth/authStore'
import { useProfile } from '@/features/profile/queries'
import { need, useDataSource } from '@/lib/dataSource'

/** Import a syllabus: the AI makes a roadmap, the student checks it, then it is saved. */
export function SyllabusImportPage() {
  return <RoadmapEditor mode="import" />
}

/** Change a saved roadmap. Saved topics keep their ids (and their past-paper links). */
export function RoadmapEditPage() {
  return <RoadmapEditor mode="edit" />
}

function RoadmapEditor({ mode }: { mode: 'import' | 'edit' }) {
  const { subjectId } = useParams()
  const subject = useSubject(subjectId)
  const roadmap = useRoadmap(subjectId)

  if (subject.isPending || roadmap.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!subject.data || !roadmap.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {subject.error?.message ?? roadmap.error?.message ?? 'This subject was not found.'}
      </p>
    )
  }
  return mode === 'import' ? (
    <ImportFlow subject={subject.data} existing={roadmap.data} />
  ) : (
    <EditFlow subject={subject.data} existing={roadmap.data} />
  )
}

function BackToSubject({ subject }: { subject: Subject }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to={`/academics/subjects/${subject.id}`}>
        <ArrowLeft aria-hidden />
        {subject.name}
      </Link>
    </Button>
  )
}

function ImportFlow({ subject, existing }: { subject: Subject; existing: Roadmap }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { source } = useDataSource()
  const profile = useProfile()
  // A syllabus added through the Add inbox arrives filled in.
  const [input, setInput] = useState<SourceDraft>(() => waitingImport(subject.id, 'syllabus')?.source ?? EMPTY_SOURCE)
  useEffect(() => clearImport(subject.id, 'syllabus'), [subject.id])
  const [draft, setDraft] = useState<DraftTree | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function read() {
    setReading(true)
    setProblem(null)
    try {
      const tree = await readSyllabus(need(source), {
        subjectName: subject.name,
        program: profile.data?.program ?? null,
        year: profile.data?.year ?? null,
        examDate: subject.exam_date,
        text: input.text.trim() || undefined,
        file: input.file ?? undefined,
      })
      setDraft(fromAiTree(tree))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The syllabus could not be read. Please try again.')
    } finally {
      setReading(false)
    }
  }

  if (draft) {
    return (
      <ReviewAndSave
        subject={subject}
        draft={draft}
        onChange={setDraft}
        replacing={existing.topics.filter((topic) => topic.parent_id !== null).length}
        note={isDemo ? DEMO_AI_NOTE : 'Made by the AI from your syllabus. Check it: change anything that looks wrong.'}
        onStartOver={() => setDraft(null)}
      />
    )
  }

  return (
    <>
      <BackToSubject subject={subject} />
      <PageHeader title="Import syllabus" subtitle={`${subject.name}: the AI turns it into a roadmap you can check before saving.`} />
      <Card>
        <CardContent className="grid gap-4">
          <SourcePicker
            value={input}
            onChange={setInput}
            isDemo={isDemo}
            what="syllabus"
            placeholder={'Paste the syllabus, for example:\nUnit 1: ER model, relational algebra\nUnit 2: SQL, transactions'}
          />
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <Button disabled={!sourceReady(input) || reading} onClick={() => void read()}>
            {reading ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {reading ? 'Reading the syllabus… (up to a minute)' : 'Make my roadmap'}
          </Button>
          {isDemo && <p className="text-xs text-muted-foreground">{DEMO_AI_NOTE}</p>}
        </CardContent>
      </Card>
    </>
  )
}

function EditFlow({ subject, existing }: { subject: Subject; existing: Roadmap }) {
  const [draft, setDraft] = useState(() => fromRoadmap(existing))
  return <ReviewAndSave subject={subject} draft={draft} onChange={setDraft} replacing={0} note={null} />
}

interface ReviewAndSaveProps {
  subject: Subject
  draft: DraftTree
  onChange: (next: DraftTree) => void
  /** How many saved topics an import replaces (0 when editing). */
  replacing: number
  note: string | null
  onStartOver?: () => void
}

function ReviewAndSave({ subject, draft, onChange, replacing, note, onStartOver }: ReviewAndSaveProps) {
  const navigate = useNavigate()
  const save = useAcademicsMutation(saveRoadmap)
  const [problems, setProblems] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  function store() {
    save.mutate({ subjectId: subject.id, draft }, { onSuccess: () => navigate(`/academics/subjects/${subject.id}`, { replace: true }) })
  }

  function trySave() {
    const issues = draftProblems(draft)
    setProblems(issues)
    if (issues.length > 0) return
    if (replacing > 0) setConfirming(true)
    else store()
  }

  return (
    <>
      <BackToSubject subject={subject} />
      <PageHeader title={onStartOver ? 'Check your roadmap' : 'Edit roadmap'} subtitle={subject.name} />
      <div className="grid gap-4">
        {note && (
          <Card size="sm">
            <CardHeader>
              <CardDescription>{note}</CardDescription>
            </CardHeader>
          </Card>
        )}
        <TopicTreeEditor value={draft} onChange={onChange} />
        {(problems.length > 0 || save.error) && (
          <div role="alert" className="grid gap-1 text-sm text-destructive">
            {problems.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
            {save.error && <p>{save.error.message}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" disabled={save.isPending} onClick={trySave}>
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Save roadmap
          </Button>
          {onStartOver && (
            <Button variant="outline" onClick={onStartOver}>
              Start over
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current roadmap?</AlertDialogTitle>
            <AlertDialogDescription>
              {subject.name} already has {replacing} topics. Saving replaces them, and past-paper questions linked to them
              are deleted too. To change a few topics instead, use Edit roadmap.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the current one</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={store}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
