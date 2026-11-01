import { useState } from 'react'
import { format } from 'date-fns'
import { BookOpen, ChevronRight, Code2, FlaskConical, Library, LoaderCircle, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, examLabel } from '@/features/academics/labels'
import { useStudy } from '@/features/academics/roadmap'
import { addSampleSubjects } from '@/features/academics/sampleSubjects'
import { SubjectDialog } from '@/features/academics/SubjectDialog'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { priorityLabels } from '@/features/academics/topicTree'
import { PracticeCard } from '@/features/academics/PracticeCard'
import { useAuthStore } from '@/features/auth/authStore'
import { useNow } from '@/hooks/useNow'

export function AcademicsPage() {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const subjects = useSubjects()
  const study = useStudy()
  const [adding, setAdding] = useState(false)
  const now = useNow(60_000)
  const today = format(now, 'yyyy-MM-dd')
  const samples = useAcademicsMutation<void, void>((source) => addSampleSubjects(source, today))

  const topicsOf = (subjectId: string) =>
    study.data?.topics.filter((topic) => topic.subject_id === subjectId && topic.parent_id !== null) ?? []

  return (
    <>
      <PageHeader title="Academics" subtitle="Your subjects and their roadmaps." />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add subject
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/library">
              <Library aria-hidden />
              Library (PDFs)
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/code">
              <Code2 aria-hidden />
              Coding Lab
            </Link>
          </Button>
        </div>

        <PracticeCard now={now} />

        {subjects.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading subjects…
          </p>
        )}
        {subjects.isError && (
          <p role="alert" className="text-sm text-destructive">
            {subjects.error.message}
          </p>
        )}

        {subjects.data?.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4" aria-hidden />
                No subjects yet
              </CardTitle>
              <CardDescription>
                Add a subject, then import its syllabus: the AI turns it into a roadmap of topics on two tracks, one for
                the exam and one for real-world skills.
              </CardDescription>
            </CardHeader>
            {isDemo && (
              <CardContent className="grid gap-2">
                <Button variant="outline" disabled={samples.isPending} onClick={() => samples.mutate()}>
                  {samples.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
                  Add sample subjects (DBMS and Python)
                </Button>
                {samples.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {samples.error.message}
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {subjects.data?.map((subject) => {
          const topics = topicsOf(subject.id)
          const labels = priorityLabels(topics.filter((topic) => topic.track === 'exam'))
          const high = [...labels.values()].filter((label) => label === 'High').length
          return (
            <Link key={subject.id} to={`/academics/subjects/${subject.id}`} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    {subject.code && <Badge variant="outline">{subject.code}</Badge>}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </CardTitle>
                  <CardDescription>
                    {examLabel(subject.exam_date, today)} ·{' '}
                    {topics.length === 0 ? 'No roadmap yet' : `${countLabel(topics.length, 'topic')}${high > 0 ? `, ${high} high priority` : ''}`}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
        {subjects.data && subjects.data.length > 0 && (
          <p className="text-xs text-muted-foreground">Open a subject, then a topic, to study it: lesson, check quiz and flashcards.</p>
        )}
      </div>

      <SubjectDialog open={adding} onOpenChange={setAdding} onSaved={(subject) => navigate(`/academics/subjects/${subject.id}`)} />
    </>
  )
}
